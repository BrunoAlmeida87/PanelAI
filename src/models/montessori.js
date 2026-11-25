// Montessori: faixas de idade, categorias, idade da criança, registros das
// atividades e sugestões do dia. Só regras puras (sem estado nem interface),
// testadas em tests/unit/montessori.test.js.
//
// A biblioteca de atividades fica em src/data/montessori_activities.json e
// os registros de cada criança ficam em outra coleção (montessoriLogs): o
// catálogo pode crescer ou mudar sem mexer no histórico. Uma atividade que
// saia do catálogo continua aparecendo no histórico pelo id.

import { addDays, diffDays, isValidISODate, parseISODate, toISODate } from '../utils/dates.js';
import { uid } from '../utils/id.js';

// ---------- Vocabulário (ids estáveis, gravados nos registros) ----------

/** Faixas do livro (meses completos). A última vai até os 3 anos. */
export const AGE_BANDS = [
  { id: '0-3', label: '0 a 3 meses', min: 0, max: 3 },
  { id: '3-6', label: '3 a 6 meses', min: 3, max: 6 },
  { id: '6-9', label: '6 a 9 meses', min: 6, max: 9 },
  { id: '9-12', label: '9 a 12 meses', min: 9, max: 12 },
  { id: '12-18', label: '12 a 18 meses', min: 12, max: 18 },
  { id: '18-24', label: '18 a 24 meses', min: 18, max: 24 },
  { id: '24-36', label: '24 a 36 meses', min: 24, max: 36 },
];
export const bandById = (id) => AGE_BANDS.find((b) => b.id === id) ?? null;

/** Faixa de uma idade em meses (antes de 0 → a primeira; 36 ou mais → a última). */
export function bandOf(months) {
  return AGE_BANDS.find((b) => months < b.max) ?? AGE_BANDS[AGE_BANDS.length - 1];
}

export const MONTESSORI_CATEGORIES = [
  { id: 'coordenacao', label: 'Coordenação visual e motora', short: 'Coordenação', color: '#5f7f96' },
  { id: 'formas-cores', label: 'Formas e cores', short: 'Formas e cores', color: '#b8893a' },
  { id: 'linguagem', label: 'Linguagem e percepção auditiva', short: 'Linguagem', color: '#8a78a8' },
  { id: 'tatil', label: 'Percepção tátil', short: 'Tato', color: '#b86f63' },
  { id: 'cognitivo', label: 'Estímulo cognitivo', short: 'Cognitivo', color: '#4f8794' },
  { id: 'vida-pratica', label: 'Atividades práticas do cotidiano', short: 'Vida prática', color: '#52765d' },
];
export const montessoriCategory = (id) => MONTESSORI_CATEGORIES.find((c) => c.id === id) ?? null;

export const INTEREST_LEVELS = [
  { id: 'baixo', label: 'Baixo' },
  { id: 'medio', label: 'Médio' },
  { id: 'alto', label: 'Alto' },
];
export const interestLabel = (id) => INTEREST_LEVELS.find((x) => x.id === id)?.label ?? '—';

export const AUTONOMY_LEVELS = [
  { id: 'observou', label: 'Observou' },
  { id: 'ajuda', label: 'Realizou com ajuda' },
  { id: 'sozinha', label: 'Realizou sozinha' },
];
export const autonomyLabel = (id) => AUTONOMY_LEVELS.find((x) => x.id === id)?.label ?? '—';

/** Quantas sugestões por dia. */
export const DAILY_COUNT = 3;
/** Máximo de atividades escolhidas para um dia (sugestões + incluídas à mão). */
export const MAX_PER_DAY = 6;

// ---------- Idade ----------

function daysInMonth(year, month) {
  return new Date(year, month + 1, 0).getDate();
}

/** Mesma data `n` meses depois (31/01 + 1 mês → 28 ou 29/02). */
function addMonths(iso, n) {
  const d = parseISODate(iso);
  const y = d.getFullYear();
  const m = d.getMonth() + n;
  const target = new Date(y, m, 1);
  target.setDate(Math.min(d.getDate(), daysInMonth(target.getFullYear(), target.getMonth())));
  return toISODate(target);
}

/**
 * Idade em meses completos e dias entre `birth` e `date` (datas AAAA-MM-DD).
 * Antes do nascimento: { months: -1, days: dias que faltam (negativo) }.
 */
export function agePartsBetween(birth, date) {
  const total = diffDays(birth, date);
  if (total < 0) return { months: -1, days: total, totalDays: total };
  const b = parseISODate(birth);
  const d = parseISODate(date);
  let months = (d.getFullYear() - b.getFullYear()) * 12 + (d.getMonth() - b.getMonth());
  while (months > 0 && addMonths(birth, months) > date) months--;
  return { months, days: diffDays(addMonths(birth, months), date), totalDays: total };
}

/** Semanas de gestação que contam como prematuro para a idade corrigida. */
const PRETERM_MAX_WEEKS = 36;
/** A idade corrigida é usada até os 2 anos de idade real (prática da pediatria). */
const CORRECT_UNTIL_MONTHS = 24;

/**
 * Idade da criança na data. Para quem nasceu prematuro (gestationWeeks ≤ 36),
 * até os 2 anos as sugestões usam a idade corrigida (como se tivesse nascido
 * com 40 semanas); `real` guarda a idade de calendário.
 */
export function childAge(child, date) {
  if (!child?.birthDate || !isValidISODate(child.birthDate) || !isValidISODate(date)) return null;
  const real = agePartsBetween(child.birthDate, date);
  const gw = Number(child.gestationWeeks);
  if (gw >= 22 && gw <= PRETERM_MAX_WEEKS && real.months >= 0 && real.months < CORRECT_UNTIL_MONTHS) {
    const corrected = agePartsBetween(addDays(child.birthDate, (40 - gw) * 7), date);
    return { ...(corrected.months < 0 ? { months: 0, days: 0, totalDays: 0 } : corrected), corrected: true, real };
  }
  return { ...real, corrected: false, real };
}

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

/** "1 ano e 4 meses", "5 meses", "2 meses e 3 dias", "12 dias". */
export function formatAge(age) {
  if (!age) return '';
  if (age.months < 0) return 'ainda não nasceu';
  const { months, days } = age;
  if (months === 0) return days === 0 ? 'recém-nascido' : plural(days, 'dia', 'dias');
  if (months < 12) return months < 3 && days > 0 ? `${plural(months, 'mês', 'meses')} e ${plural(days, 'dia', 'dias')}` : plural(months, 'mês', 'meses');
  const y = Math.floor(months / 12);
  const m = months % 12;
  return m ? `${plural(y, 'ano', 'anos')} e ${plural(m, 'mês', 'meses')}` : plural(y, 'ano', 'anos');
}

/** "1a 4m" (para o display e o card do cardápio). */
export function formatAgeShort(age) {
  if (!age || age.months < 0) return '';
  if (age.months === 0) return `${age.days}d`;
  if (age.months < 12) return `${age.months}m`;
  const y = Math.floor(age.months / 12);
  const m = age.months % 12;
  return m ? `${y}a ${m}m` : `${y}a`;
}

/** "a partir de 3 meses", "a partir de 1 ano e meio". */
export function formatMinAge(months) {
  const m = Number(months) || 0;
  if (m === 0) return 'desde o nascimento';
  if (m < 12) return `a partir de ${plural(m, 'mês', 'meses')}`;
  if (m === 18) return 'a partir de 1 ano e meio';
  if (m === 30) return 'a partir de 2 anos e meio';
  const y = Math.floor(m / 12);
  const r = m % 12;
  return `a partir de ${plural(y, 'ano', 'anos')}${r ? ` e ${plural(r, 'mês', 'meses')}` : ''}`;
}

// ---------- Crianças ----------

export function validateChildInput({ name, birthDate, gestationWeeks }, today) {
  const errors = {};
  if (!String(name ?? '').trim()) errors.name = 'Informe o nome.';
  if (!isValidISODate(birthDate)) errors.birthDate = 'Informe a data de nascimento.';
  else if (birthDate > today) errors.birthDate = 'A data de nascimento não pode ser no futuro.';
  else if (diffDays(birthDate, today) > 366 * 7) errors.birthDate = 'Confira a data: a biblioteca vai até os 3 anos.';
  const gw = gestationWeeks === '' || gestationWeeks == null ? null : Number(gestationWeeks);
  if (gw != null && (!Number.isInteger(gw) || gw < 22 || gw > 44)) errors.gestationWeeks = 'Use um número de semanas entre 22 e 44 (ou deixe em branco).';
  return errors;
}

export function newChild({ name, birthDate, gestationWeeks = null }, actor, now = new Date()) {
  const at = now.toISOString();
  return {
    id: uid('crianca'),
    name: String(name).trim().slice(0, 40),
    birthDate,
    gestationWeeks: gestationWeeks === '' || gestationWeeks == null ? null : Number(gestationWeeks),
    plan: null,
    createdAt: at,
    createdBy: actor?.name ?? '',
    updatedAt: at,
    updatedBy: actor?.name ?? '',
  };
}

/** Registro antigo ou incompleto → formato atual. */
export function normalizeChild(c) {
  return {
    gestationWeeks: null,
    plan: null,
    ...c,
    name: String(c?.name ?? '').trim() || 'Criança',
  };
}

// ---------- Biblioteca ----------

const isStr = (v) => typeof v === 'string' && v.trim().length > 0;
const strList = (v) => (Array.isArray(v) ? v.filter(isStr) : []);

/** Erros de uma atividade do catálogo (vazio = válida). */
export function validateActivity(a) {
  const errors = [];
  if (!a || typeof a !== 'object') return ['registro inválido'];
  if (!isStr(a.id) || !/^[a-z0-9-]+$/.test(a.id)) errors.push('id inválido (use letras minúsculas, números e hífen)');
  if (!isStr(a.nome)) errors.push('nome obrigatório');
  if (!montessoriCategory(a.categoria)) errors.push(`categoria desconhecida: ${a.categoria}`);
  const min = a.idadeMinimaMeses;
  if (!Number.isInteger(min) || min < 0 || min > 36) errors.push('idadeMinimaMeses deve ser um número inteiro de 0 a 36');
  if (a.idadeMaximaMeses != null && (!Number.isInteger(a.idadeMaximaMeses) || a.idadeMaximaMeses <= min)) errors.push('idadeMaximaMeses deve ser maior que a mínima');
  if (!isStr(a.descricao)) errors.push('descrição obrigatória');
  if (!strList(a.passos).length) errors.push('instruções (passos) obrigatórias');
  if (!['livro', 'complementar'].includes(a.origem)) errors.push('origem deve ser "livro" ou "complementar"');
  return errors;
}

/**
 * Lê o JSON da biblioteca: atividades válidas (com faixa calculada) e a lista
 * de problemas encontrados. Uma atividade com erro fica de fora, mas não
 * derruba o resto do catálogo.
 */
export function loadLibrary(json) {
  const problems = [];
  const seen = new Set();
  const activities = [];
  for (const [i, raw] of (Array.isArray(json?.atividades) ? json.atividades : []).entries()) {
    const errs = validateActivity(raw);
    if (!errs.length && seen.has(raw.id)) errs.push('id repetido');
    if (errs.length) {
      problems.push(`Atividade ${raw?.id ?? `#${i + 1}`}: ${errs.join('; ')}`);
      continue;
    }
    seen.add(raw.id);
    activities.push({
      ...raw,
      habilidades: strList(raw.habilidades),
      materiais: strList(raw.materiais),
      passos: strList(raw.passos),
      seguranca: strList(raw.seguranca),
      referencias: strList(raw.referencias),
      rotinaDaCasa: !!raw.rotinaDaCasa,
      faixa: bandOf(raw.idadeMinimaMeses).id,
    });
  }
  activities.sort((a, b) => a.idadeMinimaMeses - b.idadeMinimaMeses || a.nome.localeCompare(b.nome, 'pt-BR'));
  return {
    activities,
    byId: Object.fromEntries(activities.map((a) => [a.id, a])),
    references: json?.referencias ?? {},
    book: json?.livro ?? null,
    generalSafety: strList(json?.segurancaGeral),
    howToAdd: typeof json?.comoAdicionar === 'string' ? json.comoAdicionar : '',
    problems,
  };
}

/** Atividade indicada para a idade (dentro da janela mínima–máxima). */
export function isForAge(a, months) {
  return a.idadeMinimaMeses <= months && (a.idadeMaximaMeses == null || months < a.idadeMaximaMeses);
}

// ---------- Registros ----------

export function validateLogInput({ date, interest, autonomy }, today) {
  const errors = {};
  if (!isValidISODate(date)) errors.date = 'Informe a data.';
  else if (date > today) errors.date = 'A data não pode ser no futuro.';
  if (!INTEREST_LEVELS.some((x) => x.id === interest)) errors.interest = 'Escolha o interesse.';
  if (!AUTONOMY_LEVELS.some((x) => x.id === autonomy)) errors.autonomy = 'Escolha a autonomia.';
  return errors;
}

export function newLog({ childId, activityId, date, interest, autonomy, notes = '' }, actor, now = new Date()) {
  const at = now.toISOString();
  return {
    id: uid('mreg'),
    childId,
    activityId,
    date,
    interest,
    autonomy,
    notes: String(notes ?? '').trim().slice(0, 1000),
    createdAt: at,
    createdBy: actor?.name ?? '',
    updatedAt: at,
    updatedBy: actor?.name ?? '',
  };
}

export function editLog(log, patch, actor, now = new Date()) {
  const next = { ...log };
  for (const k of ['date', 'interest', 'autonomy']) if (patch[k] !== undefined) next[k] = patch[k];
  if (patch.notes !== undefined) next.notes = String(patch.notes ?? '').trim().slice(0, 1000);
  next.updatedAt = now.toISOString();
  next.updatedBy = actor?.name ?? '';
  return next;
}

/** Registros de uma criança, do mais recente para o mais antigo. */
export function childLogs(logs, childId) {
  return logs
    .filter((l) => l && l.childId === childId && isValidISODate(l.date))
    .sort((a, b) => b.date.localeCompare(a.date) || String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? '')));
}

/**
 * Por atividade: quantas vezes, última data, interesse e autonomia da última vez.
 * `before`: só registros anteriores a essa data (as sugestões de um dia não
 * mudam quando alguém registra uma atividade nesse mesmo dia).
 */
export function activityStats(logs, childId, { before = null } = {}) {
  const map = new Map();
  for (const l of childLogs(logs, childId)) {
    if (before && l.date >= before) continue;
    const st = map.get(l.activityId);
    if (!st) map.set(l.activityId, { count: 1, last: l.date, first: l.date, lastInterest: l.interest, lastAutonomy: l.autonomy });
    else {
      st.count++;
      st.first = l.date;
    }
  }
  return map;
}

/** Ids das atividades registradas na data. */
export function doneOn(logs, childId, date) {
  return new Set(logs.filter((l) => l?.childId === childId && l.date === date).map((l) => l.activityId));
}

// ---------- Filtros da biblioteca ----------

export const STATUS_FILTERS = [
  { id: 'todas', label: 'Todas' },
  { id: 'nova', label: 'Ainda não apresentadas' },
  { id: 'feita', label: 'Já apresentadas' },
  { id: 'preferida', label: 'Preferidas' },
];

/** Status de uma atividade para a criança: nova | feita (+ preferida quando a última vez foi de interesse alto). */
export function activityStatus(stats, id) {
  const st = stats?.get(id);
  if (!st) return 'nova';
  return st.lastInterest === 'alto' ? 'preferida' : 'feita';
}

export function matchesStatus(stats, id, filter) {
  if (!filter || filter === 'todas') return true;
  const s = activityStatus(stats, id);
  if (filter === 'feita') return s !== 'nova';
  return s === filter;
}

// ---------- Sugestões do dia ----------

/** Hash simples (FNV-1a) para variar o desempate de forma estável. */
export function hashString(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

const INTEREST_BONUS = { alto: 14, medio: 6, baixo: -18 };

/**
 * Pontua as atividades indicadas para a idade. Regras simples, sem IA:
 *  - atividades da faixa atual primeiro; as das faixas anteriores continuam valendo;
 *  - ainda não apresentada vale mais; depois, a que foi feita há mais tempo;
 *  - interesse alto da última vez ajuda; baixo afasta por duas semanas (e depois
 *    a atividade volta a ser oferecida: cada criança tem o seu momento);
 *  - atividades que cabem na rotina da casa ganham um pouco;
 *  - rodízio: a cada dia uma categoria ganha destaque, para todas aparecerem
 *    ao longo da semana;
 *  - um sorteio estável (mesmo dia e criança → mesmo resultado) desempata.
 */
function scoreActivities({ activities, child, logs, date, salt }) {
  const age = childAge(child, date);
  if (!age) return [];
  const months = Math.max(0, age.months);
  const bandIdx = AGE_BANDS.indexOf(bandOf(months));
  const stats = activityStats(logs, child.id, { before: date });
  const featured = MONTESSORI_CATEGORIES[((diffDays('2026-01-05', date) % 6) + 6) % 6].id;
  const out = [];
  for (const a of activities) {
    if (!isForAge(a, months)) continue;
    let score = 0;
    const diff = bandIdx - AGE_BANDS.indexOf(bandOf(a.idadeMinimaMeses));
    score += diff <= 0 ? 30 : diff === 1 ? 18 : diff === 2 ? 8 : 2;
    const st = stats.get(a.id);
    if (!st) score += 40;
    else {
      const days = diffDays(st.last, date);
      score += Math.min(days, 45) * 0.8;
      if (days <= 1) score -= 50;
      if (st.lastInterest === 'baixo') score += days < 14 ? INTEREST_BONUS.baixo : 0;
      else score += INTEREST_BONUS[st.lastInterest] ?? 0;
    }
    if (a.rotinaDaCasa) score += 2;
    if (a.categoria === featured) score += 14;
    score += (hashString(`${child.id}|${date}|${salt}|${a.id}`) % 1000) / 1000 * 12;
    out.push({ a, score });
  }
  return out.sort((x, y) => y.score - x.score || x.a.id.localeCompare(y.a.id));
}

/**
 * Escolhe `count` atividades para o dia: as de maior pontuação, variando as
 * categorias, com pelo menos uma da rotina da casa quando houver.
 * `exclude`: ids que não devem entrar (usados só se faltar opção).
 * Devolve os ids em ordem.
 */
export function suggestActivities({ activities, child, logs = [], date, count = DAILY_COUNT, exclude = [], salt = '' }) {
  const scored = scoreActivities({ activities, child, logs, date, salt });
  const blocked = new Set(exclude);
  const pool = scored.filter((s) => !blocked.has(s.a.id));
  const picked = [];
  const pick = (list) => {
    while (picked.length < count && list.length) {
      const used = new Map();
      for (const p of picked) used.set(p.a.categoria, (used.get(p.a.categoria) ?? 0) + 1);
      let best = null;
      let bestScore = -Infinity;
      for (const s of list) {
        const v = s.score - 30 * (used.get(s.a.categoria) ?? 0);
        if (v > bestScore) {
          best = s;
          bestScore = v;
        }
      }
      picked.push(best);
      list.splice(list.indexOf(best), 1);
    }
  };
  const rest = [...pool];
  pick(rest);
  // Pelo menos uma atividade que cabe na rotina da casa.
  if (count >= 3 && picked.length && !picked.some((p) => p.a.rotinaDaCasa)) {
    const used = new Set(picked.slice(0, -1).map((p) => p.a.categoria));
    const routine = rest.filter((s) => s.a.rotinaDaCasa).sort((x, y) => Number(used.has(x.a.categoria)) - Number(used.has(y.a.categoria)) || y.score - x.score)[0];
    if (routine) picked[picked.length - 1] = routine;
  }
  // Faltou opção: completa com as excluídas.
  if (picked.length < count) pick(scored.filter((s) => blocked.has(s.a.id) && !picked.includes(s)));
  return picked.map((p) => p.a.id);
}

/**
 * Atividades do dia: as escolhidas para a data (quando alguém mexeu) ou as
 * sugeridas automaticamente. A sugestão automática é a mesma em todos os
 * aparelhos e na tela e-ink (depende só da data, da criança e dos registros
 * anteriores), então só é gravada quando a pessoa troca ou inclui algo.
 */
export function dayPlan({ activities, byId, child, logs = [], date }) {
  if (!child) return { ids: [], custom: false };
  const known = byId ?? Object.fromEntries(activities.map((a) => [a.id, a]));
  if (child.plan?.date === date && Array.isArray(child.plan.ids)) {
    const ids = child.plan.ids.filter((id) => known[id]);
    // Atividade que saiu do catálogo: completa para não encolher a lista.
    const missing = child.plan.ids.length - ids.length;
    if (missing > 0) ids.push(...suggestActivities({ activities, child, logs, date, count: missing, exclude: ids }).filter((id) => !ids.includes(id)));
    return { ids, custom: true };
  }
  return { ids: suggestActivities({ activities, child, logs, date }), custom: false };
}

/**
 * Sugestões novas para o dia, diferentes das atuais sempre que possível.
 * `keep`: atividades que continuam na lista (as já feitas hoje). Se todas
 * já foram feitas, acrescenta mais três (até o máximo do dia).
 */
export function regeneratePlan({ activities, child, logs = [], date, current = [], keep = [], round = 1 }) {
  const kept = current.filter((id) => keep.includes(id));
  const count = Math.min(MAX_PER_DAY - kept.length, kept.length >= DAILY_COUNT ? DAILY_COUNT : DAILY_COUNT - kept.length);
  if (count <= 0) return kept;
  const fresh = suggestActivities({ activities, child, logs, date, count: count + kept.length, exclude: current, salt: `rodada-${round}` });
  return [...kept, ...fresh.filter((id) => !kept.includes(id)).slice(0, count)];
}

/** Troca uma atividade do dia pela próxima melhor que ainda não está na lista. */
export function swapInPlan({ activities, child, logs = [], date, current, id }) {
  const [next] = suggestActivities({ activities, child, logs, date, count: 1, exclude: current, salt: `troca-${id}` }).filter((x) => !current.includes(x));
  if (!next) return current;
  return current.map((x) => (x === id ? next : x));
}

export function addToPlan(current, id) {
  if (current.includes(id) || current.length >= MAX_PER_DAY) return current;
  return [...current, id];
}

export const removeFromPlan = (current, id) => current.filter((x) => x !== id);

// ---------- Histórico ----------

/** Registros agrupados por data (mais recente primeiro): [{ date, logs }]. */
export function groupLogsByDate(logs) {
  const out = [];
  for (const l of logs) {
    const last = out[out.length - 1];
    if (last && last.date === l.date) last.logs.push(l);
    else out.push({ date: l.date, logs: [l] });
  }
  return out;
}
