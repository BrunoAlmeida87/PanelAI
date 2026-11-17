// Camada fina sobre IndexedDB. Cada coleção é um object store com chave estável.
// Se o IndexedDB não estiver disponível (ex.: navegação privada restrita),
// usamos memória e avisamos o usuário de que os dados não serão mantidos.

const DB_NAME = 'panelai';
/** Banco separado do modo de teste (dados de exemplo), para não misturar com dados reais. */
export const DEMO_DB_NAME = 'panelai-demo';
const DB_VERSION = 2; // v2: tarefas, modelos de tarefa e layouts do display

export const STORES = {
  ingredients: 'id',
  recipes: 'id',
  pantry: 'ingredientId',
  weeks: 'id',
  marmitas: 'id',
  movements: 'id',
  purchases: 'id',
  meta: 'key',
  tasks: 'id',
  taskTemplates: 'id',
  displayLayouts: 'id',
};

let dbPromise = null;
let memory = null;

function openDB(factory, name) {
  return new Promise((resolve, reject) => {
    const req = factory.open(name, DB_VERSION);
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
export async function initDB(factory = globalThis.indexedDB, name = DB_NAME) {
  if (!factory) {
    memory = Object.fromEntries(Object.keys(STORES).map((s) => [s, new Map()]));
    return { persistent: false };
  }
  try {
    dbPromise = openDB(factory, name);
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

/** Lê todas as coleções numa única transação (as leituras correm em paralelo). */
export async function loadAll() {
  const names = Object.keys(STORES);
  if (memory) return Object.fromEntries(names.map((s) => [s, [...memory[s].values()]]));
  const db = await dbPromise;
  const tx = db.transaction(names, 'readonly');
  const lists = await Promise.all(names.map((s) => reqToPromise(tx.objectStore(s).getAll())));
  return Object.fromEntries(names.map((s, i) => [s, lists[i]]));
}
