import { SEED_INGREDIENTS } from '../../src/data/ingredients.js';
import { SEED_RECIPES } from '../../src/data/recipes.js';
import { emptyWeek } from '../../src/services/demand.js';
import { addEntry, newEntry } from '../../src/services/planning.js';

export const ingredientsById = Object.fromEntries(SEED_INGREDIENTS.map((i) => [i.id, i]));
export const recipesById = Object.fromEntries(SEED_RECIPES.map((r) => [r.id, r]));

// Semana de 09/11/2026 (segunda) a 15/11/2026 (domingo).
export const WEEK = '2026-11-09';

export function testRecipe(id, chickenGrams, servings = 2) {
  return {
    id,
    name: id,
    category: 'prato',
    servings,
    time: 20,
    difficulty: 'facil',
    protein: 'frango',
    composition: ['proteina'],
    ingredients: [{ ingredientId: 'peito-frango', qty: chickenGrams, unit: 'g' }],
    steps: [],
    advancePrep: [{ text: 'Descongelar', daysBefore: 1 }],
  };
}

export function weekWith(entries) {
  let w = emptyWeek(WEEK);
  for (const [date, slot, data] of entries) w = addEntry(w, date, slot, newEntry(data));
  return w;
}
