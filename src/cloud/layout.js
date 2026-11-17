// Como os registros do app são guardados no Firestore. Sem dependência do
// Firebase: só regras puras, testadas em tests/unit/cloud-layout.test.js.
//
// Todo documento continua no formato aceito pelas regras ({ v: JSON, t, by })
// e as coleções têm nomes simples, então firestore.rules não precisa mudar.
// Além de um documento por registro (coleções iguais às do IndexedDB):
//
//  - marks/{coleção~id~aparelho}: marcações que duas pessoas costumam mudar ao
//    mesmo tempo (itens marcados na lista, quantidades ajustadas, avulsos,
//    "a gosto" conferidos, tarefas de preparo, mercado do mês e contagem da
//    despensa). Cada aparelho grava só no próprio documento e, item a item,
//    vale a alteração mais recente. Duas pessoas marcando a lista no mercado
//    não apagam mais as marcações uma da outra. Depois de alguns dias sem
//    mudanças, as marcações são incorporadas ao registro ("fold").
//  - <coleção>Archive/{AAAA-MM}: registros antigos (histórico de estoque,
//    compras, tarefas concluídas, semanas e marmitas antigas) agrupados por
//    mês. Abrir o app lê um documento por mês em vez de um por registro.
//  - recipeImages/{receita}: a imagem da receita, separada para que favoritar
//    ou editar a receita não reenvie a imagem.
//
// O app não percebe nada disso: recebe e grava os registros inteiros, como no
// IndexedDB. A classe Mirror guarda o que o servidor tem (documentos físicos)
// e traduz nos dois sentidos.

import { STORES } from '../storage/db.js';
import { addDays } from '../utils/dates.js';

export const BASE_STORES = Object.keys(STORES);
export const MARKS = 'marks';
export const IMAGES = 'recipeImages';
export const MAX_DOC_CHARS = 900_000; // limite do Firestore: ~1 MB por documento

/** Marcações incorporadas ao registro depois de tanto tempo sem mudanças. */
export const FOLD_AFTER_MS = 2 * 86_400_000;

/** Registros antigos agrupados por mês: idade mínima e quais podem ir. */
export const ARCHIVES = {
  movements: { days: 30, date: (r) => r.date, ok: () => true },
  purchases: { days: 30, date: (r) => r.date, ok: () => true },
  tasks: { days: 45, date: (r) => r.date, ok: (t) => !!t.deleted || t.status === 'done' || t.status === 'postponed' },
  weeks: { days: 120, date: (r) => r.id, ok: () => true },
  marmitas: { days: 60, date: (r) => r.prepDate, ok: (m) => m.status === 'consumida' },
};
export const archiveColl = (store) => `${store}Archive`;
const ARCHIVE_COLLS = new Map(Object.keys(ARCHIVES).map((s) => [archiveColl(s), s]));

export const ALL_COLLECTIONS = [...BASE_STORES, ...ARCHIVE_COLLS.keys(), MARKS, IMAGES];

const WEEK_FIELDS = [
  { id: 'sc', path: ['shopping', 'checked'] },
  { id: 'sm', path: ['shopping', 'missing'] },
  { id: 'so', path: ['shopping', 'overrides'] },
  { id: 'se', path: ['shopping', 'extras'], list: true },
  { id: 'td', path: ['tasksDone'] },
];
const MONTHLY_FIELDS = [
  { id: 'mc', path: ['value', 'checked'] },
  { id: 'mq', path: ['value', 'qty'] },
];
const COUNT_FIELDS = [{ id: 'cd', path: ['value'] }];

/** Campos de um registro que são mesclados item a item (ou null). */
export function markFields(store, key) {
  if (store === 'weeks') return WEEK_FIELDS;
  if (store === 'meta' && key === 'monthlySession') return MONTHLY_FIELDS;
  if (store === 'meta' && key === 'countDraft') return COUNT_FIELDS;
  return null;
}

// ---------- utilidades ----------

const isObj = (v) => v != null && typeof v === 'object' && !Array.isArray(v);
const clone = (v) => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));

function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (isObj(v)) {
    const out = {};
    for (const k of Object.keys(v).sort()) if (v[k] !== undefined) out[k] = sortKeys(v[k]);
    return out;
  }
  return v;
}

/** JSON com chaves em ordem: o mesmo conteúdo gera sempre o mesmo texto. */
export const stable = (v) => JSON.stringify(sortKeys(v));

function parse(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return undefined;
  }
}

function getPath(obj, path) {
  let cur = obj;
  for (const p of path) {
    if (!isObj(cur)) return undefined;
    cur = cur[p];
  }
  return cur;
}

function setPath(obj, path, value) {
  let cur = obj;
  for (const p of path.slice(0, -1)) {
    if (!isObj(cur[p])) cur[p] = {};
    cur = cur[p];
  }
  if (value === undefined) delete cur[path[path.length - 1]];
  else cur[path[path.length - 1]] = value;
}

const listToMap = (list) => Object.fromEntries((Array.isArray(list) ? list : []).filter((e) => isObj(e) && e.id != null).map((e) => [String(e.id), e]));

/** Volta para lista mantendo a ordem original; itens novos entram em ordem de id (que começa pela data). */
function mapToList(map, original) {
  const out = [];
  const seen = new Set();
  for (const e of Array.isArray(original) ? original : []) {
    const id = isObj(e) ? String(e.id) : null;
    if (id != null && id in map && !seen.has(id)) {
      out.push(map[id]);
      seen.add(id);
    }
  }
  for (const id of Object.keys(map).sort()) if (!seen.has(id)) out.push(map[id]);
  return out;
}

const fieldValue = (rec, f) => {
  const v = getPath(rec, f.path);
  return f.list ? listToMap(v) : isObj(v) ? v : {};
};

/**
 * Aplica as marcações de vários aparelhos a um mapa: para cada item vale a
 * alteração mais recente (empate: maior id de aparelho). Marcações até `floor`
 * já foram incorporadas ao registro e são ignoradas.
 */
function applyEntries(map, perDevice, floor) {
  const winners = new Map();
  for (const [device, entries] of perDevice) {
    for (const [k, e] of Object.entries(entries ?? {})) {
      const a = Number(e?.a) || 0;
      if (a <= floor) continue;
      const w = winners.get(k);
      if (!w || a > w.a || (a === w.a && device > w.device)) winners.set(k, { a, device, e });
    }
  }
  if (!winners.size) return null;
  const next = { ...map };
  for (const [k, { e }] of winners) {
    if (e.x) delete next[k];
    else next[k] = e.v;
  }
  return next;
}

/**
 * Registro final = registro gravado + marcações dos aparelhos.
 * `marks`: Map(aparelho → { campo → { item → { a, v } | { a, x: 1 } } }).
 */
export function mergeMarks(store, key, base, marks) {
  const rec = clone(base);
  const fields = markFields(store, key);
  if (fields && marks?.size) {
    const floor = Number(rec.__foldedAt) || 0;
    for (const f of fields) {
      const perDevice = [...marks].map(([device, byField]) => [device, byField?.[f.id]]);
      const merged = applyEntries(fieldValue(rec, f), perDevice, floor);
      if (merged) setPath(rec, f.path, f.list ? mapToList(merged, getPath(rec, f.path)) : merged);
    }
  }
  return rec;
}

/** Data mais recente (ms) entre as marcações de um registro. */
function newestMark(marks) {
  let max = 0;
  for (const byField of marks.values()) {
    for (const entries of Object.values(byField ?? {})) {
      for (const e of Object.values(entries ?? {})) max = Math.max(max, Number(e?.a) || 0);
    }
  }
  return max;
}

/**
 * Incorpora as marcações ao registro (usado na manutenção, dentro de uma
 * transação). Recebe os textos lidos do servidor e devolve o novo texto do
 * registro, ou null se não há registro.
 */
export function foldRaw(store, key, baseRaw, markRaws) {
  const base = baseRaw == null ? null : parse(baseRaw);
  if (!isObj(base)) return null;
  const marks = new Map();
  for (const raw of markRaws) {
    const d = parse(raw);
    if (isObj(d) && d.s === store && d.k === key) marks.set(String(d.d), d.f);
  }
  const rec = mergeMarks(store, key, base, marks);
  rec.__foldedAt = Math.max(Number(base.__foldedAt) || 0, newestMark(marks));
  return stable(rec);
}

/** O registro já pode ir para o arquivo mensal? */
export function isArchivable(store, rec, today) {
  const cfg = ARCHIVES[store];
  if (!cfg || !isObj(rec)) return false;
  const d = cfg.date(rec);
  if (typeof d !== 'string' || !/^\d{4}-\d{2}-\d{2}/.test(d)) return false;
  return d.slice(0, 10) < addDays(today, -cfg.days) && !!cfg.ok(rec);
}

export const archiveMonth = (store, rec) => String(ARCHIVES[store].date(rec)).slice(0, 7);

/** Junta registros a um pacote mensal (substitui os de mesma chave). */
export function bundleRaw(store, bundleData, records) {
  const keyPath = STORES[store];
  const map = new Map();
  for (const r of isObj(bundleData) && Array.isArray(bundleData.records) ? bundleData.records : []) {
    if (isObj(r)) map.set(String(r[keyPath]), r);
  }
  for (const r of records) map.set(String(r[keyPath]), r);
  return stable({ records: [...map.values()] });
}

export const parseRaw = parse;

const mk = (store, key) => `${store}\u0000${key}`;

// ---------- Espelho do servidor ----------

export class Mirror {
  constructor() {
    /** coleção → id → { raw, data } (o que o servidor tem, incluindo gravações locais pendentes). */
    this.docs = new Map(ALL_COLLECTIONS.map((c) => [c, new Map()]));
    /** coleção do app → chave → { bundle, record } (registros nos pacotes mensais). */
    this.archived = new Map(Object.keys(ARCHIVES).map((s) => [s, new Map()]));
    /** "coleção\0chave" → Map(aparelho → { campo → itens }). */
    this.marks = new Map();
    /** id do documento de marcações → "coleção\0chave". */
    this.markOwner = new Map();
    /** coleção do app → chave → JSON do registro entregue ao app. */
    this.emitted = new Map(BASE_STORES.map((s) => [s, new Map()]));
    this.dirty = new Map(BASE_STORES.map((s) => [s, new Set()]));
  }

  docCount() {
    let n = 0;
    for (const m of this.docs.values()) n += m.size;
    return n;
  }

  /** Um documento mudou no servidor (raw = null: apagado). */
  applyDoc(coll, id, raw) {
    const map = this.docs.get(coll);
    if (!map) return;
    const prev = map.get(id);
    let next;
    if (raw == null) {
      if (!prev) return;
      map.delete(id);
    } else {
      if (prev && prev.raw === raw) return;
      const data = parse(raw);
      if (data === undefined) {
        console.warn('Registro inválido na nuvem', coll, id);
        return;
      }
      next = { raw, data };
      map.set(id, next);
    }
    this.#index(coll, id, prev?.data, next?.data);
  }

  #index(coll, id, prev, next) {
    if (this.dirty.has(coll)) {
      this.dirty.get(coll).add(id);
      return;
    }
    if (coll === IMAGES) {
      this.dirty.get('recipes').add(id);
      return;
    }
    if (coll === MARKS) {
      const owner = this.markOwner.get(id);
      if (owner) {
        const [store, key] = owner.split('\u0000');
        this.marks.get(owner)?.delete(String(prev?.d));
        if (this.marks.get(owner)?.size === 0) this.marks.delete(owner);
        this.markOwner.delete(id);
        this.dirty.get(store)?.add(key);
      }
      if (isObj(next) && this.dirty.has(next.s) && next.k != null && next.d != null) {
        const k = mk(next.s, String(next.k));
        if (!this.marks.has(k)) this.marks.set(k, new Map());
        this.marks.get(k).set(String(next.d), isObj(next.f) ? next.f : {});
        this.markOwner.set(id, k);
        this.dirty.get(next.s).add(String(next.k));
      }
      return;
    }
    const store = ARCHIVE_COLLS.get(coll);
    if (!store) return;
    const index = this.archived.get(store);
    const keyPath = STORES[store];
    for (const r of isObj(prev) && Array.isArray(prev.records) ? prev.records : []) {
      const key = String(r?.[keyPath]);
      if (index.get(key)?.bundle === id) {
        index.delete(key);
        this.dirty.get(store).add(key);
      }
    }
    for (const r of isObj(next) && Array.isArray(next.records) ? next.records : []) {
      if (!isObj(r) || r[keyPath] == null) continue;
      const key = String(r[keyPath]);
      index.set(key, { bundle: id, record: r });
      this.dirty.get(store).add(key);
    }
  }

  /** Chaves de todos os registros de uma coleção do app (avulsos e arquivados). */
  keys(store) {
    const out = new Set(this.docs.get(store)?.keys() ?? []);
    for (const k of this.archived.get(store)?.keys() ?? []) out.add(k);
    return out;
  }

  /** Registro como o app deve vê-lo (ou null). */
  record(store, key) {
    const base = this.docs.get(store)?.get(key)?.data ?? this.archived.get(store)?.get(key)?.record;
    if (!isObj(base)) return null;
    const rec = mergeMarks(store, key, base, this.marks.get(mk(store, key)));
    if (store === 'recipes' && rec.__img) rec.image = this.docs.get(IMAGES).get(key)?.data?.image ?? null;
    delete rec.__img;
    delete rec.__foldedAt;
    return rec;
  }

  /** Alterações a entregar ao app desde a última chamada: { coleção: [{ type, key, value }] }. */
  flush() {
    const out = {};
    for (const [store, keys] of this.dirty) {
      if (!keys.size) continue;
      const emitted = this.emitted.get(store);
      const changes = [];
      for (const key of keys) {
        const rec = this.record(store, key);
        const json = rec ? stable(rec) : null;
        if (json === (emitted.get(key) ?? null)) continue;
        if (json == null) {
          emitted.delete(key);
          changes.push({ type: 'delete', key });
        } else {
          emitted.set(key, json);
          changes.push({ type: 'put', key, value: rec });
        }
      }
      keys.clear();
      if (changes.length) out[store] = changes;
    }
    return out;
  }

  /**
   * Traduz operações do app ({ store, type: put | delete | clear }) em
   * gravações de documentos e já as aplica ao espelho (gravação otimista).
   * Devolve { writes: [{ coll, id, raw | null }], errors: [texto] }.
   */
  plan(ops, { device, now = Date.now() }) {
    // 1. Estado final de cada registro.
    const final = new Map();
    const cleared = new Set();
    for (const op of ops) {
      if (op.type === 'clear') {
        cleared.add(op.store);
        for (const w of final.values()) if (w.store === op.store) w.value = null;
      } else if (op.type === 'put') {
        const key = String(op.value[STORES[op.store]]);
        final.set(mk(op.store, key), { store: op.store, key, value: op.value });
      } else if (op.type === 'delete') {
        final.set(mk(op.store, String(op.key)), { store: op.store, key: String(op.key), value: null });
      }
    }

    // 2. Documentos a gravar (o último valor de cada documento vale).
    const writes = new Map();
    const errors = [];
    const exists = (coll, id) => (writes.has(`${coll}\u0000${id}`) ? writes.get(`${coll}\u0000${id}`).raw != null : this.docs.get(coll).has(id));
    const set = (coll, id, raw) => {
      if (raw.length > MAX_DOC_CHARS) {
        errors.push(`Registro grande demais para a nuvem (${coll}: ${id}). Use imagens menores.`);
        return false;
      }
      writes.set(`${coll}\u0000${id}`, { coll, id, raw });
      return true;
    };
    const del = (coll, id) => {
      if (exists(coll, id)) writes.set(`${coll}\u0000${id}`, { coll, id, raw: null });
    };
    const bundles = new Map(); // "coll\0id" → { coll, id, store, records: Map }
    const bundleRemove = (store, bundleId, key) => {
      const coll = archiveColl(store);
      const k = `${coll}\u0000${bundleId}`;
      if (!bundles.has(k)) {
        const data = this.docs.get(coll).get(bundleId)?.data;
        const records = new Map((Array.isArray(data?.records) ? data.records : []).map((r) => [String(r?.[STORES[store]]), r]));
        bundles.set(k, { coll, id: bundleId, records });
      }
      bundles.get(k).records.delete(key);
    };
    const marksOf = (store, key) => [...this.markOwner].filter(([, owner]) => owner === mk(store, key)).map(([id]) => id);

    for (const store of cleared) {
      for (const id of this.docs.get(store).keys()) del(store, id);
      if (ARCHIVES[store]) for (const id of this.docs.get(archiveColl(store)).keys()) del(archiveColl(store), id);
      for (const [id, owner] of this.markOwner) if (owner.startsWith(`${store}\u0000`)) del(MARKS, id);
      if (store === 'recipes') for (const id of this.docs.get(IMAGES).keys()) del(IMAGES, id);
    }

    for (const { store, key, value } of final.values()) {
      const live = cleared.has(store) ? undefined : this.docs.get(store).get(key);
      const arch = cleared.has(store) ? undefined : this.archived.get(store)?.get(key);

      if (value == null) {
        if (live) del(store, key);
        if (arch) bundleRemove(store, arch.bundle, key);
        for (const id of marksOf(store, key)) del(MARKS, id);
        if (store === 'recipes') del(IMAGES, key);
        continue;
      }

      // Registro arquivado que mudou volta a ser avulso.
      if (arch && !live) bundleRemove(store, arch.bundle, key);

      const rec = clone(value);
      if (store === 'recipes') {
        const img = typeof rec.image === 'string' && rec.image ? rec.image : null;
        if (img) {
          const cur = this.docs.get(IMAGES).get(key)?.data?.image ?? null;
          if (img !== cur && !set(IMAGES, key, stable({ image: img }))) continue;
          rec.image = null;
          rec.__img = true;
        } else {
          del(IMAGES, key);
        }
      }

      const fields = markFields(store, key);
      const current = live || arch ? this.record(store, key) : null;
      if (fields && current && !cleared.has(store)) {
        // Marcações: só os itens que mudaram, no documento deste aparelho.
        const changed = {};
        let any = false;
        for (const f of fields) {
          const a = fieldValue(current, f);
          const b = fieldValue(rec, f);
          for (const k of new Set([...Object.keys(a), ...Object.keys(b)])) {
            if (stable(a[k] ?? null) === stable(b[k] ?? null)) continue;
            (changed[f.id] ??= {})[k] = b[k] !== undefined ? { a: now, v: b[k] } : { a: now, x: 1 };
            any = true;
          }
        }
        if (any) {
          const id = `${store}~${key}~${device}`;
          const prev = this.docs.get(MARKS).get(id)?.data;
          const f = isObj(prev?.f) ? clone(prev.f) : {};
          for (const [fid, entries] of Object.entries(changed)) f[fid] = { ...(f[fid] ?? {}), ...entries };
          set(MARKS, id, stable({ s: store, k: key, d: device, f }));
        }
        // O restante do registro só é regravado se mudou de verdade.
        const rest = (r) => {
          const c = clone(r);
          delete c.updatedAt;
          delete c.image;
          delete c.__img;
          delete c.__foldedAt;
          for (const fl of fields) setPath(c, fl.path, undefined);
          return stable(c);
        };
        if (live && rest(rec) === rest(current)) continue;
        const foldedAt = (live?.data ?? arch?.record)?.__foldedAt;
        if (foldedAt) rec.__foldedAt = foldedAt;
      }

      const raw = stable(rec);
      if (live?.raw !== raw) set(store, key, raw);
    }

    for (const b of bundles.values()) {
      if (!b.records.size) del(b.coll, b.id);
      else set(b.coll, b.id, stable({ records: [...b.records.values()] }));
    }

    // 3. Aplica ao espelho e marca o que o app já tem como entregue.
    const list = [...writes.values()];
    for (const w of list) this.applyDoc(w.coll, w.id, w.raw);
    this.flush();
    return { writes: list, errors };
  }

  /** Registros cujas marcações estão paradas há tempo suficiente para serem incorporadas. */
  foldCandidates(now = Date.now()) {
    const out = [];
    for (const [owner, marks] of this.marks) {
      if (newestMark(marks) >= now - FOLD_AFTER_MS) continue;
      const [store, key] = owner.split('\u0000');
      out.push({ store, key, markIds: [...this.markOwner].filter(([, o]) => o === owner).map(([id]) => id) });
    }
    return out;
  }

  /** Registros avulsos que já podem ir para o arquivo mensal, agrupados por mês. */
  archiveCandidates(today) {
    const out = [];
    for (const store of Object.keys(ARCHIVES)) {
      const byMonth = new Map();
      for (const [key, { data }] of this.docs.get(store)) {
        if (this.marks.has(mk(store, key)) || !isArchivable(store, data, today)) continue;
        const month = archiveMonth(store, data);
        if (!byMonth.has(month)) byMonth.set(month, []);
        byMonth.get(month).push(key);
      }
      for (const [month, keys] of byMonth) out.push({ store, month, keys });
    }
    return out;
  }

  /** Pacotes existentes de um mês: "AAAA-MM", "AAAA-MM~2"… (o último é o que recebe registros). */
  bundleIds(store, month) {
    const ids = [...this.docs.get(archiveColl(store)).keys()].filter((id) => id === month || id.startsWith(`${month}~`));
    const n = (id) => (id === month ? 1 : Number(id.split('~')[1]) || 1);
    return ids.sort((a, b) => n(a) - n(b));
  }
}

export function nextBundleId(month, ids) {
  if (!ids.length) return month;
  const last = ids[ids.length - 1];
  const n = last === month ? 1 : Number(last.split('~')[1]) || 1;
  return `${month}~${n + 1}`;
}
