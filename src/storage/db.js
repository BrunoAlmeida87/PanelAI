// Camada fina sobre IndexedDB. Cada coleção é um object store com chave estável.
// Se o IndexedDB não estiver disponível (ex.: navegação privada restrita),
// usamos memória e avisamos o usuário de que os dados não serão mantidos.

const DB_NAME = 'panelai';
// v2: recados (notes) e fila de sincronização (outbox).
const DB_VERSION = 2;

export const STORES = {
  ingredients: 'id',
  recipes: 'id',
  pantry: 'ingredientId',
  weeks: 'id',
  marmitas: 'id',
  movements: 'id',
  purchases: 'id',
  notes: 'id',
  meta: 'key',
  // Alterações locais ainda não enviadas para a nuvem (ver storage/sync.js).
  outbox: 'key',
};

let dbPromise = null;
let memory = null;

function openDB(factory) {
  return new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const [name, keyPath] of Object.entries(STORES)) {
        if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('Banco de dados bloqueado por outra aba.'));
  });
}

/** Inicializa o banco. Retorna { persistent: boolean }. */
export async function initDB(factory = globalThis.indexedDB) {
  if (!factory) {
    memory = Object.fromEntries(Object.keys(STORES).map((s) => [s, new Map()]));
    return { persistent: false };
  }
  try {
    dbPromise = openDB(factory);
    await dbPromise;
    return { persistent: true };
  } catch (err) {
    console.warn('IndexedDB indisponível, usando memória.', err);
    dbPromise = null;
    memory = Object.fromEntries(Object.keys(STORES).map((s) => [s, new Map()]));
    return { persistent: false };
  }
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function txDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Transação cancelada'));
  });
}

export async function getAll(store) {
  if (memory) return [...memory[store].values()];
  const db = await dbPromise;
  return reqToPromise(db.transaction(store, 'readonly').objectStore(store).getAll());
}

export async function getAllKeys(store) {
  if (memory) return [...memory[store].keys()];
  const db = await dbPromise;
  return reqToPromise(db.transaction(store, 'readonly').objectStore(store).getAllKeys());
}

/**
 * Aplica um lote de operações atomicamente.
 * ops: [{ store, type: 'put' | 'delete' | 'clear', value?, key? }]
 */
export async function writeBatch(ops) {
  if (!ops.length) return;
  if (memory) {
    for (const op of ops) {
      const m = memory[op.store];
      if (op.type === 'put') m.set(op.value[STORES[op.store]], structuredClone(op.value));
      else if (op.type === 'delete') m.delete(op.key);
      else if (op.type === 'clear') m.clear();
    }
    return;
  }
  const db = await dbPromise;
  const names = [...new Set(ops.map((o) => o.store))];
  const tx = db.transaction(names, 'readwrite');
  for (const op of ops) {
    const os = tx.objectStore(op.store);
    if (op.type === 'put') os.put(op.value);
    else if (op.type === 'delete') os.delete(op.key);
    else if (op.type === 'clear') os.clear();
  }
  await txDone(tx);
}

export const put = (store, value) => writeBatch([{ store, type: 'put', value }]);
export const remove = (store, key) => writeBatch([{ store, type: 'delete', key }]);

export async function loadAll() {
  const out = {};
  for (const s of Object.keys(STORES)) if (s !== 'outbox') out[s] = await getAll(s);
  return out;
}
