// Estado global do PanelAI.
// Todo o estado fica em memória e é gravado no IndexedDB a cada alteração
// (write-through), registro por registro. A interface assina as mudanças.

import { useSyncExternalStore } from 'preact/compat';
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
  notes: {},
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

/**
 * Hook: re-renderiza o componente quando o estado muda.
 * useSyncExternalStore confere o estado no momento da inscrição, então uma
 * mudança ocorrida entre a renderização e a inscrição (ex.: carregamento muito
 * rápido do IndexedDB) não se perde.
 */
export function useStore() {
  return useSyncExternalStore(subscribe, getState);
}

// ---------- Persistência ----------

let pending = Promise.resolve();
let inFlight = 0;
let persistHook = null;

/**
 * Registra uma função chamada antes de cada gravação. Ela recebe as operações
 * e pode devolver operações extras, gravadas na mesma transação (a
 * sincronização usa isso para anotar o que precisa ser enviado à nuvem).
 */
export function setPersistHook(fn) {
  persistHook = fn;
}

/** Executa uma tarefa de banco na mesma fila das gravações (sem intercalar com elas). */
export function runExclusive(fn) {
  const p = pending.then(fn);
  pending = p.catch(() => {});
  return p;
}

export const hasPendingWrites = () => inFlight > 0;

/** Enfileira gravações para manter a ordem e atualiza o indicador de salvamento. */
export function persist(ops) {
  if (!ops.length) return pending;
  inFlight++;
  setState({ saveStatus: 'saving' });
  pending = pending
    .then(async () => {
      const extra = persistHook ? await persistHook(ops) : [];
      await writeBatch(extra.length ? [...ops, ...extra] : ops);
    })
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
  for (const s of ['ingredients', 'recipes', 'pantry', 'weeks', 'marmitas', 'notes']) {
    ops.push({ store: s, type: 'clear' });
    for (const v of Object.values(seed[s] ?? {})) ops.push({ store: s, type: 'put', value: v });
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
    notes: data.notes ?? {},
    settings: { ...DEFAULT_SETTINGS, ...data.settings },
    monthlySession: { id: null, checked: {}, qty: {} },
    countDraft: {},
  });
}

function stateFromDB(all) {
  const meta = byKey(all.meta, 'key');
  return {
    ingredients: byKey(all.ingredients, 'id'),
    recipes: byKey(all.recipes, 'id'),
    pantry: byKey(all.pantry, 'ingredientId'),
    weeks: byKey(all.weeks, 'id'),
    marmitas: byKey(all.marmitas, 'id'),
    movements: all.movements.sort((a, b) => (a.date < b.date ? 1 : -1)),
    purchases: all.purchases.sort((a, b) => (a.date < b.date ? 1 : -1)),
    notes: byKey(all.notes, 'id'),
    settings: { ...DEFAULT_SETTINGS, ...(meta.settings?.value ?? {}) },
    monthlySession: meta.monthlySession?.value ?? { id: null, checked: {}, qty: {} },
    countDraft: meta.countDraft?.value ?? {},
  };
}

/**
 * Relê tudo do banco para a memória (usado depois que a sincronização grava
 * dados vindos de outro aparelho). Só troca o estado quando não há gravação
 * local na fila, para nunca sobrescrever uma alteração recém-feita na tela.
 */
export function reloadFromDB() {
  return runExclusive(async () => {
    const all = await loadAll();
    if (hasPendingWrites()) {
      reloadFromDB(); // entra de novo no fim da fila (sem aguardar: estamos dentro dela)
      return;
    }
    setState(stateFromDB(all));
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
      setState(stateFromDB(all));
    }
    setState({ ready: true, persistent });
    // Pede ao navegador para não apagar os dados em caso de pouco espaço.
    navigator.storage?.persist?.().catch(() => {});
  } catch (err) {
    console.error(err);
    setState({ ready: true, loadError: String(err?.message ?? err) });
  }
}
