// Dados derivados da semana (demanda, lista de compras), memorizados por dependência.

import { useMemo } from 'preact/hooks';
import { useStore } from '../storage/store.js';
import { computeDemand, emptyWeek } from '../services/demand.js';
import { buildShoppingList, groupByMarketAndCategory } from '../services/shopping.js';

export function useWeek(weekId) {
  const s = useStore();
  const stored = s.weeks[weekId];
  return useMemo(() => stored ?? emptyWeek(weekId), [stored, weekId]);
}

export function useWeekShopping(weekId) {
  const s = useStore();
  const week = useWeek(weekId);
  const demand = useMemo(
    () =>
      computeDemand({
        weekId,
        week,
        recipesById: s.recipes,
        ingredientsById: s.ingredients,
        marmitas: Object.values(s.marmitas),
      }),
    [weekId, week, s.recipes, s.ingredients, s.marmitas],
  );
  const list = useMemo(
    () =>
      s.ready
        ? buildShoppingList({ weekId, week, demand, pantry: s.pantry, ingredientsById: s.ingredients, settings: s.settings })
        : null,
    [weekId, week, demand, s.pantry, s.ingredients, s.settings, s.ready],
  );
  const groups = useMemo(() => (list ? groupByMarketAndCategory(list) : []), [list]);
  return { week, demand, list, groups };
}
