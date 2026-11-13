// Recados da casa: avisos curtos com validade e repetição por dia da semana.
// A mesma regra decide o que aparece no app e, no futuro, no quadro (display).

import { WEEKDAY_NAMES, WEEKDAY_SHORT, formatDayMonth, isValidISODate, weekdayIndex } from '../utils/dates.js';

export const NOTE_MAX_LENGTH = 280;

/** Normaliza os campos de um recado (texto aparado, datas vazias viram null). */
export function normalizeNote(input) {
  const weekdays = [...new Set((input.weekdays ?? []).map(Number).filter((d) => d >= 0 && d <= 6))].sort();
  return {
    ...input,
    text: String(input.text ?? '').trim(),
    author: String(input.author ?? '').trim(),
    pinned: !!input.pinned,
    startDate: input.startDate || null,
    endDate: input.endDate || null,
    // 7 dias marcados é o mesmo que "todos os dias".
    weekdays: weekdays.length === 7 ? [] : weekdays,
  };
}

export function validateNote(note) {
  const errors = [];
  if (!note.text) errors.push('Escreva o recado.');
  if (note.text.length > NOTE_MAX_LENGTH) errors.push(`O recado pode ter até ${NOTE_MAX_LENGTH} caracteres.`);
  if (note.startDate && !isValidISODate(note.startDate)) errors.push('Data de início inválida.');
  if (note.endDate && !isValidISODate(note.endDate)) errors.push('Data de término inválida.');
  if (note.startDate && note.endDate && note.endDate < note.startDate) errors.push('O término não pode ser antes do início.');
  return errors;
}

/** O recado deve aparecer na data informada (YYYY-MM-DD)? */
export function isNoteActive(note, date) {
  if (note.startDate && date < note.startDate) return false;
  if (note.endDate && date > note.endDate) return false;
  if (note.weekdays?.length && !note.weekdays.includes(weekdayIndex(date))) return false;
  return true;
}

/** 'active' (aparece hoje), 'scheduled' (aparecerá em outro dia) ou 'expired' (já terminou). */
export function noteStatus(note, today) {
  if (note.endDate && note.endDate < today) return 'expired';
  return isNoteActive(note, today) ? 'active' : 'scheduled';
}

const byPriority = (a, b) => Number(b.pinned) - Number(a.pinned) || ((a.updatedAt ?? '') < (b.updatedAt ?? '') ? 1 : -1);

/** Recados que valem para a data, fixados primeiro e depois os mais recentes. */
export function activeNotes(notes, date) {
  return Object.values(notes ?? {}).filter((n) => isNoteActive(n, date)).sort(byPriority);
}

/** Agrupa todos os recados por situação, já ordenados. */
export function groupNotes(notes, today) {
  const groups = { active: [], scheduled: [], expired: [] };
  for (const n of Object.values(notes ?? {})) groups[noteStatus(n, today)].push(n);
  for (const list of Object.values(groups)) list.sort(byPriority);
  return groups;
}

/** Texto curto da programação: "Toda terça · até 20/11". Vazio para recados sem restrição. */
export function describeSchedule(note) {
  const parts = [];
  const days = note.weekdays ?? [];
  if (days.length === 1) {
    const name = WEEKDAY_NAMES[days[0]].toLowerCase();
    parts.push(`${days[0] === 0 || days[0] === 6 ? 'Todo' : 'Toda'} ${name}`);
  } else if (days.length > 1) {
    // Semana começando na segunda, como no restante do app.
    const ordered = [...days].sort((a, b) => ((a + 6) % 7) - ((b + 6) % 7));
    parts.push(ordered.map((d) => WEEKDAY_SHORT[d]).join(', '));
  }
  if (note.startDate && note.endDate) {
    parts.push(note.startDate === note.endDate ? `só em ${formatDayMonth(note.startDate)}` : `${formatDayMonth(note.startDate)} a ${formatDayMonth(note.endDate)}`);
  } else if (note.startDate) parts.push(`a partir de ${formatDayMonth(note.startDate)}`);
  else if (note.endDate) parts.push(`até ${formatDayMonth(note.endDate)}`);
  return parts.join(' · ');
}
