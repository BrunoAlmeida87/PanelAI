// Textos para compartilhar (WhatsApp / área de transferência).

import { MEAL_SLOTS, categoryLabel } from '../models/constants.js';
import { formatQty } from '../models/units.js';
import { formatDayMonth, formatWeekRange, weekDates, weekdayName, weekdayShort } from '../utils/dates.js';

export function entryLabel(entry, { recipesById, marmitasById = {} }) {
  if (!entry) return '';
  switch (entry.kind) {
    case 'recipe':
      return recipesById[entry.recipeId]?.name ?? 'Receita removida';
    case 'marmita': {
      const m = marmitasById[entry.marmitaId];
      const name = recipesById[m?.recipeId]?.name ?? 'Marmita';
      return `Marmita: ${name}`;
    }
    case 'out':
      return entry.text ? `Fora: ${entry.text}` : 'Fora de casa';
    case 'text':
      return entry.text || 'Refeição livre';
    default:
      return '';
  }
}

export function menuToText({ weekId, week, recipesById, marmitasById }) {
  const lines = [`*Cardápio PanelAI* — ${formatWeekRange(weekId)}`, ''];
  for (const date of weekDates(weekId)) {
    const day = week?.meals?.[date] ?? {};
    const parts = [];
    for (const slot of MEAL_SLOTS) {
      const entries = day[slot.id] ?? [];
      if (!entries.length) continue;
      parts.push(`  ${slot.label}: ${entries.map((e) => entryLabel(e, { recipesById, marmitasById })).join(' + ')}`);
    }
    if (!parts.length) continue;
    lines.push(`*${weekdayName(date)} (${formatDayMonth(date)})*`, ...parts, '');
  }
  if (lines.length === 2) lines.push('Nenhuma refeição planejada.');
  return lines.join('\n').trim();
}

export function shoppingToText({ weekId, groups, includeChecked = false }) {
  const lines = [`*Lista de compras PanelAI* — ${formatWeekRange(weekId)}`];
  let count = 0;
  for (const g of groups) {
    const header = g.marketDate ? `\n*Mercado ${weekdayShort(g.marketDate)} ${formatDayMonth(g.marketDate)}*` : '\n*Semana*';
    const block = [];
    for (const c of g.categories) {
      const items = c.entries.filter((e) => includeChecked || !e.checked);
      if (!items.length) continue;
      block.push(`_${categoryLabel(c.category)}_`);
      for (const e of items) {
        const qty = e.type === 'check' ? '' : e.type === 'extra' ? (e.qty ? ` — ${formatQty(e.qty, e.unit)}` : '') : ` — ${formatQty(e.toBuy, e.unit)}`;
        block.push(`${e.checked ? '☑' : '☐'} ${e.name}${qty}`);
        count++;
      }
    }
    if (block.length) lines.push(header, ...block);
  }
  if (!count) lines.push('', 'Nada a comprar. 🎉');
  return lines.join('\n');
}

export function monthlyToText(items, title = 'Mercado do mês') {
  const lines = [`*${title} — PanelAI*`];
  const byCat = new Map();
  for (const i of items) {
    if (!byCat.has(i.category)) byCat.set(i.category, []);
    byCat.get(i.category).push(i);
  }
  for (const [cat, list] of byCat) {
    lines.push('', `_${categoryLabel(cat)}_`);
    for (const i of list) lines.push(`☐ ${i.name} — ${formatQty(i.suggested, i.unit)}`);
  }
  if (!items.length) lines.push('', 'Nada a repor.');
  return lines.join('\n');
}

export function whatsappUrl(text) {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    /* tenta o método alternativo */
  }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand('copy');
    ta.remove();
    return ok;
  } catch {
    return false;
  }
}
