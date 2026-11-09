// Indicadores do cardápio: planejamento, equilíbrio alimentar e preparo antecipado.
// Todos calculados a partir dos dados reais da semana.

import { MEAL_SLOTS, COMPOSITION, PROTEINS } from '../models/constants.js';
import { addDays, weekDates } from '../utils/dates.js';
import { weekEntries } from './demand.js';

export function planningStats({ weekId, week, settings, marmitas = [] }) {
  const dates = weekDates(weekId);
  let tracked = 0;
  let filledTracked = 0;
  const pending = [];
  const kinds = { recipe: 0, marmita: 0, out: 0, text: 0 };
  let filledSlots = 0;

  for (const date of dates) {
    for (const slot of MEAL_SLOTS) {
      const entries = week?.meals?.[date]?.[slot.id] ?? [];
      const isTracked = !slot.snack || settings?.trackSnacks;
      if (entries.length) filledSlots++;
      if (isTracked) {
        tracked++;
        if (entries.length) filledTracked++;
        else pending.push({ date, slot: slot.id });
      }
      for (const e of entries) kinds[e.kind] = (kinds[e.kind] ?? 0) + 1;
    }
  }
  const inWeek = new Set(dates);
  const batches = marmitas.filter((m) => inWeek.has(m.prepDate));
  return {
    tracked,
    filledTracked,
    filledSlots,
    pending,
    kinds,
    batches: batches.length,
    progress: tracked ? filledTracked / tracked : 0,
  };
}

export function balanceStats({ week, recipesById, marmitasById = {} }) {
  const proteins = Object.fromEntries(PROTEINS.map((p) => [p.id, 0]));
  const composition = Object.fromEntries(COMPOSITION.map((c) => [c.id, 0]));
  let meals = 0;
  for (const { entry } of weekEntries(week)) {
    let recipe = null;
    if (entry.kind === 'recipe') recipe = recipesById[entry.recipeId];
    if (entry.kind === 'marmita') recipe = recipesById[marmitasById[entry.marmitaId]?.recipeId];
    if (!recipe) continue;
    meals++;
    if (recipe.protein in proteins) proteins[recipe.protein]++;
    for (const c of recipe.composition ?? []) if (c in composition) composition[c]++;
  }
  return { meals, proteins, composition };
}

/**
 * Tarefas de preparo antecipado geradas pelas receitas e marmitas da semana.
 * Chave estável para guardar o estado de concluída.
 */
export function prepTasks({ weekId, week, recipesById, marmitas = [] }) {
  const tasks = [];
  const inWeek = new Set(weekDates(weekId));
  for (const { date, slot, entry } of weekEntries(week)) {
    if (entry.kind !== 'recipe' || entry.done) continue;
    const recipe = recipesById[entry.recipeId];
    if (!recipe) continue;
    (recipe.advancePrep ?? []).forEach((p, idx) => {
      tasks.push({
        key: `${entry.id}|${idx}`,
        date: addDays(date, -(Number(p.daysBefore) || 0)),
        text: p.text,
        detail: `${recipe.name}`,
        mealDate: date,
        slot,
        source: 'recipe',
      });
    });
  }
  for (const m of marmitas) {
    if (!inWeek.has(m.prepDate) || m.status !== 'planejada') continue;
    const recipe = recipesById[m.recipeId];
    if (!recipe) continue;
    tasks.push({
      key: `marmita|${m.id}`,
      date: m.prepDate,
      text: `Preparar marmitas: ${recipe.name}`,
      detail: `${m.portions} porções · ${m.storage === 'freezer' ? 'congelar' : 'geladeira'}`,
      mealDate: m.prepDate,
      source: 'marmita',
      marmitaId: m.id,
    });
  }
  for (const t of week?.manualTasks ?? []) {
    tasks.push({ key: `manual|${t.id}`, date: t.date, text: t.text, detail: 'Tarefa manual', source: 'manual', id: t.id });
  }
  return tasks
    .map((t) => ({ ...t, done: !!week?.tasksDone?.[t.key] }))
    .sort((a, b) => (a.date === b.date ? a.text.localeCompare(b.text, 'pt-BR') : a.date.localeCompare(b.date)));
}
