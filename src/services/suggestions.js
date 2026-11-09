// Sugestões de receitas a partir do estoque, com regras locais (sem API de IA).

import { scaleIngredients } from '../models/recipe.js';
import { toBase } from '../models/units.js';
import { stockInBase } from './pantry.js';

export const SUGGESTION_LEVELS = [
  { id: 'todos', label: 'Tenho tudo', description: 'Todos os ingredientes disponíveis' },
  { id: 'poucos', label: 'Faltam poucos', description: '1 ou 2 ingredientes faltando' },
  { id: 'muitos', label: 'Faltam vários', description: '3 ou mais ingredientes faltando' },
];

/** Avalia se uma receita pode ser feita com o estoque atual. */
export function evaluateRecipe(recipe, { pantry, ingredientsById, servings }) {
  const missing = [];
  const available = [];
  for (const line of scaleIngredients(recipe, servings ?? recipe.servings)) {
    if (line.optional) continue;
    const ing = ingredientsById[line.ingredientId];
    if (!ing) continue;
    if (ing.ignoreStock) continue;
    const p = pantry[ing.id];
    const stock = p ? stockInBase(p, ing) : null;
    const b = toBase(line.qty, line.unit, ing);
    let ok;
    if (b.qty == null) ok = !!p && Number(p.qty) > 0;
    else if (stock == null || !b.compatible) ok = false;
    else ok = stock + 1e-9 >= b.qty;
    (ok ? available : missing).push({ ingredientId: ing.id, name: ing.name, need: b.qty, unit: b.unit, stock });
  }
  const level = missing.length === 0 ? 'todos' : missing.length <= 2 ? 'poucos' : 'muitos';
  return { recipe, missing, available, level };
}

export function suggestRecipes(recipes, ctx) {
  return recipes
    .map((r) => evaluateRecipe(r, ctx))
    .sort((a, b) => a.missing.length - b.missing.length || a.recipe.name.localeCompare(b.recipe.name, 'pt-BR'));
}
