// Operações imutáveis sobre o planejamento semanal.

import { MEAL_SLOT_IDS } from '../models/constants.js';
import { diffDays, addDays, weekDates } from '../utils/dates.js';
import { uid } from '../utils/id.js';
import { emptyWeek } from './demand.js';

const touch = (week) => ({ ...week, updatedAt: new Date().toISOString() });

function withSlot(week, date, slot, fn) {
  const meals = { ...week.meals };
  const day = { ...(meals[date] ?? {}) };
  day[slot] = fn([...(day[slot] ?? [])]);
  meals[date] = day;
  return touch({ ...week, meals });
}

export function newEntry(data) {
  return { id: uid('meal'), note: '', done: false, ...data };
}

export function addEntry(week, date, slot, entry) {
  if (!MEAL_SLOT_IDS.includes(slot)) throw new Error('Refeição inválida');
  return withSlot(week, date, slot, (list) => [...list, entry]);
}

export function updateEntry(week, date, slot, entryId, patch) {
  return withSlot(week, date, slot, (list) => list.map((e) => (e.id === entryId ? { ...e, ...patch } : e)));
}

export function removeEntry(week, date, slot, entryId) {
  return withSlot(week, date, slot, (list) => list.filter((e) => e.id !== entryId));
}

export function findEntry(week, entryId) {
  for (const [date, slots] of Object.entries(week?.meals ?? {})) {
    for (const [slot, list] of Object.entries(slots)) {
      const entry = list.find((e) => e.id === entryId);
      if (entry) return { date, slot, entry };
    }
  }
  return null;
}

/** Transfere (move) uma entrada para outro dia/refeição da mesma semana. */
export function moveEntry(week, entryId, toDate, toSlot) {
  const found = findEntry(week, entryId);
  if (!found) return week;
  const without = removeEntry(week, found.date, found.slot, entryId);
  return addEntry(without, toDate, toSlot, found.entry);
}

/** Duplica uma entrada para outros destinos (com novos IDs). */
export function duplicateEntry(week, entryId, targets) {
  const found = findEntry(week, entryId);
  if (!found) return week;
  let w = week;
  for (const t of targets) {
    if (t.date === found.date && t.slot === found.slot) continue;
    w = addEntry(w, t.date, t.slot, { ...found.entry, id: uid('meal'), done: false });
  }
  return w;
}

/** Remove todas as refeições de um dia ou da semana inteira, mantendo listas e tarefas manuais. */
export function clearMeals(week, onlyDate = null) {
  const meals = { ...week.meals };
  for (const date of Object.keys(meals)) {
    if (onlyDate && date !== onlyDate) continue;
    meals[date] = Object.fromEntries(MEAL_SLOT_IDS.map((s) => [s, []]));
  }
  return touch({ ...week, meals });
}

/**
 * Copia as refeições de uma semana de origem para a semana de destino,
 * deslocando as datas. Marmitas viram receitas comuns (o lote é da semana original).
 * As refeições existentes no destino são mantidas quando `merge` for verdadeiro.
 */
export function copyWeekMeals({ source, sourceId, target, targetId, marmitasById = {}, merge = false }) {
  const shift = diffDays(sourceId, targetId);
  const base = merge ? target ?? emptyWeek(targetId) : clearMeals(target ?? emptyWeek(targetId));
  const meals = JSON.parse(JSON.stringify(base.meals));
  for (const d of weekDates(targetId)) {
    meals[d] = meals[d] ?? Object.fromEntries(MEAL_SLOT_IDS.map((s) => [s, []]));
  }
  for (const [date, slots] of Object.entries(source?.meals ?? {})) {
    const newDate = addDays(date, shift);
    if (!meals[newDate]) continue;
    for (const slot of MEAL_SLOT_IDS) {
      for (const e of slots[slot] ?? []) {
        let copy = { ...e, id: uid('meal'), done: false };
        if (e.kind === 'marmita') {
          const m = marmitasById[e.marmitaId];
          if (!m) continue;
          copy = { id: copy.id, kind: 'recipe', recipeId: m.recipeId, servings: e.servings ?? 1, note: e.note ?? '', done: false };
        }
        meals[newDate][slot].push(copy);
      }
    }
  }
  return touch({ ...base, meals });
}

export function countEntries(week) {
  let n = 0;
  for (const slots of Object.values(week?.meals ?? {})) for (const list of Object.values(slots)) n += list.length;
  return n;
}
