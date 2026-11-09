// Estado global do PanelAI.
// Todo o estado fica em memória e é gravado no IndexedDB a cada alteração
// (write-through), registro por registro. A interface assina as mudanças.

import { useEffect, useState } from 'preact/hooks';
import { initDB, loadAll, writeBatch } from './db.js';
import { buildSeed } from '../data/seed.js';
import { DEFAULT_SETTINGS } from '../models/constants.js';

const listeners = new Set();

let state = {
  ready: false,
  persistent: true,
  loadError: null,
  saveStatus: 'saved', // 'saved' | 'saving' | 'error'
  ingredients: {},
  recipes: {},
  pantry: {},
  weeks: {},
  marmitas: {},
  movements: [],
  purchases: [],
  settings: { ...DEFAULT_SETTINGS },
  monthlySession: { id: null, checked: {}, qty: {} },
  countDraft: {},
};

export const getState = () => state;

export function setState(patch) {
  state = { ...state, ...(typeof patch === 'function' ? patch(state) : patch) };
  for (const l of listeners) l(state);
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Hook: re-renderiza o componente quando o estado muda. */
export function useStore() {
  const [, force] = useState(0);
  useEffect(() => subscribe(() => force((n) => n + 1)), []);
  return state;
}

// ---------- Persistência ----------

let pending = Promise.resolve();
let inFlight = 0;

/** Enfileira gravações para manter a ordem e atualiza o indicador de salvamento. */
export function persist(ops) {
  if (!ops.length) return pending;
  inFlight++;
  setState({ saveStatus: 'saving' });
  pending = pending
    .then(() => writeBatch(ops))
    .then(() => {
      inFlight--;
      if (inFlight === 0) setState({ saveStatus: 'saved' });
    })
    .catch((err) => {
      inFlight--;
      console.error('Falha ao salvar', err);
      setState({ saveStatus: 'error' });
    });
  return pending;
}

export const flush = () => pending;

const byKey = (list, key) => Object.fromEntries(list.map((x) => [x[key], x]));

export function seedOps(seed) {
  const ops = [];
  for (const s of ['ingredients', 'recipes', 'pantry', 'weeks', 'marmitas']) {
    ops.push({ store: s, type: 'clear' });
    for (const v of Object.values(seed[s])) ops.push({ store: s, type: 'put', value: v });
  }
  for (const s of ['movements', 'purchases']) {
    ops.push({ store: s, type: 'clear' });
    for (const v of seed[s]) ops.push({ store: s, type: 'put', value: v });
  }
  ops.push({ store: 'meta', type: 'clear' });
  ops.push({ store: 'meta', type: 'put', value: { key: 'settings', value: seed.settings } });
  ops.push({ store: 'meta', type: 'put', value: { key: 'seeded', value: true } });
  return ops;
}

export function applyFullData(data) {
  setState({
    ingredients: data.ingredients,
    recipes: data.recipes,
    pantry: data.pantry,
    weeks: data.weeks,
    marmitas: data.marmitas,
    movements: [...data.movements].sort((a, b) => (a.date < b.date ? 1 : -1)),
    purchases: [...data.purchases].sort((a, b) => (a.date < b.date ? 1 : -1)),
    settings: { ...DEFAULT_SETTINGS, ...data.settings },
    monthlySession: { id: null, checked: {}, qty: {} },
    countDraft: {},
  });
}

export async function bootstrap() {
  try {
    const { persistent } = await initDB();
    const all = await loadAll();
    const meta = byKey(all.meta, 'key');
    if (!meta.seeded?.value) {
      const seed = buildSeed();
      await writeBatch(seedOps(seed));
      applyFullData(seed);
    } else {
      setState({
        ingredients: byKey(all.ingredients, 'id'),
        recipes: byKey(all.recipes, 'id'),
        pantry: byKey(all.pantry, 'ingredientId'),
        weeks: byKey(all.weeks, 'id'),
        marmitas: byKey(all.marmitas, 'id'),
        movements: all.movements.sort((a, b) => (a.date < b.date ? 1 : -1)),
        purchases: all.purchases.sort((a, b) => (a.date < b.date ? 1 : -1)),
        settings: { ...DEFAULT_SETTINGS, ...(meta.settings?.value ?? {}) },
        monthlySession: meta.monthlySession?.value ?? { id: null, checked: {}, qty: {} },
        countDraft: meta.countDraft?.value ?? {},
      });
    }
    setState({ ready: true, persistent });
    // Pede ao navegador para não apagar os dados em caso de pouco espaço.
    navigator.storage?.persist?.().catch(() => {});
  } catch (err) {
    console.error(err);
    setState({ ready: true, loadError: String(err?.message ?? err) });
  }
}
