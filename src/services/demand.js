// Demanda de ingredientes da semana: quanto o cardápio ainda vai consumir.
//
// Regras:
// - Entradas de receita contam enquanto não foram marcadas como preparadas (`done`).
// - Entradas de marmita NÃO contam: os ingredientes pertencem ao lote da marmita.
// - Lotes de marmita contam uma única vez, na semana do preparo, enquanto estão "planejados".
// - Ingredientes "a gosto" não somam quantidade, mas aparecem para conferência.
// - Ingredientes opcionais não entram na demanda.

import { MEAL_SLOT_IDS } from '../models/constants.js';
import { scaleIngredients } from '../models/recipe.js';
import { toBase } from '../models/units.js';
import { weekDates } from '../utils/dates.js';

export function emptyWeek(weekId) {
  const meals = {};
  for (const d of weekDates(weekId)) {
    meals[d] = {};
    for (const s of MEAL_SLOT_IDS) meals[d][s] = [];
  }
  return {
    id: weekId,
    meals,
    favorite: false,
    favoriteName: '',
    shopping: { checked: {}, overrides: {}, missing: {}, extras: [] },
    tasksDone: {},
    manualTasks: [],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** Lista todas as entradas da semana com data e refeição. */
export function weekEntries(week) {
  const out = [];
  if (!week?.meals) return out;
  for (const date of Object.keys(week.meals).sort()) {
    for (const slot of MEAL_SLOT_IDS) {
      for (const entry of week.meals[date]?.[slot] ?? []) out.push({ date, slot, entry });
    }
  }
  return out;
}

function addDemand(map, ingredientsById, line, source) {
  const ing = ingredientsById[line.ingredientId];
  if (!ing || line.optional) return;
  if (ing.ignoreStock) return;
  let d = map.get(ing.id);
  if (!d) {
    d = { ingredientId: ing.id, ingredient: ing, totals: {}, toTaste: false, sources: [], firstDate: source.date };
    map.set(ing.id, d);
  }
  if (source.date < d.firstDate) d.firstDate = source.date;
  const b = toBase(line.qty, line.unit, ing);
  if (b.qty == null) {
    d.toTaste = true;
  } else {
    d.totals[b.unit] = (d.totals[b.unit] ?? 0) + b.qty;
  }
  d.sources.push({ ...source, qty: b.qty, unit: b.unit, originalQty: line.qty, originalUnit: line.unit });
}

/**
 * Calcula a demanda da semana.
 * @returns {Map<string, {ingredientId, ingredient, totals: Record<string, number>, toTaste, sources, firstDate}>}
 */
export function computeDemand({ weekId, week, recipesById, ingredientsById, marmitas = [] }) {
  const map = new Map();
  const dates = weekDates(weekId);
  const inWeek = new Set(dates);

  for (const { date, slot, entry } of weekEntries(week)) {
    if (!inWeek.has(date)) continue;
    if (entry.kind !== 'recipe' || entry.done) continue;
    const recipe = recipesById[entry.recipeId];
    if (!recipe) continue;
    for (const line of scaleIngredients(recipe, entry.servings ?? recipe.servings)) {
      addDemand(map, ingredientsById, line, {
        kind: 'meal',
        date,
        slot,
        entryId: entry.id,
        recipeId: recipe.id,
        recipeName: recipe.name,
      });
    }
  }

  for (const m of marmitas) {
    if (m.status !== 'planejada' || !inWeek.has(m.prepDate)) continue;
    const recipe = recipesById[m.recipeId];
    if (!recipe) continue;
    for (const line of scaleIngredients(recipe, m.portions)) {
      addDemand(map, ingredientsById, line, {
        kind: 'marmita',
        date: m.prepDate,
        slot: null,
        entryId: m.id,
        recipeId: recipe.id,
        recipeName: `${recipe.name} (marmita)`,
      });
    }
  }
  return map;
}

/** Ingredientes (escalados) que uma entrada ou lote consome ao ser preparado. */
export function consumptionLines({ recipe, servings }) {
  return scaleIngredients(recipe, servings).filter((l) => !l.optional && l.qty != null);
}
