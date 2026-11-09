// Estoque (despensa): leitura em unidade-base, movimentações e reposição.

import { convert, roundForPurchase, factorToBase } from '../models/units.js';
import { uid } from '../utils/id.js';

export function newPantryItem(ingredient, extra = {}) {
  return {
    ingredientId: ingredient.id,
    qty: 0,
    unit: ingredient.baseUnit,
    min: 0,
    desired: 0,
    monthly: false,
    updatedAt: new Date().toISOString(),
    ...extra,
  };
}

/** Quantidade em estoque convertida para a unidade-base do ingrediente (ou null). */
export function stockInBase(item, ing) {
  if (!item || !ing) return null;
  const f = factorToBase(item.unit, ing);
  if (f == null) return null;
  return (Number(item.qty) || 0) * f;
}

/** Reposição mensal simples: máximo(0, desejado − atual). */
export function replenishment(item) {
  return Math.max(0, (Number(item.desired) || 0) - (Number(item.qty) || 0));
}

export function isBelowMin(item) {
  return (Number(item.min) || 0) > 0 && (Number(item.qty) || 0) < Number(item.min);
}

/**
 * Aplica uma variação ao estoque. `delta` é expresso em `unit`.
 * Retorna { item, movement } ou lança erro se as unidades forem incompatíveis.
 */
export function applyStockDelta({ item, ingredient, delta, unit, type, refId = null, note = '', now = new Date() }) {
  const converted = convert(delta, unit, item.unit, ingredient);
  if (converted == null) {
    throw new Error(`Não é possível converter ${unit} para ${item.unit} em "${ingredient.name}".`);
  }
  const before = Number(item.qty) || 0;
  const after = Math.max(0, roundQty(before + converted));
  const applied = roundQty(after - before);
  const ts = now.toISOString();
  return {
    item: { ...item, qty: after, updatedAt: ts },
    movement: {
      id: uid('mov'),
      date: ts,
      ingredientId: item.ingredientId,
      delta: applied,
      unit: item.unit,
      before,
      after,
      type,
      refId,
      note,
    },
  };
}

/** Define o estoque em um valor absoluto (contagem ou edição manual). */
export function setStock({ item, qty, type = 'contagem', refId = null, note = '', now = new Date() }) {
  const before = Number(item.qty) || 0;
  const after = Math.max(0, roundQty(Number(qty) || 0));
  const ts = now.toISOString();
  return {
    item: { ...item, qty: after, updatedAt: ts },
    movement:
      before === after
        ? null
        : {
            id: uid('mov'),
            date: ts,
            ingredientId: item.ingredientId,
            delta: roundQty(after - before),
            unit: item.unit,
            before,
            after,
            type,
            refId,
            note,
          },
  };
}

function roundQty(n) {
  return Math.round(n * 1000) / 1000;
}

/**
 * Lista do mercado do mês com conciliação semanal:
 * Compra sugerida = máximo(0, demanda semanal + estoque desejado − estoque disponível).
 */
export function monthlyList({ pantry, ingredientsById, demand }) {
  const out = [];
  for (const item of Object.values(pantry)) {
    if (!item.monthly) continue;
    const ing = ingredientsById[item.ingredientId];
    if (!ing) continue;
    const d = demand?.get(ing.id);
    const weekNeedBase = d?.totals?.[ing.baseUnit] ?? 0;
    const weekNeed = weekNeedBase ? convert(weekNeedBase, ing.baseUnit, item.unit, ing) ?? 0 : 0;
    const raw = Math.max(0, weekNeed + (Number(item.desired) || 0) - (Number(item.qty) || 0));
    out.push({
      ingredientId: ing.id,
      name: ing.name,
      category: ing.category,
      unit: item.unit,
      stock: Number(item.qty) || 0,
      min: Number(item.min) || 0,
      desired: Number(item.desired) || 0,
      weekNeed,
      suggested: roundForPurchase(raw, item.unit),
      belowMin: isBelowMin(item),
    });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}
