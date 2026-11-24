// Estado global do PanelAI.
// Todo o estado fica em memória e é gravado a cada alteração (write-through),
// registro por registro. A interface assina as mudanças.
//
// Destino das gravações:
//  - modo "local": IndexedDB deste navegador (padrão);
//  - modo "cloud": Firestore da casa (src/cloud), compartilhado entre aparelhos.

import { useEffect, useReducer, useRef } from 'preact/hooks';
import { DEMO_DB_NAME, initDB, loadAll, writeBatch } from './db.js';
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
  tasks: {},
  taskTemplates: {},
  displayLayouts: {},
  // 'local' | 'cloud' | 'gate' (nuvem configurada, sem login: só a tela de entrar)
  // | 'demo' (modo de teste: dados de exemplo só neste navegador, sem nuvem)
  mode: 'local',
  cloud: {
    configured: cloudConfigured,
    status: cloudConfigured ? 'checking' : 'off', // off | checking | idle | active
    user: null,
    household: null,
    pending: 0,
    error: null,
    waiting: false, // sem internet e sem cópia da casa neste aparelho: aguardando o servidor
    serverSynced: false, // dados da casa confirmados pelo servidor nesta abertura
    readOnly: false, // conta de tela: só lê os dados da casa (não grava nada)
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
 * Hook: devolve o estado e re-renderiza o componente só quando muda alguma
 * parte que ele leu na última renderização (ex.: s.recipes). Assim o indicador
 * "Salvando…" ou a fila da nuvem não redesenham a tela inteira a cada toque.
 *
 * A inscrição confere o estado ao começar, então uma mudança ocorrida entre a
 * renderização e a inscrição (ex.: carregamento muito rápido do IndexedDB) não
 * se perde.
 */
export function useStore() {
  const [, force] = useReducer((n) => n + 1, 0);
  const snap = state;
  const keys = new Set();
  const tracked = useRef(null);
  tracked.current = { snap, keys };
  useEffect(() => {
    const check = (next) => {
      const t = tracked.current;
      for (const k of t.keys) {
        if (next[k] !== t.snap[k]) {
          force();
          return;
        }
      }
    };
    check(state);
    return subscribe(check);
  }, []);
  return new Proxy(snap, {
    get(target, key) {
      if (typeof key === 'string') keys.add(key);
      return target[key];
    },
  });
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
  for (const s of ['ingredients', 'recipes', 'pantry', 'weeks', 'marmitas', 'tasks', 'taskTemplates', 'displayLayouts']) {
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
    settings: { ...DEFAULT_SETTINGS, ...data.settings },
    monthlySession: { id: null, checked: {}, qty: {} },
    countDraft: {},
    tasks: data.tasks ?? {},
    taskTemplates: data.taskTemplates ?? {},
    displayLayouts: data.displayLayouts ?? {},
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
    tasks: {},
    taskTemplates: {},
    displayLayouts: {},
  };
  for (const [store, changes] of Object.entries(initial)) s = { ...s, ...reduceChanges(s, store, changes) };
  setState(s);
}

// ---------- Modo de teste ----------
// Na tela de entrar, qualquer pessoa pode experimentar o PanelAI com os dados
// de exemplo. Os dados ficam num banco separado deste navegador e nada vai
// para a nuvem (o Firebase nem é carregado).

const DEMO_KEY = 'panelai.demo';

function demoChosen() {
  try {
    return localStorage.getItem(DEMO_KEY) === '1';
  } catch {
    return false;
  }
}

/** Botão "Experimentar sem conta". */
export async function startDemo() {
  try {
    localStorage.setItem(DEMO_KEY, '1');
  } catch {
    /* sem localStorage: o teste dura até fechar a página */
  }
  setState({ ready: false });
  await bootstrapLocal({ demo: true });
}

/** Sai do modo de teste e volta para a tela de entrar (os dados de teste ficam guardados para a próxima vez). */
export function exitDemo() {
  try {
    localStorage.removeItem(DEMO_KEY);
  } catch {
    /* ignora */
  }
  window.location.reload();
}

export async function bootstrap() {
  if (cloudConfigured && demoChosen()) {
    await bootstrapLocal({ demo: true });
    return;
  }
  if (cloudConfigured) {
    // Com a nuvem configurada, só quem entrou com um e-mail da casa usa o app.
    // Sem login não há modo local: aparece apenas a tela de entrar.
    try {
      const { startCloudIfReady } = await import('../cloud/session.js');
      if (await startCloudIfReady()) return;
    } catch (err) {
      console.error('Falha ao conectar à nuvem', err);
      setState((s) => ({ cloud: { ...s.cloud, status: 'idle', error: `Não foi possível conectar à nuvem: ${err?.message ?? err}` } }));
    }
    setWriter(() => Promise.reject(new Error('Entre com sua conta para salvar.')));
    setState({ ready: true, mode: 'gate' });
    return;
  }
  await bootstrapLocal();
}

/**
 * Dados guardados só neste navegador (modo local), sem abrir o app com eles.
 * Usado ao criar a casa na nuvem a partir da tela de entrar: um aparelho que
 * já tinha dados locais leva esses dados para a casa. Devolve null se não há.
 */
export async function readLocalData() {
  try {
    await initDB();
    const all = await loadAll();
    const meta = byKey(all.meta, 'key');
    if (!meta.seeded?.value) return null;
    return {
      ingredients: byKey(all.ingredients, 'id'),
      recipes: byKey(all.recipes, 'id'),
      pantry: byKey(all.pantry, 'ingredientId'),
      weeks: byKey(all.weeks, 'id'),
      marmitas: byKey(all.marmitas, 'id'),
      movements: all.movements,
      purchases: all.purchases,
      tasks: byKey(all.tasks, 'id'),
      taskTemplates: byKey(all.taskTemplates, 'id'),
      displayLayouts: byKey(all.displayLayouts, 'id'),
      settings: { ...DEFAULT_SETTINGS, ...(meta.settings?.value ?? {}) },
      monthlySession: meta.monthlySession?.value ?? EMPTY_SESSION,
      countDraft: meta.countDraft?.value ?? {},
    };
  } catch (err) {
    console.warn('Não foi possível ler os dados deste aparelho', err);
    return null;
  }
}

async function bootstrapLocal({ demo = false } = {}) {
  try {
    setWriter(writeBatch);
    const { persistent } = await initDB(undefined, demo ? DEMO_DB_NAME : undefined);
    const all = await loadAll();
    const meta = byKey(all.meta, 'key');
    if (!meta.seeded?.value) {
      // Dados de demonstração: só baixados no primeiro acesso.
      const { buildSeed } = await import('../data/seed.js');
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
        tasks: byKey(all.tasks, 'id'),
        taskTemplates: byKey(all.taskTemplates, 'id'),
        displayLayouts: byKey(all.displayLayouts, 'id'),
      });
    }
    setState({ ready: true, persistent, mode: demo ? 'demo' : 'local' });
    // Pede ao navegador para não apagar os dados em caso de pouco espaço.
    navigator.storage?.persist?.().catch(() => {});
  } catch (err) {
    console.error(err);
    setState({ ready: true, mode: demo ? 'demo' : 'local', loadError: String(err?.message ?? err) });
  }
}
