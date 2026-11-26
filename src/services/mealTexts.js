// Histórico das comidas escritas à mão no cardápio (funções puras).
//
// Guardado em meta/mealTexts: { [chave]: { text, n, last, hidden? } }
//   chave  = texto normalizado (sem acento, minúsculo): "Macarrão" e "macarrao" são a mesma comida
//   text   = como foi escrito da última vez
//   n      = quantas vezes foi usada
//   last   = data (AAAA-MM-DD) do último uso
//   hidden = apagada pela lixeira (some das sugestões; volta se for escrita e salva de novo)
//
// As semanas antigas vão para o arquivo depois de 120 dias, por isso o histórico
// fica guardado à parte. As comidas que já estão nas semanas abertas também
// entram nas sugestões (assim o que foi escrito antes desta versão não se perde).

import { normalizeText } from '../utils/id.js';

const MAX_LEN = 120;

/** Chave do histórico: espaços repetidos viram um só, sem acento e minúsculo. */
export const mealTextKey = (text) => normalizeText(String(text ?? '').replace(/\s+/g, ' '));

const cleanText = (text) => String(text ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_LEN);

/** Registra um uso. Devolve o item novo (ou null se o texto está vazio). */
export function rememberedItem(current, text, date) {
  const t = cleanText(text);
  if (!t) return null;
  const n = (Number(current?.n) || 0) + 1;
  return { text: t, n, last: date > (current?.last ?? '') ? date : (current?.last ?? date) };
}

/** Marca como apagada (lixeira). */
export function hiddenItem(current, text) {
  return { text: current?.text ?? cleanText(text), n: Number(current?.n) || 0, last: current?.last ?? '', hidden: true };
}

/** Comidas escritas nas semanas abertas: chave → { text, n, last }. */
export function textsFromWeeks(weeks) {
  const out = new Map();
  for (const w of Object.values(weeks ?? {})) {
    for (const [date, day] of Object.entries(w?.meals ?? {})) {
      for (const list of Object.values(day ?? {})) {
        for (const e of list ?? []) {
          if (e?.kind !== 'text') continue;
          const t = cleanText(e.text);
          if (!t) continue;
          const k = mealTextKey(t);
          const cur = out.get(k);
          out.set(k, { text: cur && cur.last > date ? cur.text : t, n: (cur?.n ?? 0) + 1, last: cur && cur.last > date ? cur.last : date });
        }
      }
    }
  }
  return out;
}

/**
 * Sugestões para a aba "Escrever".
 * Sem busca: as mais usadas. Com busca: as que contêm o que foi digitado
 * (sem ligar para acento), primeiro as que começam com ele.
 * Não sugere o próprio texto quando ele já está escrito igualzinho.
 */
export function suggestMealTexts({ stored = {}, weeks = {}, query = '', max = 12 }) {
  const all = new Map();
  for (const [k, item] of textsFromWeeks(weeks)) all.set(k, item);
  for (const [k, item] of Object.entries(stored ?? {})) {
    if (!item || typeof item !== 'object') continue;
    const fromWeeks = all.get(k);
    if (item.hidden) {
      // Apagada pela lixeira: some mesmo que ainda esteja em alguma semana.
      // Volta só quando alguém escreve de novo (rememberedItem tira o `hidden`).
      all.delete(k);
      continue;
    }
    const newer = fromWeeks && fromWeeks.last > (item.last ?? '');
    all.set(k, {
      text: newer ? fromWeeks.text : item.text,
      n: Math.max(Number(item.n) || 0, fromWeeks?.n ?? 0),
      last: newer ? fromWeeks.last : (item.last ?? ''),
    });
  }
  const q = mealTextKey(query);
  const list = [...all.entries()]
    .filter(([k]) => !q || (k.includes(q) && k !== q))
    .map(([key, v]) => ({ key, ...v, starts: q ? key.startsWith(q) : false }));
  list.sort(
    (a, b) =>
      Number(b.starts) - Number(a.starts) ||
      b.n - a.n ||
      (a.last < b.last ? 1 : a.last > b.last ? -1 : 0) ||
      a.text.localeCompare(b.text, 'pt-BR'),
  );
  return list.slice(0, max).map(({ key, text, n, last }) => ({ key, text, n, last }));
}

/** Junta dois históricos (ex.: o atual e o de um backup): fica o uso mais recente de cada comida. */
export function mergeMealTexts(a = {}, b = {}) {
  const out = { ...a };
  for (const [k, item] of Object.entries(b ?? {})) {
    const cur = out[k];
    if (!cur || (item?.last ?? '') > (cur.last ?? '') || (item?.last === cur.last && (Number(item?.n) || 0) > (Number(cur.n) || 0))) out[k] = item;
  }
  return out;
}

/** Limpa o histórico vindo de um backup (descarta o que não tem o formato certo). */
export function sanitizeMealTexts(v) {
  const out = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const item of Object.values(v)) {
    if (!item || typeof item !== 'object') continue;
    const text = cleanText(item.text);
    if (!text) continue;
    const last = typeof item.last === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(item.last) ? item.last : '';
    out[mealTextKey(text)] = { text, n: Math.max(0, Math.round(Number(item.n) || 0)), last, ...(item.hidden ? { hidden: true } : {}) };
  }
  return out;
}
