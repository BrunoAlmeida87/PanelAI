// Agenda da tela física (kit TRMNL 7,5" DIY com o programa do PanelAI) e endereço de publicação da imagem.
//
// Funções puras, sem navegador: usadas pelo app (Configurações → Tela e-ink) e
// pelo script que gera a imagem no GitHub (scripts/display-png.mjs).
//
// Os horários são do relógio da casa (fuso `timeZone`, ex.: America/Sao_Paulo).
// O aparelho recebe as próximas atualizações já convertidas em segundos UTC
// (epoch), então não precisa saber de fuso nem de horário de verão.
//
// Formato guardado em settings.displayDevice:
//   { times: ['06:00', '18:00'], timeZone: 'America/Sao_Paulo', code: 'Ab3…' | null }
//   - times: horários de atualização (HH:MM, sem repetição, em ordem). Vazio =
//     a tela só atualiza quando alguém aperta o botão do aparelho.
//   - code: código secreto do endereço da imagem. null = publicação desligada.

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
export const MAX_TIMES = 8;
export const PUBLISH_CODE_LENGTH = 32;

/** Pasta (no site publicado) onde ficam as imagens: <site>/tela/<código>/… */
export const PUBLISH_DIR = 'tela';
export const IMAGE_FILE = 'tela.png';
export const CONFIG_FILE = 'config.json';
/** Versão do formato do config.json lido pelo aparelho (esphome/panelai-tela.yaml). */
export const DEVICE_CONFIG_VERSION = 1;

// Congelado: entra em DEFAULT_SETTINGS e é compartilhado (nunca alterar no lugar).
export const DEFAULT_DISPLAY_DEVICE = Object.freeze({ times: Object.freeze(['06:00']), timeZone: DEFAULT_TIMEZONE, code: null });

const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
const CODE_RE = /^[A-Za-z0-9]{24,64}$/;
const TIME_RE = /^(\d{1,2}):(\d{2})$/;
const DAY_MS = 86_400_000;
const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const pad = (n) => String(n).padStart(2, '0');

// ---------- Validação ----------

/** "6:00" → "06:00". Devolve null se não for um horário válido. */
export function normalizeTime(value) {
  const m = TIME_RE.exec(String(value ?? '').trim());
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  return `${pad(hour)}:${pad(minute)}`;
}

/** Horários válidos, sem repetição, em ordem (no máximo MAX_TIMES). */
export function normalizeTimes(list) {
  const set = new Set();
  for (const t of Array.isArray(list) ? list : []) {
    const n = normalizeTime(t);
    if (n) set.add(n);
  }
  return [...set].sort().slice(0, MAX_TIMES);
}

export function isValidTimeZone(tz) {
  if (typeof tz !== 'string' || !tz) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

export const isValidPublishCode = (code) => typeof code === 'string' && CODE_RE.test(code);

/** Configuração da tela sempre num formato válido (dados antigos ou incompletos viram o padrão). */
export function normalizeDisplayDevice(device) {
  const d = device && typeof device === 'object' ? device : {};
  return {
    times: Array.isArray(d.times) ? normalizeTimes(d.times) : [...DEFAULT_DISPLAY_DEVICE.times],
    timeZone: isValidTimeZone(d.timeZone) ? d.timeZone : DEFAULT_TIMEZONE,
    code: isValidPublishCode(d.code) ? d.code : null,
  };
}

/** Fuso do aparelho em que o app está aberto (ou o padrão). */
export function localTimeZone() {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return isValidTimeZone(tz) ? tz : DEFAULT_TIMEZONE;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

/**
 * Código secreto do endereço da imagem: 32 letras e números (~190 bits).
 * Usa o gerador criptográfico; o descarte dos bytes ≥ 248 evita viés.
 * `randomBytes` pode ser trocado nos testes.
 */
export function newPublishCode(randomBytes = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  let out = '';
  while (out.length < PUBLISH_CODE_LENGTH) {
    for (const b of randomBytes(PUBLISH_CODE_LENGTH)) {
      if (b < 248 && out.length < PUBLISH_CODE_LENGTH) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
    }
  }
  return out;
}

/** Endereço base da imagem para o aparelho: <site>/tela/<código> (sem barra no fim). */
export function publishUrl(siteUrl, code) {
  return `${String(siteUrl).replace(/[#?].*$/, '').replace(/\/?$/, '/')}${PUBLISH_DIR}/${code}`;
}

// ---------- Fusos horários ----------

const formatters = new Map();
function formatter(timeZone) {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Data e hora do relógio local, no fuso, de um instante (ms). */
export function zonedParts(ms, timeZone) {
  const p = {};
  for (const { type, value } of formatter(timeZone).formatToParts(new Date(ms))) p[type] = value;
  return { year: Number(p.year), month: Number(p.month), day: Number(p.day), hour: Number(p.hour) % 24, minute: Number(p.minute), second: Number(p.second) };
}

/** Diferença (ms) entre o relógio do fuso e o UTC naquele instante. */
function offsetAt(ms, timeZone) {
  const p = zonedParts(ms, timeZone);
  const wholeSecond = ms - (((ms % 1000) + 1000) % 1000);
  return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - wholeSecond;
}

/**
 * Instante (ms) de uma data e hora do relógio local no fuso. Duas passadas
 * acertam a virada do horário de verão; um horário que não existe (o relógio
 * pula, ex.: 02:30 no dia em que vai de 02:00 para 03:00) cai depois do pulo.
 */
export function zonedTimeToMs({ year, month, day, hour = 0, minute = 0 }, timeZone) {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  const a = guess - offsetAt(guess, timeZone);
  const b = guess - offsetAt(a, timeZone);
  if (a === b) return a;
  // Perto da virada: fica com o candidato cujo relógio local é o pedido.
  for (const ms of [b, a]) {
    const p = zonedParts(ms, timeZone);
    if (p.hour === hour && p.minute === minute) return ms;
  }
  return Math.max(a, b);
}

/** "YYYY-MM-DD" do instante no fuso. */
export function zonedDateISO(ms, timeZone) {
  const p = zonedParts(ms, timeZone);
  return `${p.year}-${pad(p.month)}-${pad(p.day)}`;
}

// ---------- Agenda ----------

/**
 * Próximas atualizações (ms, em ordem) depois de `fromMs`, para os próximos
 * `days` dias, no máximo `limit` itens.
 */
export function nextUpdateTimes(device, fromMs, { days = 8, limit = 24 } = {}) {
  const { times, timeZone } = normalizeDisplayDevice(device);
  if (!times.length) return [];
  const start = zonedParts(fromMs, timeZone);
  const out = new Set();
  for (let d = 0; d <= days; d++) {
    // Conta os dias em UTC para não depender do fuso de quem roda o código.
    const day = new Date(Date.UTC(start.year, start.month - 1, start.day + d));
    for (const t of times) {
      const [hour, minute] = t.split(':').map(Number);
      const ms = zonedTimeToMs({ year: day.getUTCFullYear(), month: day.getUTCMonth() + 1, day: day.getUTCDate(), hour, minute }, timeZone);
      if (ms > fromMs) out.add(ms);
    }
  }
  return [...out].sort((a, b) => a - b).slice(0, limit);
}

/**
 * Momento que a imagem representa. Se a próxima atualização está perto
 * (dentro de `windowMs`), a imagem já é gerada "para" ela: uma tela que
 * atualiza à meia-noite mostra o cardápio do dia novo, não o da véspera.
 */
export function renderMoment(device, nowMs, windowMs = 60 * 60_000) {
  const next = nextUpdateTimes(device, nowMs, { limit: 1 })[0];
  return next != null && next - nowMs <= windowMs ? next : nowMs;
}

/**
 * Conteúdo do config.json lido pelo aparelho a cada vez que acorda.
 * Os nomes dos campos são parte do contrato com esphome/panelai-tela.yaml:
 * mudar algum exige mudar o aparelho também (e subir DEVICE_CONFIG_VERSION).
 */
export function buildDeviceConfig({ device, nowMs, referenceMs = nowMs, width, height, limit = 24 }) {
  const dev = normalizeDisplayDevice(device);
  const sec = (ms) => Math.floor(ms / 1000);
  return {
    versao: DEVICE_CONFIG_VERSION,
    gerado: sec(nowMs),
    referencia: sec(referenceMs),
    horarios: dev.times,
    fuso: dev.timeZone,
    proximas: nextUpdateTimes(dev, nowMs, { limit }).map(sec),
    largura: width,
    altura: height,
  };
}

/** "hoje às 18:00", "amanhã às 06:00", "ontem às 05:47" ou "qua, 26/11 às 06:00". */
export function describeUpdate(ms, nowMs, timeZone) {
  const p = zonedParts(ms, timeZone);
  const today = zonedParts(nowMs, timeZone);
  const dayDiff = Math.round((Date.UTC(p.year, p.month - 1, p.day) - Date.UTC(today.year, today.month - 1, today.day)) / DAY_MS);
  const hm = `${pad(p.hour)}:${pad(p.minute)}`;
  if (dayDiff === 0) return `hoje às ${hm}`;
  if (dayDiff === 1) return `amanhã às ${hm}`;
  if (dayDiff === -1) return `ontem às ${hm}`;
  const weekday = WEEKDAYS[new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay()];
  return `${weekday}, ${pad(p.day)}/${pad(p.month)} às ${hm}`;
}

/** "06:00", "06:00 e 18:00", "06:00, 12:00 e 18:00". */
export function formatTimes(times) {
  const list = normalizeTimes(times);
  if (list.length <= 1) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')} e ${list[list.length - 1]}`;
}
