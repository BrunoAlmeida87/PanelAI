import { describe, expect, it } from 'vitest';
import {
  addComment,
  copyWeekTasks,
  editTask,
  markPending,
  missingRecurring,
  newTask,
  newTemplate,
  normalizeRepeat,
  postponeTask,
  recurringId,
  repeatsOn,
  resolvePending,
  setDone,
  tasksOn,
  weekSummary,
  overdueTasks,
} from '../../src/models/tasks.js';
import { validateBackup, buildBackup } from '../../src/services/backup.js';
import { buildSeed } from '../../src/data/seed.js';

const bruno = { name: 'Bruno', email: 'bruno@example.com' };
const ana = { name: 'Ana', email: 'ana@example.com' };
const t0 = new Date('2026-11-16T10:00:00');

describe('tarefas: histórico de quem fez', () => {
  it('registra criação, conclusão e edição com o autor', () => {
    let t = newTask({ title: 'Tirar o lixo', date: '2026-11-16' }, bruno, t0);
    expect(t.createdBy).toBe('Bruno');
    expect(t.history).toHaveLength(1);
    t = setDone(t, true, ana, t0);
    expect(t.status).toBe('done');
    expect(t.doneBy).toBe('Ana');
    expect(t.updatedBy).toBe('Ana');
    t = editTask(t, { title: 'Tirar o lixo reciclável' }, bruno, t0);
    expect(t.history.map((h) => [h.type, h.by])).toEqual([
      ['created', 'Bruno'],
      ['done', 'Ana'],
      ['edited', 'Bruno'],
    ]);
    expect(t.history[2].fields).toEqual(['title']);
  });

  it('edição sem mudança não gera evento', () => {
    const t = newTask({ title: 'A', date: '2026-11-16' }, bruno, t0);
    expect(editTask(t, { title: 'A' }, ana)).toBe(t);
  });

  it('pendência guarda o recado e pode ser resolvida', () => {
    let t = newTask({ title: 'Lavar roupa', date: '2026-11-16' }, bruno, t0);
    t = markPending(t, 'Faltou sabão', ana, t0);
    expect(t.status).toBe('pending');
    expect(t.pendingNote).toBe('Faltou sabão');
    expect(t.comments[0]).toMatchObject({ by: 'Ana', text: 'Faltou sabão', kind: 'pending' });
    t = resolvePending(t, bruno, t0);
    expect(t.status).toBe('todo');
    t = addComment(t, 'Comprei sabão', bruno, t0);
    expect(t.comments).toHaveLength(2);
    expect(t.history.at(-1)).toMatchObject({ type: 'comment', by: 'Bruno' });
  });
});

describe('tarefas: adiar', () => {
  it('a original fica como adiada e a nova sabe de onde veio', () => {
    const t = markPending(newTask({ title: 'Pagar boleto', date: '2026-11-16' }, bruno, t0), 'Sem saldo', bruno, t0);
    const { original, moved } = postponeTask(t, '2026-11-18', 'Depois do salário', ana, t0);
    expect(original.status).toBe('postponed');
    expect(original.postponedTo).toBe('2026-11-18');
    expect(original.id).toBe(t.id);
    expect(moved.id).not.toBe(t.id);
    expect(moved.date).toBe('2026-11-18');
    expect(moved.movedFrom).toEqual(['2026-11-16']);
    expect(moved.previousId).toBe(t.id);
    expect(moved.originId).toBe(t.id);
    expect(moved.status).toBe('pending'); // a pendência continua
    expect(moved.comments.map((c) => c.text)).toEqual(['Sem saldo', 'Depois do salário']);
    expect(moved.history.at(-1)).toMatchObject({ type: 'moved', by: 'Ana', from: '2026-11-16' });

    const again = postponeTask(moved, '2026-11-20', '', bruno, t0).moved;
    expect(again.movedFrom).toEqual(['2026-11-16', '2026-11-18']);
    expect(again.originId).toBe(t.id);
  });

  it('não adia para a mesma data nem data inválida', () => {
    const t = newTask({ title: 'X', date: '2026-11-16' }, bruno, t0);
    expect(() => postponeTask(t, '2026-11-16', '', bruno)).toThrow();
    expect(() => postponeTask(t, '2026-13-01', '', bruno)).toThrow();
  });

  it('adiadas não contam no total, mas aparecem na data original', () => {
    const t = newTask({ title: 'X', date: '2026-11-16' }, bruno, t0);
    const { original, moved } = postponeTask(t, '2026-11-17', '', bruno, t0);
    const list = [original, moved];
    expect(tasksOn(list, '2026-11-16')[0].status).toBe('postponed');
    const s = weekSummary(list, ['2026-11-16', '2026-11-17']);
    expect(s).toMatchObject({ total: 1, postponed: 1, open: 1 });
  });
});

describe('tarefas fixas (repetição)', () => {
  it('semanal, quinzenal e mensal', () => {
    const weekly = { repeat: normalizeRepeat({ kind: 'weekly', weekdays: [1, 3] }), startDate: '2026-11-16' };
    expect(repeatsOn(weekly, '2026-11-16')).toBe(true); // segunda
    expect(repeatsOn(weekly, '2026-11-17')).toBe(false);
    expect(repeatsOn(weekly, '2026-11-09')).toBe(false); // antes do início
    const biweekly = { repeat: normalizeRepeat({ kind: 'biweekly', weekdays: [1] }), startDate: '2026-11-16' };
    expect(repeatsOn(biweekly, '2026-11-16')).toBe(true);
    expect(repeatsOn(biweekly, '2026-11-23')).toBe(false);
    expect(repeatsOn(biweekly, '2026-11-30')).toBe(true);
    const monthly = { repeat: normalizeRepeat({ kind: 'monthly', dayOfMonth: 31 }), startDate: '2026-01-01' };
    expect(repeatsOn(monthly, '2026-11-30')).toBe(true); // último dia de novembro
    expect(repeatsOn(monthly, '2026-12-31')).toBe(true);
    expect(repeatsOn({ ...weekly, paused: true }, '2026-11-16')).toBe(false);
  });

  it('gera só o que falta, com id fixo (sem duplicar entre aparelhos) e não recria apagadas', () => {
    const tpl = { ...newTemplate({ title: 'Lixo', repeat: { kind: 'weekly', weekdays: [1, 3, 5] }, startDate: '2026-11-16' }, bruno, t0) };
    const dates = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22'];
    const first = missingRecurring({ templates: [tpl], dates, tasksById: {}, today: '2026-11-17', actor: bruno, now: t0 });
    expect(first.map((t) => t.date)).toEqual(['2026-11-18', '2026-11-20']); // segunda já passou
    expect(first[0].id).toBe(recurringId(tpl.id, '2026-11-18'));
    const byId = Object.fromEntries(first.map((t) => [t.id, t]));
    byId[first[0].id] = { ...first[0], deleted: true };
    expect(missingRecurring({ templates: [tpl], dates, tasksById: byId, today: '2026-11-17', actor: ana })).toEqual([]);
  });

  it('copia tarefas avulsas da semana anterior (não as fixas nem adiadas)', () => {
    const a = newTask({ title: 'Avulsa', date: '2026-11-10' }, bruno, t0);
    const fixed = { ...newTask({ title: 'Fixa', date: '2026-11-11' }, bruno, t0), id: 'fixa_x_2026-11-11' };
    const { original } = postponeTask(newTask({ title: 'Adiada', date: '2026-11-12' }, bruno, t0), '2026-11-13', '', bruno, t0);
    const out = copyWeekTasks({ tasks: [a, fixed, original], fromWeekId: '2026-11-09', toWeekId: '2026-11-16', actor: ana, now: t0 });
    expect(out.map((t) => [t.title, t.date, t.createdBy])).toEqual([['Avulsa', '2026-11-17', 'Ana']]);
  });

  it('atrasadas: abertas em datas passadas', () => {
    const late = newTask({ title: 'A', date: '2026-11-10' }, bruno, t0);
    const done = setDone(newTask({ title: 'B', date: '2026-11-10' }, bruno, t0), true, bruno, t0);
    expect(overdueTasks([late, done], '2026-11-16').map((t) => t.title)).toEqual(['A']);
  });
});

describe('backup com tarefas', () => {
  it('exporta e importa tarefas, tarefas salvas e layouts', () => {
    const seed = buildSeed(t0);
    const backup = buildBackup({ ...seed, displayLayouts: { d1: { id: 'd1', name: 'X', grid: { cols: 12, rows: 8 }, cards: [] } } });
    const r = validateBackup(JSON.stringify(backup));
    expect(r.ok).toBe(true);
    expect(Object.keys(r.data.tasks)).toHaveLength(Object.keys(seed.tasks).length);
    expect(Object.keys(r.data.taskTemplates)).toHaveLength(Object.keys(seed.taskTemplates).length);
    expect(r.data.displayLayouts.d1.name).toBe('X');
  });

  it('aceita backups antigos, sem as coleções novas', () => {
    const backup = buildBackup(buildSeed(t0));
    delete backup.data.tasks;
    delete backup.data.taskTemplates;
    delete backup.data.displayLayouts;
    const r = validateBackup(backup);
    expect(r.ok).toBe(true);
    expect(r.data.tasks).toEqual({});
  });
});
