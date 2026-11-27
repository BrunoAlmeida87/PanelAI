// Lista de compras da semana, gerada a partir da demanda do cardápio e do estoque.
//
// - Ingredientes repetidos são somados na unidade-base (ver demand.js).
// - Comprar = máximo(0, necessário − estoque), arredondado para uma quantidade prática.
// - Itens marcados como "mercado do mês" não entram aqui (evita compra duplicada):
//   a necessidade deles é somada na reposição mensal (ver pantry.monthlyList).
// - Ajustes manuais (overrides) e marcações são guardados por chave estável
//   `ingredienteId|unidade`, preservados enquanto o item continuar existindo.
// - Modo manual (`settings.shoppingFromMenu === false`): o cardápio NÃO gera itens;
//   a lista tem só o que a pessoa escreveu (avulsos), cada um no dia escolhido
//   (qualquer dia da semana, não só os dias de mercado).

import { categoryOrder, isCategory } from '../models/constants.js';
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

/** Lista de compras puxa os ingredientes do cardápio? (padrão: sim) */
export const shoppingFromMenu = (settings) => settings?.shoppingFromMenu !== false;

/** Dias em que se pode comprar: dias de mercado (automático) ou todos os dias da semana (manual). */
export function shoppingDates(weekId, settings) {
  if (shoppingFromMenu(settings)) return marketDatesForWeek(weekId, settings?.marketDays ?? []);
  return Array.from({ length: 7 }, (_, i) => addDays(weekId, i));
}

export function buildShoppingList({ weekId, week, demand, pantry, ingredientsById, settings }) {
  const state = week?.shopping ?? { checked: {}, overrides: {}, extras: [] };
  const fromMenu = shoppingFromMenu(settings);
  const marketDates = shoppingDates(weekId, settings);
  if (!fromMenu) demand = new Map();
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
        category: isCategory(ing.category) ? ing.category : 'outros',
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
    fromMenu,
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

  const order = categoryOrder;
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

// ---------- Lista escrita à mão ----------

const UNIT_WORDS = [
  [/^(kg|kgs|quilos?|kilos?)$/, 'kg'],
  [/^(g|gr|grs|gramas?)$/, 'g'],
  [/^(l|lt|lts|litros?)$/, 'l'],
  [/^(ml|mls)$/, 'ml'],
  [/^(un|und|unid|unidades?)$/, 'un'],
  [/^(pct|pcts|pacotes?)$/, 'pacote'],
  [/^(cx|cxs|caixas?)$/, 'caixa'],
  [/^(latas?)$/, 'lata'],
  [/^(macos?|maços?)$/, 'maco'],
  [/^(rolos?)$/, 'rolo'],
  [/^(duzias?|dúzias?)$/, 'duzia'],
];

/**
 * Uma linha escrita ("2 kg de batata", "- Pão", "6 ovos") → { name, qty, unit }.
 * Sem número no começo, a quantidade fica vazia (só o nome).
 */
export function parseShoppingLine(line) {
  const clean = String(line ?? '')
    .replace(/^\s*(?:[-*•·–]|\[ ?\]|☐|\d+[.)](?=\s))\s*/, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return null;
  const m = clean.match(/^(\d+(?:[.,]\d+)?|\d+\/\d+)\s*([a-zà-ú]+\.?)?\s+(.+)$/i);
  if (!m) return { name: clean, qty: null, unit: 'un' };
  const [, num, word, rest] = m;
  const qty = num.includes('/') ? Number(num.split('/')[0]) / Number(num.split('/')[1]) : Number(num.replace(',', '.'));
  const w = (word ?? '').toLowerCase().replace(/\.$/, '');
  let unit = 'un';
  let name = rest;
  const hit = w && UNIT_WORDS.find(([re]) => re.test(w));
  if (hit) {
    if (hit[1] === 'duzia') {
      return { name: rest.replace(/^de\s+/i, ''), qty: qty * 12, unit: 'un' };
    }
    unit = hit[1];
    name = rest.replace(/^de\s+/i, '');
  } else if (word) {
    name = `${word} ${rest}`;
  }
  if (!(qty > 0)) return { name: clean, qty: null, unit: 'un' };
  return { name: name.trim(), qty, unit };
}

/** Texto com um item por linha → itens (linhas vazias ignoradas). */
export function parseShoppingText(text) {
  return String(text ?? '')
    .split(/\r?\n|;/)
    .map(parseShoppingLine)
    .filter(Boolean)
    .map((i) => ({ ...i, name: i.name.slice(0, 80) }));
}
