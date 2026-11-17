// Ações das tarefas da casa: alteram o estado e gravam (local ou nuvem).
// Toda alteração registra quem fez (currentActor) no histórico da tarefa.

import { getState, setState, persist } from './store.js';
import { currentActor } from './actor.js';
import {
  addComment,
  copyWeekTasks,
  editTask,
  findTemplateByTitle,
  markPending,
  missingRecurring,
  newTask,
  newTemplate,
  normalizeRepeat,
  postponeTask,
  recurringId,
  resolvePending,
  setDone,
} from '../models/tasks.js';
import { addDays, todayISO, weekDates, weekStartOf } from '../utils/dates.js';

function saveTasks(list, extraOps = []) {
  if (!list.length && !extraOps.length) return;
  setState((s) => {
    const tasks = { ...s.tasks };
    for (const t of list) tasks[t.id] = t;
    return { tasks };
  });
  persist([...list.map((t) => ({ store: 'tasks', type: 'put', value: t })), ...extraOps]);
}

function saveTemplates(list) {
  if (!list.length) return;
  setState((s) => {
    const taskTemplates = { ...s.taskTemplates };
    for (const t of list) taskTemplates[t.id] = t;
    return { taskTemplates };
  });
  persist(list.map((t) => ({ store: 'taskTemplates', type: 'put', value: t })));
}

const getTask = (id) => getState().tasks[id];

/**
 * Cria a tarefa em uma ou mais datas. A tarefa fica salva na lista de
 * "tarefas salvas" (modelos) para ser usada de novo; com `repeat`, o modelo
 * passa a gerar a tarefa automaticamente.
 */
export function createTasks({ title, dates, category, assignee, notes, repeat = null, templateId = null }) {
  const actor = currentActor();
  const s = getState();
  const templates = Object.values(s.taskTemplates);
  let tpl = templateId ? s.taskTemplates[templateId] : findTemplateByTitle(templates, title);
  const now = new Date();
  const rep = normalizeRepeat(repeat);
  if (!tpl) {
    tpl = newTemplate({ title, category, assignee, notes, repeat: rep, startDate: [...dates].sort()[0] ?? todayISO() }, actor, now);
  } else {
    tpl = {
      ...tpl,
      category: category ?? tpl.category,
      assignee: assignee ?? tpl.assignee,
      notes: notes ?? tpl.notes,
      ...(rep ? { repeat: rep, paused: false, startDate: tpl.repeat ? tpl.startDate : ([...dates].sort()[0] ?? todayISO()) } : {}),
      updatedAt: now.toISOString(),
      updatedBy: actor.name,
    };
  }
  tpl = { ...tpl, uses: (tpl.uses ?? 0) + dates.length, lastUsedAt: now.toISOString() };
  saveTemplates([tpl]);

  // Com repetição, as datas escolhidas usam o id fixo (não duplicam depois).
  const tasks = dates.map((date) =>
    newTask(
      { id: rep && !getTask(recurringId(tpl.id, date)) ? recurringId(tpl.id, date) : null, title, date, category, assignee, notes, templateId: tpl.id },
      actor,
      now,
    ),
  );
  saveTasks(tasks);
  if (rep) ensureRecurring(dates.map((d) => d));
  return tasks;
}

export function updateTask(id, patch) {
  const t = getTask(id);
  if (!t) return null;
  const next = editTask(t, patch, currentActor());
  saveTasks([next]);
  return next;
}

export function setTaskDone(id, done) {
  const t = getTask(id);
  if (!t) return null;
  const next = setDone(t, done, currentActor());
  saveTasks([next]);
  return next;
}

export function setTaskPending(id, note) {
  const t = getTask(id);
  if (!t) return null;
  const next = markPending(t, note, currentActor());
  saveTasks([next]);
  return next;
}

export function resolveTaskPending(id) {
  const t = getTask(id);
  if (!t) return null;
  const next = resolvePending(t, currentActor());
  saveTasks([next]);
  return next;
}

export function addTaskComment(id, text) {
  const t = getTask(id);
  if (!t) return null;
  const next = addComment(t, text, currentActor());
  saveTasks([next]);
  return next;
}

/** Adia: a original fica como "adiada para X"; a nova mostra de onde veio. */
export function postpone(id, newDate, reason) {
  const t = getTask(id);
  if (!t) return null;
  const { original, moved } = postponeTask(t, newDate, reason, currentActor());
  saveTasks([original, moved]);
  return moved;
}

/**
 * Apaga a tarefa. Tarefas fixas (geradas pela repetição) ficam marcadas como
 * apagadas para não serem recriadas automaticamente.
 */
export function deleteTask(id) {
  const t = getTask(id);
  if (!t) return;
  if (t.id.startsWith('fixa_')) {
    const actor = currentActor();
    saveTasks([{ ...t, deleted: true, updatedAt: new Date().toISOString(), updatedBy: actor.name, history: [...(t.history ?? []), { at: new Date().toISOString(), type: 'deleted', by: actor.name, email: actor.email }] }]);
    return;
  }
  setState((s) => {
    const tasks = { ...s.tasks };
    delete tasks[id];
    return { tasks };
  });
  persist([{ store: 'tasks', type: 'delete', key: id }]);
}

/** Restaura uma tarefa apagada (botão "Desfazer"). */
export function restoreTask(task) {
  saveTasks([task]);
}

/**
 * Tarefas fixas só são criadas quando os dados estão completos: no modo local,
 * sempre; na nuvem, só depois de a casa ter sido lida do servidor (senão uma
 * cópia desatualizada poderia recriar como "a fazer" uma tarefa já feita em
 * outro aparelho).
 */
export function canGenerateRecurring(s = getState()) {
  return s.ready && (s.mode !== 'cloud' || !!s.cloud?.serverSynced);
}

/** Cria as tarefas fixas que faltam nas datas (a partir de hoje). */
export function ensureRecurring(dates) {
  const s = getState();
  if (!canGenerateRecurring(s)) return 0;
  const list = missingRecurring({
    templates: Object.values(s.taskTemplates),
    dates,
    tasksById: s.tasks,
    today: todayISO(),
    actor: currentActor(),
  });
  saveTasks(list);
  return list.length;
}

export function ensureRecurringForWeek(weekId) {
  return ensureRecurring(weekDates(weekId));
}

/** Semana atual e a próxima: usado ao abrir o app e de hora em hora (display sempre ligado). */
export function ensureRecurringAround(today = todayISO()) {
  const monday = weekStartOf(today);
  return ensureRecurring([...weekDates(monday), ...weekDates(addDays(monday, 7))]);
}

export function copyTasksFromWeek(fromWeekId, toWeekId) {
  const list = copyWeekTasks({ tasks: Object.values(getState().tasks), fromWeekId, toWeekId, actor: currentActor() });
  saveTasks(list);
  return list.length;
}

// ---------- Tarefas salvas (modelos) ----------

export function saveTemplate(tpl) {
  const actor = currentActor();
  const s = getState();
  const prev = s.taskTemplates[tpl.id];
  const next = {
    ...(prev ?? newTemplate(tpl, actor)),
    ...tpl,
    repeat: normalizeRepeat(tpl.repeat),
    updatedAt: new Date().toISOString(),
    updatedBy: actor.name,
  };
  if (next.repeat && (!prev?.repeat || !next.startDate)) next.startDate = todayISO();
  saveTemplates([next]);
  // Repetição desligada: remove as ocorrências futuras que ninguém mexeu.
  if (prev?.repeat && (!next.repeat || next.paused)) removeUntouchedFuture(next.id);
  return next;
}

function removeUntouchedFuture(templateId) {
  const today = todayISO();
  const s = getState();
  const ops = [];
  const tasks = { ...s.tasks };
  for (const t of Object.values(s.tasks)) {
    if (t.templateId === templateId && t.id.startsWith('fixa_') && t.date > today && t.status === 'todo' && (t.history?.length ?? 0) <= 1 && !t.deleted) {
      delete tasks[t.id];
      ops.push({ store: 'tasks', type: 'delete', key: t.id });
    }
  }
  if (!ops.length) return;
  setState({ tasks });
  persist(ops);
}

export function deleteTemplate(id) {
  removeUntouchedFuture(id);
  setState((s) => {
    const taskTemplates = { ...s.taskTemplates };
    delete taskTemplates[id];
    return { taskTemplates };
  });
  persist([{ store: 'taskTemplates', type: 'delete', key: id }]);
}
