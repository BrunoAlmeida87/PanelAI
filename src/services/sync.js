// Regras da sincronização na nuvem (sem acesso a banco ou rede: fácil de testar).
//
// Modelo: cada registro (uma receita, uma semana, um recado…) é enviado inteiro,
// com a hora da alteração. Em conflito vence a alteração mais recente
// ("última alteração vence"), registro por registro. Exclusões viajam como
// registros marcados com `deleted`.

/** Coleções sincronizadas e o campo que identifica cada registro. */
export const SYNC_COLLECTIONS = {
  ingredients: 'id',
  recipes: 'id',
  pantry: 'ingredientId',
  weeks: 'id',
  marmitas: 'id',
  movements: 'id',
  purchases: 'id',
  notes: 'id',
};
/** As configurações da casa viajam como um único registro. */
export const SETTINGS_COLLECTION = 'settings';
export const SETTINGS_ID = 'settings';

export const outboxKey = (collection, id) => `${collection}:${id}`;

const time = (iso) => {
  const t = Date.parse(iso);
  return Number.isNaN(t) ? 0 : t;
};

// ---------- Código da casa e convite ----------

const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'; // sem caracteres ambíguos (i, l, o, 0, 1)
export const MIN_CODE_LENGTH = 20;

/** Gera o segredo da casa: quem tem o código lê e altera os dados. */
export function makeHouseCode(random = (n) => crypto.getRandomValues(new Uint8Array(n))) {
  // Rejeita bytes fora de um múltiplo do alfabeto para não enviesar o sorteio.
  const limit = 256 - (256 % CODE_ALPHABET.length);
  let out = '';
  while (out.length < 32) {
    for (const b of random(48)) {
      if (b < limit && out.length < 32) out += CODE_ALPHABET[b % CODE_ALPHABET.length];
    }
  }
  return out.replace(/(.{4})(?=.)/g, '$1-');
}

export function normalizeUrl(url) {
  return String(url ?? '').trim().replace(/\/+$/, '');
}

/** Confere os dados de conexão. Retorna a lista de problemas (vazia se estiver tudo certo). */
export function validateConfig({ url, key, code }) {
  const errors = [];
  if (!/^https?:\/\/[^\s/]+/i.test(normalizeUrl(url))) errors.push('Informe o endereço do projeto (começa com https://).');
  if (!String(key ?? '').trim()) errors.push('Informe a chave pública do projeto.');
  if (String(code ?? '').trim().length < MIN_CODE_LENGTH) errors.push('O código da casa é curto demais.');
  return errors;
}

const toBase64Url = (text) => {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const fromBase64Url = (b64) => {
  const bin = atob(b64.replace(/-/g, '+').replace(/_/g, '/'));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
};

/** Convite: endereço, chave e código da casa em um único texto, para colar em outro aparelho. */
export function encodeInvite({ url, key, code }) {
  return toBase64Url(JSON.stringify({ v: 1, u: normalizeUrl(url), k: String(key).trim(), c: String(code).trim() }));
}

/** Aceita o convite puro ou um link que o contenha em `casa=`. Retorna null se for inválido. */
export function decodeInvite(text) {
  const raw = String(text ?? '').trim();
  const token = /casa=([A-Za-z0-9_-]+)/.exec(raw)?.[1] ?? raw;
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return null;
  try {
    const j = JSON.parse(fromBase64Url(token));
    const cfg = { url: normalizeUrl(j.u), key: String(j.k ?? ''), code: String(j.c ?? '') };
    return validateConfig(cfg).length ? null : cfg;
  } catch {
    return null;
  }
}

// ---------- Fila de envio ----------

/**
 * Converte operações de gravação local em itens da fila de envio.
 * `existingKeys(store)` devolve as chaves já gravadas — necessário para
 * transformar um "apagar tudo" em exclusões individuais.
 * Retorna um Map (chave → item); a última operação sobre um registro prevalece.
 */
export async function outboxEntries(ops, { now = new Date().toISOString(), existingKeys = async () => [] } = {}) {
  const out = new Map();
  const add = (collection, id, data) => {
    const key = outboxKey(collection, id);
    out.set(key, { key, collection, id: String(id), data, deleted: data == null, changedAt: now });
  };
  for (const op of ops) {
    if (op.store === 'meta') {
      // Só as configurações da casa são compartilhadas; rascunhos ficam no aparelho.
      if (op.type === 'put' && op.value?.key === 'settings') add(SETTINGS_COLLECTION, SETTINGS_ID, op.value.value);
      continue;
    }
    const keyField = SYNC_COLLECTIONS[op.store];
    if (!keyField) continue;
    if (op.type === 'put') add(op.store, op.value[keyField], op.value);
    else if (op.type === 'delete') add(op.store, op.key, null);
    else if (op.type === 'clear') for (const k of await existingKeys(op.store)) add(op.store, k, null);
  }
  return out;
}

/** Divide os itens em lotes limitados por quantidade e por tamanho (fotos de receita pesam). */
export function chunkRecords(records, { maxCount = 100, maxBytes = 1_500_000 } = {}) {
  const chunks = [];
  let current = [];
  let bytes = 0;
  for (const r of records) {
    const size = JSON.stringify(r.data ?? null).length + 200;
    if (current.length && (current.length >= maxCount || bytes + size > maxBytes)) {
      chunks.push(current);
      current = [];
      bytes = 0;
    }
    current.push(r);
    bytes += size;
  }
  if (current.length) chunks.push(current);
  return chunks;
}

// ---------- Mesclagem do que chega da nuvem ----------

/** Registro remoto bem formado? (protege o banco local de dados estranhos) */
export function isValidRemote(r) {
  if (!r || typeof r.collection !== 'string' || typeof r.id !== 'string' || !r.id) return false;
  if (r.deleted) return r.collection !== SETTINGS_COLLECTION && r.collection in SYNC_COLLECTIONS;
  if (!r.data || typeof r.data !== 'object' || Array.isArray(r.data)) return false;
  if (r.collection === SETTINGS_COLLECTION) return r.id === SETTINGS_ID;
  const keyField = SYNC_COLLECTIONS[r.collection];
  return !!keyField && r.data[keyField] === r.id;
}

/**
 * Decide o que fazer com os registros recebidos.
 *  - `outbox`: Map chave → item local ainda não enviado.
 *  - `sent`: Map chave → hora (ms) do que este aparelho acabou de enviar (ecos são ignorados).
 * Retorna { ops, dropOutbox, applied }: operações para o banco local, itens da
 * fila superados por uma versão remota mais nova e quantos registros mudaram.
 */
export function mergePull(records, { outbox = new Map(), sent = new Map() } = {}) {
  const ops = [];
  const dropOutbox = [];
  let applied = 0;
  for (const r of records) {
    if (!isValidRemote(r)) continue;
    const key = outboxKey(r.collection, r.id);
    const remoteTime = time(r.changedAt);
    if (sent.get(key) === remoteTime) continue; // eco do nosso próprio envio
    const local = outbox.get(key);
    if (local && time(local.changedAt) > remoteTime) continue; // a alteração local é mais nova e será enviada
    if (local) dropOutbox.push(key);
    if (r.collection === SETTINGS_COLLECTION) ops.push({ store: 'meta', type: 'put', value: { key: 'settings', value: r.data } });
    else if (r.deleted) ops.push({ store: r.collection, type: 'delete', key: r.id });
    else ops.push({ store: r.collection, type: 'put', value: r.data });
    applied++;
  }
  for (const key of dropOutbox) ops.push({ store: 'outbox', type: 'delete', key });
  return { ops, dropOutbox, applied };
}

/** Itens da fila já entregues: os que não mudaram desde a leitura usada no envio. */
export function deliveredKeys(sentRecords, currentOutbox) {
  return sentRecords.filter((r) => currentOutbox.get(r.key)?.changedAt === r.changedAt).map((r) => r.key);
}

// ---------- Acesso ao servidor (Supabase / PostgREST) ----------

export class SyncError extends Error {
  constructor(message, { status = 0, offline = false } = {}) {
    super(message);
    this.name = 'SyncError';
    this.status = status;
    this.offline = offline;
  }
}

function explain(status, body) {
  const msg = body?.message ?? '';
  if (status === 401 || status === 403) return 'A chave pública do projeto foi recusada. Confira a chave em Configurações.';
  if (status === 404 || /could not find the function/i.test(msg)) {
    return 'O projeto não tem as funções do PanelAI. Rode o arquivo supabase/panelai.sql no SQL Editor do Supabase.';
  }
  if (/codigo_invalido/.test(msg)) return 'Código da casa inválido.';
  if (/quadro_invalido/.test(msg)) return 'Token do quadro inválido.';
  return msg ? `Erro do servidor: ${msg}` : `Erro do servidor (${status}).`;
}

/**
 * Cliente das duas funções do banco: panelai_pull e panelai_push.
 * Usa só `fetch`, sem biblioteca do Supabase (mantém o site leve).
 */
export function createRemote({ url, key, fetch: fetchFn = globalThis.fetch }) {
  const base = `${normalizeUrl(url)}/rest/v1/rpc/`;
  const headers = { 'Content-Type': 'application/json', apikey: key };
  // Chaves antigas (JWT "anon") também vão no cabeçalho Authorization.
  if (String(key).startsWith('eyJ')) headers.Authorization = `Bearer ${key}`;

  async function rpc(name, body) {
    let res;
    try {
      res = await fetchFn(base + name, { method: 'POST', headers, body: JSON.stringify(body) });
    } catch {
      throw new SyncError('Sem conexão com a nuvem. As alterações ficam guardadas e serão enviadas depois.', { offline: true });
    }
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new SyncError(explain(res.status, json), { status: res.status });
    return json;
  }

  return {
    /** Registros alterados depois do cursor. → { records, cursor, more } */
    async pull(code, since = 0, limit = 50) {
      const r = await rpc('panelai_pull', { p_code: code, p_since: since, p_limit: limit });
      if (!r || !Array.isArray(r.records)) throw new SyncError('Resposta inesperada do servidor.');
      return { records: r.records, cursor: Number(r.cursor) || since, more: !!r.more };
    },
    /** Token somente leitura para o quadro (display) desta casa. */
    async panelToken(code) {
      const token = await rpc('panelai_panel_token', { p_code: code });
      if (typeof token !== 'string' || !token) throw new SyncError('Resposta inesperada do servidor.');
      return token;
    },
    /** Resumo do dia que o quadro mostra: { date, weekday, meals, tomorrow, notes, version, updatedAt }. */
    panel(token, date = null) {
      return rpc('panelai_panel', date ? { p_token: token, p_date: date } : { p_token: token });
    },
    /** Envia registros { collection, id, data, deleted, changedAt }. */
    push(code, records) {
      return rpc('panelai_push', {
        p_code: code,
        p_records: records.map(({ collection, id, data, deleted, changedAt }) => ({ collection, id, data, deleted, changedAt })),
      });
    },
  };
}
