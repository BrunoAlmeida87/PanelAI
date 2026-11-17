// Dados derivados da semana (demanda, lista de compras).
// O resultado é compartilhado entre as telas (ex.: contador da barra de
// navegação e a própria Lista): só é recalculado quando os dados mudam.

import { useMemo } from 'preact/hooks';
import { useStore } from '../storage/store.js';
import { computeDemand, emptyWeek } from '../services/demand.js';
import { buildShoppingList, groupByMarketAndCategory } from '../services/shopping.js';

/** Guarda o último resultado e o devolve enquanto os argumentos forem os mesmos. */
function memoLast(fn) {
  let last = null;
  return (...args) => {
    if (last && last.args.length === args.length && last.args.every((a, i) => a === args[i])) return last.value;
    const value = fn(...args);
    last = { args, value };
    return value;
  };
}

const emptyWeekFor = memoLast((weekId) => emptyWeek(weekId));

const demandFor = memoLast((weekId, week, recipes, ingredients, marmitas) =>
  computeDemand({ weekId, week, recipesById: recipes, ingredientsById: ingredients, marmitas: Object.values(marmitas) }),
);

const listFor = memoLast((weekId, week, demand, pantry, ingredients, settings) =>
  buildShoppingList({ weekId, week, demand, pantry, ingredientsById: ingredients, settings }),
);

const groupsFor = memoLast((list) => groupByMarketAndCategory(list));

export function useWeek(weekId) {
  const s = useStore();
  const stored = s.weeks[weekId];
  return useMemo(() => stored ?? emptyWeekFor(weekId), [stored, weekId]);
}

export function useWeekShopping(weekId) {
  const s = useStore();
  const week = useWeek(weekId);
  const demand = demandFor(weekId, week, s.recipes, s.ingredients, s.marmitas);
  const list = s.ready ? listFor(weekId, week, demand, s.pantry, s.ingredients, s.settings) : null;
  const groups = list ? groupsFor(list) : [];
  return { week, demand, list, groups };
}
