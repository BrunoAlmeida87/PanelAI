// Estado global do PanelAI.
// Todo o estado fica em memória e é gravado a cada alteração (write-through),
// registro por registro. A interface assina as mudanças.
//
// Destino das gravações:
//  - modo "local": IndexedDB deste navegador (padrão);
//  - modo "cloud": Firestore da casa (src/cloud), compartilhado entre aparelhos.

import { useSyncExternalStore } from 'preact/compat';
import { initDB, loadAll, writeBatch } from './db.js';
import { buildSeed } from '../data/seed.js';
import { DEFAULT_SETTINGS } from '../models/constants.js';
import { cloudConfigured } from '../cloud/firebase-config.js';

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
  mode: 'local', // 'local' | 'cloud'
  cloud: {
    configured: cloudConfigured,
    status: cloudConfigured ? 'checking' : 'off', // off | checking | idle | active
    user: null,
    household: null,
    pending: 0,
    error: null,
  },
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
let writer = writeBatch;

/** Troca o destino das gravações (usado pelo modo nuvem). */
export function setWriter(fn) {
  writer = fn;
}

/** Enfileira gravações para manter a ordem e atualiza o indicador de salvamento. */
export function persist(ops) {
  if (!ops.length) return pending;
  inFlight++;
  setState({ saveStatus: 'saving' });
  pending = pending
    .then(() => writer(ops))
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

const EMPTY_SESSION = { id: null, checked: {}, qty: {} };
const sortByDateDesc = (list) => list.sort((a, b) => (a.date < b.date ? 1 : -1));

/** Aplica alterações de uma coleção (vindas da nuvem) a um estado. */
function reduceChanges(s, store, changes) {
  if (store === 'meta') {
    const patch = {};
    for (const c of changes) {
      const v = c.type === 'put' ? c.value?.value : undefined;
      if (c.key === 'settings') patch.settings = { ...DEFAULT_SETTINGS, ...(v ?? {}) };
      else if (c.key === 'monthlySession') patch.monthlySession = v ?? EMPTY_SESSION;
      else if (c.key === 'countDraft') patch.countDraft = v ?? {};
    }
    return patch;
  }
  if (store === 'movements' || store === 'purchases') {
    const map = new Map(s[store].map((x) => [x.id, x]));
    for (const c of changes) {
      if (c.type === 'put') map.set(c.key, c.value);
      else map.delete(c.key);
    }
    return { [store]: sortByDateDesc([...map.values()]) };
  }
  const next = { ...s[store] };
  for (const c of changes) {
    if (c.type === 'put') next[c.key] = c.value;
    else delete next[c.key];
  }
  return { [store]: next };
}

/** Alterações feitas em outro aparelho chegaram da nuvem. */
export function applyRemoteChanges(store, changes) {
  setState((s) => reduceChanges(s, store, changes));
}

/** Monta o estado a partir da primeira leitura da nuvem. */
export function loadFromChanges(initial) {
  let s = {
    ...state,
    ingredients: {},
    recipes: {},
    pantry: {},
    weeks: {},
    marmitas: {},
    movements: [],
    purchases: [],
    settings: { ...DEFAULT_SETTINGS },
    monthlySession: EMPTY_SESSION,
    countDraft: {},
  };
  for (const [store, changes] of Object.entries(initial)) s = { ...s, ...reduceChanges(s, store, changes) };
  setState(s);
}

export async function bootstrap() {
  if (cloudConfigured) {
    try {
      const { startCloudIfReady } = await import('../cloud/session.js');
      if (await startCloudIfReady()) return;
    } catch (err) {
      console.error('Falha ao conectar à nuvem', err);
      setState((s) => ({ cloud: { ...s.cloud, status: 'idle', error: `Não foi possível conectar à nuvem: ${err?.message ?? err}` } }));
    }
  }
  await bootstrapLocal();
}

async function bootstrapLocal() {
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
