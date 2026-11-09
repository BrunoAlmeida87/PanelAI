// Lista de compras da semana, gerada a partir da demanda do cardápio e do estoque.
//
// - Ingredientes repetidos são somados na unidade-base (ver demand.js).
// - Comprar = máximo(0, necessário − estoque), arredondado para uma quantidade prática.
// - Itens marcados como "mercado do mês" não entram aqui (evita compra duplicada):
//   a necessidade deles é somada na reposição mensal (ver pantry.monthlyList).
// - Ajustes manuais (overrides) e marcações são guardados por chave estável
//   `ingredienteId|unidade`, preservados enquanto o item continuar existindo.

import { CATEGORY_IDS } from '../models/constants.js';
import { convert, roundForPurchase } from '../models/units.js';
import { addDays, weekdayIndex } from '../utils/dates.js';
import { stockInBase } from './pantry.js';

export const itemKey = (ingredientId, unit) => `${ingredientId}|${unit}`;

/**
 * Datas de mercado candidatas da semana. Inclui o domingo anterior à semana
 * ("Dom (antes)") quando domingo é dia de mercado.
 */
export function marketDatesForWeek(weekId, marketDays = []) {
  const out = [];
  for (let i = -1; i < 7; i++) {
    const date = addDays(weekId, i);
    if (marketDays.includes(weekdayIndex(date))) out.push(date);
  }
  return out;
}

/** Último dia de mercado até a data em que o item é necessário (ou o primeiro disponível). */
export function assignMarketDate(firstDate, marketDates) {
  if (!marketDates.length) return null;
  let chosen = null;
  for (const d of marketDates) if (d <= firstDate) chosen = d;
  return chosen ?? marketDates[0];
}

export function buildShoppingList({ weekId, week, demand, pantry, ingredientsById, settings }) {
  const state = week?.shopping ?? { checked: {}, overrides: {}, extras: [] };
  const marketDates = marketDatesForWeek(weekId, settings?.marketDays ?? []);
  const items = [];
  const monthly = [];
  const toCheck = [];

  for (const d of demand.values()) {
    const ing = d.ingredient;
    const p = pantry[ing.id];
    const units = Object.keys(d.totals);
    const marketDate = assignMarketDate(d.firstDate, marketDates);

    if (units.length === 0) {
      // Só "a gosto": conferir na despensa se não houver estoque registrado.
      const hasStock = p && Number(p.qty) > 0;
      if (!hasStock) {
        const key = itemKey(ing.id, 'a_gosto');
        toCheck.push({
          key,
          ingredientId: ing.id,
          name: ing.name,
          category: ing.category,
          sources: d.sources,
          missing: !!state.missing?.[key],
          checked: !!state.checked?.[key],
          marketDate,
        });
      }
      continue;
    }

    for (const unit of units) {
      const need = d.totals[unit];
      const key = itemKey(ing.id, unit);
      let stock = null;
      if (p) {
        const base = unit === ing.baseUnit ? stockInBase(p, ing) : convert(Number(p.qty) || 0, p.unit, unit, ing);
        stock = base;
      }
      const shortage = Math.max(0, need - (stock ?? 0));
      const suggested = roundForPurchase(shortage, unit);
      const override = state.overrides?.[key];
      const hasOverride = typeof override === 'number' && override >= 0;
      const toBuy = hasOverride ? override : suggested;
      const sources = d.sources.filter((s) => s.unit === unit);
      const item = {
        key,
        ingredientId: ing.id,
        name: ing.name,
        category: CATEGORY_IDS.includes(ing.category) ? ing.category : 'outros',
        unit,
        need,
        stock,
        stockUnit: p?.unit ?? null,
        shortage,
        suggested,
        toBuy,
        overridden: hasOverride,
        monthly: !!p?.monthly,
        sources,
        firstDate: d.firstDate,
        marketDate,
        checked: !!state.checked?.[key],
        toTaste: d.toTaste,
      };
      if (item.monthly) {
        monthly.push(item);
      } else {
        item.status = toBuy > 0 ? 'comprar' : 'coberto';
        items.push(item);
      }
    }
  }

  const extras = (state.extras ?? []).map((e) => ({
    ...e,
    marketDate: e.marketDate && marketDates.includes(e.marketDate) ? e.marketDate : marketDates[0] ?? null,
  }));

  const sortByName = (a, b) => a.name.localeCompare(b.name, 'pt-BR');
  items.sort(sortByName);
  monthly.sort(sortByName);
  toCheck.sort(sortByName);

  const buyItems = items.filter((i) => i.status === 'comprar');
  const pendingToCheck = toCheck.filter((t) => t.missing);
  const total = buyItems.length + extras.length + pendingToCheck.length;
  const done =
    buyItems.filter((i) => i.checked).length +
    extras.filter((e) => e.checked).length +
    pendingToCheck.filter((t) => t.checked).length;

  return {
    marketDates,
    items,
    buyItems,
    covered: items.filter((i) => i.status === 'coberto'),
    monthly,
    toCheck,
    extras,
    summary: { total, done, remaining: total - done },
  };
}

/** Agrupa itens a comprar por data de mercado e categoria. */
export function groupByMarketAndCategory(list) {
  const groups = new Map();
  const push = (marketDate, entry) => {
    const k = marketDate ?? 'semana';
    if (!groups.has(k)) groups.set(k, new Map());
    const cats = groups.get(k);
    if (!cats.has(entry.category)) cats.set(entry.category, []);
    cats.get(entry.category).push(entry);
  };
  for (const i of list.buyItems) push(i.marketDate, { type: 'item', ...i });
  for (const t of list.toCheck) if (t.missing) push(t.marketDate, { type: 'check', ...t });
  for (const e of list.extras) push(e.marketDate, { type: 'extra', key: e.id, ...e });

  const order = (cat) => {
    const idx = CATEGORY_IDS.indexOf(cat);
    return idx === -1 ? 999 : idx;
  };
  return [...groups.entries()]
    .sort(([a], [b]) => (a === 'semana' ? 1 : b === 'semana' ? -1 : a.localeCompare(b)))
    .map(([marketDate, cats]) => ({
      marketDate: marketDate === 'semana' ? null : marketDate,
      categories: [...cats.entries()]
        .sort(([a], [b]) => order(a) - order(b))
        .map(([category, entries]) => ({ category, entries })),
    }));
}

/**
 * Linhas para registrar a compra no estoque: itens marcados com quantidade a comprar
 * e avulsos ligados a um ingrediente que ainda não foram registrados.
 * Como a lista é recalculada contra o estoque atualizado, um item registrado passa a
 * "coberto" e não pode ser lançado duas vezes.
 */
export function purchasableLines(list) {
  const lines = [];
  for (const i of list.buyItems) {
    if (i.checked && i.toBuy > 0) {
      lines.push({ key: i.key, source: 'item', ingredientId: i.ingredientId, name: i.name, qty: i.toBuy, unit: i.unit });
    }
  }
  for (const e of list.extras) {
    if (e.checked && !e.registered && e.ingredientId && e.qty > 0) {
      lines.push({ key: e.id, source: 'extra', ingredientId: e.ingredientId, name: e.name, qty: e.qty, unit: e.unit });
    }
  }
  return lines;
}
