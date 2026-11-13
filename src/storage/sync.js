// Motor da sincronização: liga as regras (services/sync.js) ao banco local e à rede.
//
// - Toda gravação local também entra na fila `outbox` (mesma transação).
// - `syncNow()` envia a fila e depois busca o que mudou na nuvem desde o cursor.
// - Roda sozinho: ao abrir, ao voltar para o app, ao recuperar a conexão,
//   logo após cada alteração e a cada minuto enquanto o app está visível.

import { useSyncExternalStore } from 'preact/compat';
import { getAll, getAllKeys, loadAll, writeBatch } from './db.js';
import { flush, reloadFromDB, runExclusive, setPersistHook } from './store.js';
import {
  SETTINGS_COLLECTION,
  SETTINGS_ID,
  SYNC_COLLECTIONS,
  SyncError,
  chunkRecords,
  createRemote,
  deliveredKeys,
  encodeInvite,
  makeHouseCode,
  mergePull,
  normalizeUrl,
  outboxEntries,
  outboxKey,
  validateConfig,
} from '../services/sync.js';

const CFG_KEY = 'panelai.sync';
const INTERVAL_MS = 60_000;
const DEBOUNCE_MS = 1500;

let cfg = null; // { url, key, code, cursor }
let running = false;
let queued = false;
let timer = null;
const sent = new Map(); // chave → hora (ms) do último envio deste aparelho

let status = { connected: false, state: 'off', lastSync: null, error: null, pending: 0 };
const listeners = new Set();
function setStatus(patch) {
  status = { ...status, ...patch };
  for (const l of listeners) l(status);
}
export const getSyncStatus = () => status;
export function useSyncStatus() {
  return useSyncExternalStore((fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, getSyncStatus);
}

/** Servidor definido na publicação do site (opcional): VITE_SYNC_URL e VITE_SYNC_KEY. */
export function defaultServer() {
  return { url: normalizeUrl(import.meta.env?.VITE_SYNC_URL ?? ''), key: String(import.meta.env?.VITE_SYNC_KEY ?? '').trim() };
}

export const getSyncConfig = () => (cfg ? { url: cfg.url, key: cfg.key, code: cfg.code } : null);

function saveConfig() {
  try {
    if (cfg) localStorage.setItem(CFG_KEY, JSON.stringify(cfg));
    else localStorage.removeItem(CFG_KEY);
  } catch {
    /* sem localStorage: a conexão vale só até fechar o app */
  }
}

function loadConfig() {
  try {
    const raw = JSON.parse(localStorage.getItem(CFG_KEY) ?? 'null');
    if (raw && !validateConfig(raw).length) return { url: raw.url, key: raw.key, code: raw.code, cursor: Number(raw.cursor) || 0 };
  } catch {
    /* configuração ilegível: trata como desconectado */
  }
  return null;
}

const outboxMap = async () => new Map((await getAll('outbox')).map((o) => [o.key, o]));

function fail(err) {
  const offline = err instanceof SyncError && err.offline;
  setStatus({ state: offline ? 'offline' : 'error', error: offline ? null : String(err?.message ?? err) });
}

async function pushOutbox(remote) {
  const items = await runExclusive(() => getAll('outbox'));
  for (const chunk of chunkRecords(items)) {
    await remote.push(cfg.code, chunk);
    for (const r of chunk) sent.set(r.key, Date.parse(r.changedAt));
    // Remove da fila só o que não foi alterado de novo durante o envio.
    await runExclusive(async () => {
      const keys = deliveredKeys(chunk, await outboxMap());
      await writeBatch(keys.map((key) => ({ store: 'outbox', type: 'delete', key })));
    });
  }
}

async function pullChanges(remote) {
  let applied = 0;
  for (;;) {
    const page = await remote.pull(cfg.code, cfg.cursor);
    if (page.records.length) {
      applied += await runExclusive(async () => {
        const merged = mergePull(page.records, { outbox: await outboxMap(), sent });
        await writeBatch(merged.ops);
        return merged.applied;
      });
    }
    cfg.cursor = page.cursor;
    saveConfig();
    if (!page.more) break;
  }
  if (applied) await reloadFromDB();
  return applied;
}

/** Envia o que está pendente e busca as novidades. Seguro chamar a qualquer momento. */
export async function syncNow() {
  if (!cfg) return;
  if (running) {
    queued = true;
    return;
  }
  running = true;
  clearTimeout(timer);
  setStatus({ state: 'syncing' });
  const active = cfg;
  try {
    await flush();
    const remote = createRemote(active);
    await pushOutbox(remote);
    await pullChanges(remote);
    if (cfg === active) {
      const pending = (await runExclusive(() => getAllKeys('outbox'))).length;
      setStatus({ state: 'idle', error: null, lastSync: new Date().toISOString(), pending });
    }
  } catch (err) {
    if (cfg === active) fail(err);
  } finally {
    running = false;
    if (queued) {
      queued = false;
      scheduleSync();
    }
  }
}

function scheduleSync(delay = DEBOUNCE_MS) {
  if (!cfg) return;
  clearTimeout(timer);
  timer = setTimeout(syncNow, delay);
}

async function persistHook(ops) {
  if (!cfg) return [];
  const entries = await outboxEntries(ops, { existingKeys: getAllKeys });
  if (!entries.size) return [];
  setStatus({ pending: status.pending + entries.size });
  scheduleSync();
  return [...entries.values()].map((value) => ({ store: 'outbox', type: 'put', value }));
}

/** Cria uma casa nova na nuvem com os dados deste aparelho. Retorna o código gerado. */
export async function createHouse({ url, key }) {
  const next = { url: normalizeUrl(url), key: String(key).trim(), code: makeHouseCode(), cursor: 0 };
  const errors = validateConfig(next);
  if (errors.length) throw new SyncError(errors[0]);
  await createRemote(next).pull(next.code, 0, 1); // confere endereço, chave e funções antes de qualquer mudança
  await flush();
  await runExclusive(async () => {
    const all = await loadAll();
    const now = new Date().toISOString();
    const ops = [{ store: 'outbox', type: 'clear' }];
    const add = (collection, id, data) =>
      ops.push({ store: 'outbox', type: 'put', value: { key: outboxKey(collection, id), collection, id: String(id), data, deleted: false, changedAt: now } });
    for (const [collection, keyField] of Object.entries(SYNC_COLLECTIONS)) {
      for (const rec of all[collection]) add(collection, rec[keyField], rec);
    }
    const settings = all.meta.find((m) => m.key === 'settings')?.value;
    if (settings) add(SETTINGS_COLLECTION, SETTINGS_ID, settings);
    await writeBatch(ops);
  });
  cfg = next;
  saveConfig();
  setStatus({ connected: true, state: 'idle', error: null, lastSync: null });
  await syncNow();
  return next.code;
}

/** Conecta este aparelho a uma casa existente. Os dados locais são substituídos pelos da casa. */
export async function joinHouse({ url, key, code }) {
  const next = { url: normalizeUrl(url), key: String(key).trim(), code: String(code).trim(), cursor: 0 };
  const errors = validateConfig(next);
  if (errors.length) throw new SyncError(errors[0]);
  const remote = createRemote(next);
  const records = [];
  for (;;) {
    const page = await remote.pull(next.code, next.cursor);
    records.push(...page.records);
    next.cursor = page.cursor;
    if (!page.more) break;
  }
  if (!records.some((r) => !r.deleted)) {
    throw new SyncError('Nenhum dado encontrado para este código. Confira o convite ou crie a casa no primeiro aparelho.');
  }
  await flush();
  await runExclusive(async () => {
    const ops = [...Object.keys(SYNC_COLLECTIONS), 'outbox'].map((store) => ({ store, type: 'clear' }));
    ops.push(...mergePull(records).ops, { store: 'meta', type: 'put', value: { key: 'seeded', value: true } });
    await writeBatch(ops);
  });
  cfg = next;
  saveConfig();
  sent.clear();
  await reloadFromDB();
  setStatus({ connected: true, state: 'idle', error: null, lastSync: new Date().toISOString(), pending: 0 });
}

/** Para de sincronizar. Os dados continuam neste aparelho e na nuvem. */
export async function disconnect() {
  cfg = null;
  saveConfig();
  clearTimeout(timer);
  sent.clear();
  await runExclusive(() => writeBatch([{ store: 'outbox', type: 'clear' }]));
  setStatus({ connected: false, state: 'off', error: null, lastSync: null, pending: 0 });
}

/** Link para conectar outro aparelho (contém o código da casa: trate como senha). */
export function inviteLink() {
  if (!cfg) return '';
  return `${location.origin}${location.pathname}#/ajustes?casa=${encodeInvite(cfg)}`;
}

/**
 * Dados de acesso para o quadro (display): endereço, chave pública e um token
 * que só permite ler o resumo do dia. Também devolve o resumo atual, para conferência.
 */
export async function panelAccess() {
  if (!cfg) throw new SyncError('Conecte este aparelho a uma casa primeiro.');
  const remote = createRemote(cfg);
  const token = await remote.panelToken(cfg.code);
  return { endpoint: `${cfg.url}/rest/v1/rpc/panelai_panel`, key: cfg.key, token, preview: await remote.panel(token) };
}

/** Liga a sincronização automática. Chamar uma vez, depois de carregar o banco. */
export function startSync() {
  setPersistHook(persistHook);
  cfg = loadConfig();
  if (cfg) setStatus({ connected: true, state: 'idle' });
  if (typeof window === 'undefined') return;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow();
  });
  window.addEventListener('online', () => syncNow());
  setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine !== false) syncNow();
  }, INTERVAL_MS);
  syncNow();
}
