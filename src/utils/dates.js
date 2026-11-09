// Datas locais no formato ISO (YYYY-MM-DD), sem fuso horário.
// As semanas começam na segunda-feira e são identificadas pela data dessa segunda.

const pad = (n) => String(n).padStart(2, '0');

export function toISODate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseISODate(iso) {
  if (typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
    throw new Error(`Data inválida: ${iso}`);
  }
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) {
    throw new Error(`Data inválida: ${iso}`);
  }
  return date;
}

export function isValidISODate(iso) {
  try {
    parseISODate(iso);
    return true;
  } catch {
    return false;
  }
}

export function addDays(iso, days) {
  const d = parseISODate(iso);
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

export function todayISO(now = new Date()) {
  return toISODate(now);
}

/** Segunda-feira da semana que contém a data informada. */
export function weekStartOf(iso) {
  const d = parseISODate(iso);
  const dow = d.getDay(); // 0 = domingo
  const diff = dow === 0 ? -6 : 1 - dow;
  d.setDate(d.getDate() + diff);
  return toISODate(d);
}

export function weekDates(weekId) {
  return Array.from({ length: 7 }, (_, i) => addDays(weekId, i));
}

export function diffDays(a, b) {
  const ms = parseISODate(b) - parseISODate(a);
  return Math.round(ms / 86400000);
}

export function weekdayIndex(iso) {
  return parseISODate(iso).getDay();
}

export const WEEKDAY_NAMES = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
export const WEEKDAY_SHORT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function weekdayName(iso) {
  return WEEKDAY_NAMES[weekdayIndex(iso)];
}

export function weekdayShort(iso) {
  return WEEKDAY_SHORT[weekdayIndex(iso)];
}

/** "09/11" */
export function formatDayMonth(iso) {
  const d = parseISODate(iso);
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
}

/** "9 nov 2026" */
export function formatLongDate(iso) {
  const d = parseISODate(iso);
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "09/11 – 15/11/2026" */
export function formatWeekRange(weekId) {
  const end = addDays(weekId, 6);
  return `${formatDayMonth(weekId)} – ${formatDayMonth(end)}/${parseISODate(end).getFullYear()}`;
}

export function formatDateTime(isoDateTime) {
  if (!isoDateTime) return '—';
  const d = new Date(isoDateTime);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
