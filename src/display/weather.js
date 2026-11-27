// Clima para o display (funções puras): endereços do Open-Meteo, leitura da
// resposta e o resumo que o card mostra (agora, chance de chuva por hora, dias).
//
// Open-Meteo (open-meteo.com): previsão gratuita, sem chave e sem cadastro.
// Pedimos os horários no fuso do navegador (o mesmo do relógio do display; o
// script da imagem ajusta o fuso do navegador para o da casa), então "15:00"
// da resposta é 15:00 na tela.

export const FORECAST_API = 'https://api.open-meteo.com/v1/forecast';
export const GEOCODE_API = 'https://geocoding-api.open-meteo.com/v1/search';

const pad = (n) => String(n).padStart(2, '0');
const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/**
 * Códigos de tempo da OMM (WMO) → texto e ícone (nome do ícone lucide).
 * https://open-meteo.com/en/docs (seção "WMO Weather interpretation codes").
 */
const CODES = [
  [[0], 'Céu limpo', 'sun'],
  [[1], 'Poucas nuvens', 'sun-cloud'],
  [[2], 'Parcialmente nublado', 'sun-cloud'],
  [[3], 'Nublado', 'cloud'],
  [[45, 48], 'Neblina', 'fog'],
  [[51, 53, 55], 'Garoa', 'drizzle'],
  [[56, 57], 'Garoa gelada', 'drizzle'],
  [[61], 'Chuva fraca', 'rain'],
  [[63], 'Chuva', 'rain'],
  [[65], 'Chuva forte', 'rain-heavy'],
  [[66, 67], 'Chuva gelada', 'rain'],
  [[71, 73, 75, 77], 'Neve', 'snow'],
  [[80], 'Pancadas fracas', 'rain'],
  [[81], 'Pancadas de chuva', 'rain'],
  [[82], 'Pancadas fortes', 'rain-heavy'],
  [[85, 86], 'Neve', 'snow'],
  [[95], 'Trovoadas', 'storm'],
  [[96, 99], 'Trovoadas com granizo', 'hail'],
];

/** { label, icon } de um código de tempo. À noite, céu limpo/poucas nuvens viram lua. */
export function weatherInfo(code, isDay = true) {
  const hit = CODES.find(([codes]) => codes.includes(Number(code)));
  if (!hit) return { label: '—', icon: 'cloud' };
  let icon = hit[2];
  if (!isDay && icon === 'sun') icon = 'moon';
  if (!isDay && icon === 'sun-cloud') icon = 'moon-cloud';
  return { label: hit[1], icon };
}

/** Fuso do navegador (o mesmo usado por todayISO e pelo relógio do display). */
export function browserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'auto';
  } catch {
    return 'auto';
  }
}

export const isPlace = (p) => !!p && Number.isFinite(Number(p.lat)) && Number.isFinite(Number(p.lon));

export function forecastUrl(place, timeZone = 'auto') {
  const q = new URLSearchParams({
    latitude: Number(place.lat).toFixed(4),
    longitude: Number(place.lon).toFixed(4),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,is_day',
    hourly: 'temperature_2m,precipitation_probability,precipitation,weather_code,is_day',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,uv_index_max,sunrise,sunset,wind_speed_10m_max',
    timezone: timeZone || 'auto',
    forecast_days: '8',
  });
  return `${FORECAST_API}?${q}`;
}

export function geocodeUrl(query) {
  const q = new URLSearchParams({ name: String(query).trim(), count: '8', language: 'pt', format: 'json' });
  return `${GEOCODE_API}?${q}`;
}

/** Resposta da busca de cidades → [{ name, label, lat, lon }]. */
export function parseGeocode(json) {
  return (json?.results ?? [])
    .filter((r) => Number.isFinite(r.latitude) && Number.isFinite(r.longitude))
    .map((r) => ({
      name: r.name,
      label: [r.name, r.admin1 && r.admin1 !== r.name ? r.admin1 : null, r.country].filter(Boolean).join(', '),
      lat: Math.round(r.latitude * 10000) / 10000,
      lon: Math.round(r.longitude * 10000) / 10000,
    }));
}

// ---------- Resumo para o card ----------

const localKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:00`;
const hourOf = (iso) => Number(String(iso).slice(11, 13));
/** { desc, icon } — nomes que não colidem com o rótulo do dia/hora. */
const sky = (code, isDay) => {
  const { label, icon } = weatherInfo(code, isDay);
  return { desc: label, icon };
};
const round = (n) => (Number.isFinite(Number(n)) && n !== null ? Math.round(Number(n)) : null);
const num = (n) => (Number.isFinite(Number(n)) && n !== null ? Number(n) : null);

/** Milímetros de chuva: "0,4 mm", "12 mm". */
export function formatMm(mm) {
  const v = num(mm);
  if (v == null) return '';
  const r = v < 10 ? Math.round(v * 10) / 10 : Math.round(v);
  return `${String(r).replace('.', ',')} mm`;
}

/**
 * Vai chover? Olha as horas que faltam de hoje (ou as próximas 12 h, se o dia
 * estiver acabando) e devolve um aviso curto.
 * level: 'yes' (≥ 50%), 'maybe' (≥ 25%), 'no'.
 */
export function rainOutlook(hours, today) {
  const rest = hours.filter((h) => h.time.startsWith(today));
  const useToday = rest.length >= 4;
  const win = useToday ? rest : hours.slice(0, 12);
  const when = useToday ? 'hoje' : 'nas próximas horas';
  if (!win.length) return null;
  let peak = win[0];
  for (const h of win) if ((h.prob ?? 0) > (peak.prob ?? 0)) peak = h;
  const max = peak.prob ?? 0;
  const mm = win.reduce((a, h) => a + (h.mm ?? 0), 0);
  if (max >= 50) {
    const start = win.find((h) => (h.prob ?? 0) >= 50);
    const now = start === win[0];
    return {
      level: 'yes',
      max,
      mm,
      text: now ? `Chuva provável agora (${max}%)` : `Chuva provável a partir das ${hourOf(start.time)}h (até ${max}%)`,
      when,
    };
  }
  if (max >= 25) return { level: 'maybe', max, mm, text: `Pode chover ${when}: ${max}% às ${hourOf(peak.time)}h`, when };
  return { level: 'no', max, mm, text: `Sem chuva prevista ${when}`, when };
}

const STEPS = [1, 2, 3, 4, 6, 8, 12];

/**
 * Chance de chuva ao longo de HOJE (pedido do dono, 27/11/2026): do horário atual até as
 * 23h, com a hora do relógio (14h, 15h, 18h…), sem "daqui a 2 h". Horários que já passaram
 * não aparecem — somem na próxima atualização da tela.
 * Colunas nas horas múltiplas do intervalo (3 em 3: 9h, 12h, 15h…); a primeira é a hora
 * atual. Cada coluna mostra a MAIOR chance do seu bloco de horas, para nenhuma pancada sumir
 * entre uma coluna e outra. Se não couber em `o.hours` colunas, o intervalo aumenta sozinho.
 * @param ahead horas a partir da atual: [{ time, hour, prob, mm, temp, code, isDay }]
 */
export function rainAcrossToday(ahead, today, o = {}) {
  const max = Math.max(0, Math.min(12, Number(o.hours ?? 8)));
  const list = ahead.filter((h) => String(h.time).startsWith(today));
  if (!max || !list.length) return [];
  const h0 = list[0].hour;
  const blocks = (st) => {
    const starts = [h0];
    for (let h = (Math.floor(h0 / st) + 1) * st; h <= 23; h += st) starts.push(h);
    return starts;
  };
  const wanted = Math.max(1, Math.min(12, Number(o.hourStep) || 1));
  const st = STEPS.find((s) => s >= wanted && blocks(s).length <= max) ?? 24;
  const starts = blocks(st);
  return starts.map((start, i) => {
    const end = starts[i + 1] ?? 24;
    const inBlock = list.filter((h) => h.hour >= start && h.hour < end);
    const first = inBlock[0] ?? list.find((h) => h.hour === start);
    const probs = inBlock.map((h) => h.prob).filter((p) => p != null);
    const mms = inBlock.map((h) => h.mm).filter((m) => m != null);
    return {
      ...first,
      label: `${start}h`,
      prob: probs.length ? Math.max(...probs) : null,
      mm: mms.length ? Math.round(mms.reduce((a, b) => a + b, 0) * 10) / 10 : null,
      step: st,
    };
  });
}

/**
 * Resposta do Open-Meteo → o que o card desenha.
 * @param raw   JSON da previsão
 * @param now   instante da tela (Date)
 * @param today data de hoje na casa (YYYY-MM-DD)
 * @param o     { hours, hourStep, days }
 */
export function forecastView(raw, now, today, o = {}) {
  const H = raw?.hourly ?? {};
  const D = raw?.daily ?? {};
  const C = raw?.current ?? {};
  const times = H.time ?? [];
  const nowKey = localKey(now);
  let i0 = times.findIndex((t) => t >= nowKey);
  if (i0 < 0) i0 = times.length;

  const hourAt = (i) => ({
    time: times[i],
    hour: hourOf(times[i]),
    temp: round(H.temperature_2m?.[i]),
    prob: round(H.precipitation_probability?.[i]),
    mm: num(H.precipitation?.[i]),
    code: H.weather_code?.[i],
    isDay: H.is_day?.[i] !== 0,
  });
  const ahead = [];
  for (let i = i0; i < times.length && ahead.length < 24; i++) ahead.push(hourAt(i));

  const hours = rainAcrossToday(ahead, today, o).map((h) => ({ ...h, ...sky(h.code, h.isDay) }));

  const dTimes = D.time ?? [];
  let d0 = dTimes.indexOf(today);
  if (d0 < 0) d0 = dTimes.findIndex((t) => t > today);
  const nDays = Math.max(0, Math.min(7, Number(o.days ?? 3)));
  const dayAt = (i, k) => {
    const date = dTimes[i];
    const dt = new Date(`${date}T12:00:00`);
    return {
      date,
      label: date === today ? 'Hoje' : k === 1 && dTimes[d0] === today ? 'Amanhã' : `${WEEKDAYS[dt.getDay()]} ${dt.getDate()}`,
      short: date === today ? 'Hoje' : WEEKDAYS[dt.getDay()],
      max: round(D.temperature_2m_max?.[i]),
      min: round(D.temperature_2m_min?.[i]),
      prob: round(D.precipitation_probability_max?.[i]),
      mm: num(D.precipitation_sum?.[i]),
      uv: round(D.uv_index_max?.[i]),
      wind: round(D.wind_speed_10m_max?.[i]),
      sunrise: String(D.sunrise?.[i] ?? '').slice(11, 16),
      sunset: String(D.sunset?.[i] ?? '').slice(11, 16),
      ...sky(D.weather_code?.[i], true),
    };
  };
  const days = [];
  for (let i = Math.max(0, d0); d0 >= 0 && i < dTimes.length && days.length < nDays; i++) days.push(dayAt(i, days.length));

  // Resumo de hoje (máx./mín., UV, sol) não depende de quantos dias o card mostra.
  const todayDaily = d0 >= 0 && dTimes[d0] === today ? dayAt(d0, 0) : null;
  // "Agora": o dado atual da API; se a tela é para outro horário (imagem gerada
  // antes da hora), usa a previsão daquela hora.
  const currentKey = String(C.time ?? '').slice(0, 13);
  const useCurrent = C.time && currentKey === nowKey.slice(0, 13);
  const h0 = ahead[0];
  const current =
    useCurrent || !h0
      ? {
          temp: round(C.temperature_2m),
          feels: round(C.apparent_temperature),
          humidity: round(C.relative_humidity_2m),
          wind: round(C.wind_speed_10m),
          ...sky(C.weather_code, C.is_day !== 0),
        }
      : { temp: h0.temp, feels: null, humidity: round(C.relative_humidity_2m), wind: round(C.wind_speed_10m), ...sky(h0.code, h0.isDay) };

  return {
    current,
    today: todayDaily,
    rain: rainOutlook(ahead, today),
    hours,
    days,
  };
}
