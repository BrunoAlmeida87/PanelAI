import { describe, expect, it } from 'vitest';
import { activeNotes, describeSchedule, groupNotes, isNoteActive, normalizeNote, noteStatus, validateNote } from '../../src/services/notes.js';
import { buildBackup, validateBackup } from '../../src/services/backup.js';

const note = (over = {}) => normalizeNote({ id: 'n', text: 'Recado', updatedAt: '2026-11-10T10:00:00.000Z', ...over });

// 2026-11-10 é uma terça-feira.
const TUE = '2026-11-10';
const WED = '2026-11-11';

describe('recados', () => {
  it('sem datas e sem dias aparece sempre', () => {
    expect(isNoteActive(note(), TUE)).toBe(true);
    expect(noteStatus(note(), TUE)).toBe('active');
  });

  it('respeita início e término (inclusive)', () => {
    const n = note({ startDate: '2026-11-10', endDate: '2026-11-12' });
    expect(isNoteActive(n, '2026-11-09')).toBe(false);
    expect(isNoteActive(n, '2026-11-10')).toBe(true);
    expect(isNoteActive(n, '2026-11-12')).toBe(true);
    expect(isNoteActive(n, '2026-11-13')).toBe(false);
    expect(noteStatus(n, '2026-11-09')).toBe('scheduled');
    expect(noteStatus(n, '2026-11-13')).toBe('expired');
  });

  it('repete só nos dias da semana marcados', () => {
    const n = note({ weekdays: [2] });
    expect(isNoteActive(n, TUE)).toBe(true);
    expect(isNoteActive(n, WED)).toBe(false);
    expect(noteStatus(n, WED)).toBe('scheduled');
  });

  it('normaliza texto, datas vazias e os sete dias marcados', () => {
    const n = normalizeNote({ text: '  oi  ', startDate: '', endDate: '', weekdays: [0, 1, 2, 3, 4, 5, 6, 6] });
    expect(n).toMatchObject({ text: 'oi', startDate: null, endDate: null, weekdays: [], pinned: false, author: '' });
  });

  it('valida texto e ordem das datas', () => {
    expect(validateNote(note({ text: '' }))).toHaveLength(1);
    expect(validateNote(note({ text: 'x'.repeat(281) }))).toHaveLength(1);
    expect(validateNote(note({ startDate: '2026-11-12', endDate: '2026-11-10' }))).toHaveLength(1);
    expect(validateNote(note({ startDate: '2026-02-30' }))).toHaveLength(1);
    expect(validateNote(note())).toEqual([]);
  });

  it('ordena fixados primeiro e depois os mais recentes', () => {
    const notes = {
      a: note({ id: 'a', updatedAt: '2026-11-10T08:00:00.000Z' }),
      b: note({ id: 'b', updatedAt: '2026-11-10T09:00:00.000Z' }),
      c: note({ id: 'c', pinned: true, updatedAt: '2026-11-01T09:00:00.000Z' }),
      d: note({ id: 'd', weekdays: [3] }),
    };
    expect(activeNotes(notes, TUE).map((n) => n.id)).toEqual(['c', 'b', 'a']);
    const g = groupNotes({ ...notes, e: note({ id: 'e', endDate: '2026-11-01' }) }, TUE);
    expect(g.scheduled.map((n) => n.id)).toEqual(['d']);
    expect(g.expired.map((n) => n.id)).toEqual(['e']);
  });

  it('descreve a programação', () => {
    expect(describeSchedule(note())).toBe('');
    expect(describeSchedule(note({ weekdays: [2] }))).toBe('Toda terça');
    expect(describeSchedule(note({ weekdays: [6] }))).toBe('Todo sábado');
    expect(describeSchedule(note({ weekdays: [0, 2, 4], endDate: '2026-11-20' }))).toBe('Ter, Qui, Dom · até 20/11');
    expect(describeSchedule(note({ startDate: '2026-11-10', endDate: '2026-11-10' }))).toBe('só em 10/11');
    expect(describeSchedule(note({ startDate: '2026-11-10', endDate: '2026-11-12' }))).toBe('10/11 a 12/11');
  });

  it('entra no backup e backups antigos (sem recados) continuam válidos', () => {
    const empty = { ingredients: {}, recipes: {}, pantry: {}, weeks: {}, marmitas: {}, movements: [], purchases: [], settings: {} };
    const backup = buildBackup({ ...empty, notes: { n: note() } });
    const result = validateBackup(JSON.stringify(backup));
    expect(result.ok).toBe(true);
    expect(result.data.notes.n.text).toBe('Recado');

    delete backup.data.notes;
    const old = validateBackup(backup);
    expect(old.ok).toBe(true);
    expect(old.data.notes).toEqual({});

    backup.data.notes = [{ id: 'x', text: '' }];
    expect(validateBackup(backup).ok).toBe(false);
  });
});
