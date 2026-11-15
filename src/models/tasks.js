// Tarefas da casa: regras puras (sem estado global), fáceis de testar.
//
// Uma tarefa é uma ocorrência em uma data. Ela guarda o histórico completo de
// quem fez cada alteração. "Adiar" encerra a ocorrência original (status
// "postponed", com a nova data) e cria uma nova ocorrência na data escolhida,
// que lembra de onde veio (movedFrom).
//
// Modelos (taskTemplates) são as tarefas salvas para repetir depois. Um modelo
// pode ter repetição automática (semanal ou mensal).

import { addDays, diffDays, isValidISODate, parseISODate, weekStartOf, weekdayIndex } from '../utils/dates.js';
import { normalizeText, uid } from '../utils/id.js';

export const TASK_CATEGORIES = [
  { id: 'casa', label: 'Casa' },
  { id: 'limpeza', label: 'Limpeza' },
  { id: 'cozinha', label: 'Cozinha' },
  { id: 'compras', label: 'Compras' },
  { id: 'roupas', label: 'Roupas' },
  { id: 'contas', label: 'Contas' },
  { id: 'criancas', label: 'Crianças' },
  { id: 'pets', label: 'Pets' },
  { id: 'saude', label: 'Saúde' },
  { id: 'outros', label: 'Outros' },
];
export const TASK_CATEGORY_IDS = TASK_CATEGORIES.map((c) => c.id);
export const taskCategoryLabel = (id) => TASK_CATEGORIES.find((c) => c.id === id)?.label ?? 'Outros';

export const TASK_STATUS = {
  todo: 'A fazer',
  done: 'Feita',
  pending: 'Pendência',
  postponed: 'Adiada',
};

export const EVENT_LABELS = {
  created: 'criou',
  edited: 'editou',
  done: 'marcou como feita',
  undone: 'desmarcou',
  pending: 'registrou pendência',
  resolved: 'resolveu a pendência',
  comment: 'deixou um recado',
  postponed: 'adiou',
  moved: 'trouxe de outra data',
  generated: 'criou (tarefa fixa)',
};

const stamp = (now) => (now instanceof Date ? now : new Date(now ?? Date.now())).toISOString();

/** Quem fez: { name, email } → registro compacto. */
const who = (actor) => ({ by: actor?.name || 'Alguém', email: actor?.email || '' });

export function taskEvent(type, actor, now, extra = {}) {
  return { at: stamp(now), type, ...who(actor), ...extra };
}

function withEvent(task, type, actor, now, extra = {}, patch = {}) {
  const ev = taskEvent(type, actor, now, extra);
  return {
    ...task,
    ...patch,
    updatedAt: ev.at,
    updatedBy: ev.by,
    history: [...(task.history ?? []), ev],
  };
}

export function newTask({ title, date, category = 'casa', assignee = '', notes = '', templateId = null, id = null, generated = false }, actor, now) {
  const t = stamp(now);
  const ev = taskEvent(generated ? 'generated' : 'created', actor, now);
  return {
    id: id ?? uid('tarefa'),
    title: String(title ?? '').trim().slice(0, 120),
    date,
    category,
    assignee: String(assignee ?? '').trim().slice(0, 40),
    notes: String(notes ?? '').trim().slice(0, 500),
    templateId,
    status: 'todo',
    comments: [],
    movedFrom: [],
    postponedTo: null,
    deleted: false,
    createdAt: t,
    createdBy: ev.by,
    updatedAt: t,
    updatedBy: ev.by,
    history: [ev],
  };
}

export function validateTaskInput({ title, date }) {
  const errors = {};
  if (!String(title ?? '').trim()) errors.title = 'Dê um nome para a tarefa.';
  if (!isValidISODate(date)) errors.date = 'Escolha uma data válida.';
  return errors;
}

export function editTask(task, patch, actor, now) {
  const fields = {};
  const changed = [];
  for (const k of ['title', 'category', 'assignee', 'notes']) {
    if (patch[k] !== undefined && patch[k] !== task[k]) {
      fields[k] = typeof patch[k] === 'string' ? patch[k].trim() : patch[k];
      changed.push(k);
    }
  }
  if (!changed.length) return task;
  return withEvent(task, 'edited', actor, now, { fields: changed }, fields);
}

export function setDone(task, done, actor, now) {
  if (task.status === 'postponed') return task;
  if (done) {
    return withEvent(task, 'done', actor, now, {}, { status: 'done', doneAt: stamp(now), doneBy: who(actor).by });
  }
  return withEvent(task, 'undone', actor, now, {}, { status: task.pendingNote ? 'pending' : 'todo', doneAt: null, doneBy: null });
}

export function addComment(task, text, actor, now) {
  const clean = String(text ?? '').trim().slice(0, 500);
  if (!clean) return task;
  const c = { id: uid('recado'), at: stamp(now), ...who(actor), text: clean };
  return withEvent(task, 'comment', actor, now, { text: clean }, { comments: [...(task.comments ?? []), c] });
}

/** Registra uma pendência (o recado explica o que faltou). */
export function markPending(task, note, actor, now) {
  const clean = String(note ?? '').trim().slice(0, 500);
  let t = withEvent(task, 'pending', actor, now, { text: clean }, { status: 'pending', pendingNote: clean, doneAt: null, doneBy: null });
  if (clean) {
    const c = { id: uid('recado'), at: stamp(now), ...who(actor), text: clean, kind: 'pending' };
    t = { ...t, comments: [...(t.comments ?? []), c] };
  }
  return t;
}

export function resolvePending(task, actor, now) {
  return withEvent(task, 'resolved', actor, now, {}, { status: 'todo', pendingNote: '' });
}

/**
 * Adia a tarefa para outra data.
 * Devolve { original, moved }: a original fica registrada como "adiada para X"
 * e a nova ocorrência guarda de onde veio, com recados e histórico.
 */
export function postponeTask(task, newDate, reason, actor, now) {
  if (!isValidISODate(newDate)) throw new Error('Data inválida.');
  if (newDate === task.date) throw new Error('Escolha uma data diferente.');
  const clean = String(reason ?? '').trim().slice(0, 500);
  const original = withEvent(task, 'postponed', actor, now, { to: newDate, text: clean }, { status: 'postponed', postponedTo: newDate });
  const ev = taskEvent('moved', actor, now, { from: task.date, text: clean });
  const comments = [...(task.comments ?? [])];
  if (clean) comments.push({ id: uid('recado'), at: ev.at, by: ev.by, email: ev.email, text: clean, kind: 'postponed' });
  const moved = {
    ...task,
    id: uid('tarefa'),
    date: newDate,
    status: task.status === 'pending' ? 'pending' : 'todo',
    postponedTo: null,
    doneAt: null,
    doneBy: null,
    deleted: false,
    originId: task.originId ?? task.id,
    previousId: task.id,
    movedFrom: [...(task.movedFrom ?? []), task.date],
    comments,
    updatedAt: ev.at,
    updatedBy: ev.by,
    history: [...(task.history ?? []), ev],
  };
  return { original, moved };
}

/** Data de origem (a primeira) de uma tarefa que foi adiada. */
export const originalDate = (task) => task.movedFrom?.[0] ?? task.date;

// ---------- Modelos (tarefas salvas) e repetição ----------

export const REPEAT_KINDS = [
  { id: 'none', label: 'Não repetir' },
  { id: 'weekly', label: 'Toda semana' },
  { id: 'biweekly', label: 'A cada 2 semanas' },
  { id: 'monthly', label: 'Todo mês' },
];

export function newTemplate({ title, category = 'casa', assignee = '', notes = '', repeat = null, startDate }, actor, now) {
  const t = stamp(now);
  return {
    id: uid('modelo'),
    title: String(title ?? '').trim().slice(0, 120),
    category,
    assignee: String(assignee ?? '').trim().slice(0, 40),
    notes: String(notes ?? '').trim().slice(0, 500),
    repeat: normalizeRepeat(repeat),
    startDate: startDate ?? t.slice(0, 10),
    uses: 0,
    lastUsedAt: null,
    createdAt: t,
    createdBy: who(actor).by,
    updatedAt: t,
    updatedBy: who(actor).by,
  };
}

export function normalizeRepeat(repeat) {
  if (!repeat || repeat.kind === 'none') return null;
  if (repeat.kind === 'monthly') {
    const day = Math.min(31, Math.max(1, Math.round(Number(repeat.dayOfMonth) || 1)));
    return { kind: 'monthly', dayOfMonth: day };
  }
  const weekdays = [...new Set((repeat.weekdays ?? []).map(Number).filter((d) => d >= 0 && d <= 6))].sort();
  if (!weekdays.length) return null;
  return { kind: repeat.kind === 'biweekly' ? 'biweekly' : 'weekly', weekdays };
}

export function describeRepeat(repeat) {
  if (!repeat) return 'Não repete';
  const names = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  if (repeat.kind === 'monthly') return `Todo mês, dia ${repeat.dayOfMonth}`;
  const order = [1, 2, 3, 4, 5, 6, 0];
  const days = order.filter((d) => repeat.weekdays.includes(d)).map((d) => names[d]);
  const list = days.length === 7 ? 'todos os dias' : days.join(', ');
  return `${repeat.kind === 'biweekly' ? 'A cada 2 semanas' : 'Toda semana'}: ${list}`;
}

const lastDayOfMonth = (iso) => {
  const d = parseISODate(iso);
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
};

/** O modelo repete nesta data? */
export function repeatsOn(template, date) {
  const r = template.repeat;
  if (!r || template.paused) return false;
  if (template.startDate && date < template.startDate) return false;
  if (r.kind === 'monthly') {
    const day = parseISODate(date).getDate();
    return day === Math.min(r.dayOfMonth, lastDayOfMonth(date));
  }
  if (!r.weekdays.includes(weekdayIndex(date))) return false;
  if (r.kind === 'biweekly') {
    const weeks = Math.round(diffDays(weekStartOf(template.startDate ?? date), weekStartOf(date)) / 7);
    return weeks % 2 === 0;
  }
  return true;
}

/** Id determinístico: dois aparelhos geram a mesma tarefa fixa sem duplicar. */
export const recurringId = (templateId, date) => `fixa_${templateId}_${date}`;

/**
 * Ocorrências de tarefas fixas que faltam criar nas datas informadas.
 * Tarefas já existentes (inclusive apagadas, que ficam como "deleted") não voltam.
 */
export function missingRecurring({ templates, dates, tasksById, today, actor, now }) {
  const out = [];
  for (const tpl of templates) {
    if (!tpl.repeat) continue;
    for (const date of dates) {
      if (date < today) continue;
      if (!repeatsOn(tpl, date)) continue;
      const id = recurringId(tpl.id, date);
      if (tasksById[id]) continue;
      out.push(
        newTask(
          { id, title: tpl.title, date, category: tpl.category, assignee: tpl.assignee, notes: tpl.notes, templateId: tpl.id, generated: true },
          actor,
          now,
        ),
      );
    }
  }
  return out;
}

/** Procura um modelo com o mesmo nome (sem acentos/maiúsculas). */
export function findTemplateByTitle(templates, title) {
  const key = normalizeText(title);
  return templates.find((t) => normalizeText(t.title) === key) ?? null;
}

// ---------- Consultas ----------

/** Tarefas visíveis de uma data, na ordem: a fazer/pendência, feitas, adiadas. */
export function tasksOn(tasks, date) {
  const rank = { pending: 0, todo: 1, done: 2, postponed: 3 };
  return tasks
    .filter((t) => t.date === date && !t.deleted)
    .sort((a, b) => rank[a.status] - rank[b.status] || (a.createdAt < b.createdAt ? -1 : 1));
}

export function weekSummary(tasks, dates) {
  const set = new Set(dates);
  const list = tasks.filter((t) => set.has(t.date) && !t.deleted);
  const active = list.filter((t) => t.status !== 'postponed');
  return {
    total: active.length,
    done: active.filter((t) => t.status === 'done').length,
    pending: active.filter((t) => t.status === 'pending').length,
    postponed: list.filter((t) => t.status === 'postponed').length,
    open: active.filter((t) => t.status === 'todo' || t.status === 'pending').length,
  };
}

/** Atrasadas: abertas em datas anteriores a hoje. */
export function overdueTasks(tasks, today) {
  return tasks.filter((t) => !t.deleted && t.date < today && (t.status === 'todo' || t.status === 'pending'));
}

/** Copia tarefas (não fixas, não adiadas) de uma semana para outra. */
export function copyWeekTasks({ tasks, fromWeekId, toWeekId, actor, now }) {
  const shift = diffDays(fromWeekId, toWeekId);
  const from = new Set(Array.from({ length: 7 }, (_, i) => addDays(fromWeekId, i)));
  return tasks
    .filter((t) => from.has(t.date) && !t.deleted && t.status !== 'postponed' && !t.id.startsWith('fixa_'))
    .map((t) => newTask({ title: t.title, date: addDays(t.date, shift), category: t.category, assignee: t.assignee, notes: t.notes, templateId: t.templateId }, actor, now));
}
