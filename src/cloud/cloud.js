// Integração com o Firebase: login (Auth) e dados compartilhados (Firestore).
//
// Este módulo só é carregado quando a nuvem está configurada
// (src/cloud/firebase-config.js), para não pesar no uso apenas local.
//
// Modelo no Firestore:
//   households/{casa}                    { name, ownerEmail, memberEmails[], viewerEmails[]?, createdAt }
//     memberEmails: pessoas da casa (leem e alteram);
//     viewerEmails: contas de tela, só leitura (ex.: a que gera a imagem do display).
//   households/{casa}/{coleção}/{id}     { v: JSON, t: data do servidor, by: e-mail }
// As coleções são as mesmas do IndexedDB (src/storage/db.js), mais as de
// marcações, arquivo mensal e imagens. Como os registros do app viram
// documentos (e vice-versa) está em src/cloud/layout.js.

import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  reload,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  arrayRemove,
  arrayUnion,
  clearIndexedDbPersistence,
  collection,
  connectFirestoreEmulator,
  doc,
  getDocs,
  initializeFirestore,
  memoryLocalCache,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  terminate,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { appCheckSiteKey, emulatorHost, firebaseConfig } from './firebase-config.js';
import { ALL_COLLECTIONS, BASE_STORES, MARKS, Mirror, archiveColl, bundleRaw, foldRaw, isArchivable, archiveMonth, nextBundleId, parseRaw, MAX_DOC_CHARS } from './layout.js';
import { todayISO } from '../utils/dates.js';
import { uid } from '../utils/id.js';

const HOUSEHOLDS = 'households';
const BATCH_SIZE = 400; // limite do Firestore: 500 gravações por lote
export const MAX_MEMBERS = 10;
export const MAX_VIEWERS = 3;

let app = null;
let auth = null;
let db = null;

// Opções usadas pelos testes (vários "aparelhos" no mesmo processo, sem IndexedDB).
const options = { appName: undefined, emulatorHost, deviceId: null };
export function configureCloud(opts) {
  Object.assign(options, opts);
}

function init() {
  if (app) return;
  app = initializeApp(firebaseConfig, options.appName);
  // App Check (opcional): só aceita pedidos vindos do site publicado.
  if (appCheckSiteKey && !options.emulatorHost && typeof window !== 'undefined') {
    try {
      initializeAppCheck(app, { provider: new ReCaptchaV3Provider(appCheckSiteKey), isTokenAutoRefreshEnabled: true });
    } catch (err) {
      console.warn('App Check não iniciado', err);
    }
  }
  auth = getAuth(app);
  // Cache persistente: o app abre e grava sem internet; o Firestore envia
  // as alterações quando a conexão volta.
  db = initializeFirestore(app, {
    localCache:
      typeof indexedDB === 'undefined' ? memoryLocalCache() : persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    ignoreUndefinedProperties: true,
  });
  if (options.emulatorHost) {
    connectAuthEmulator(auth, `http://${options.emulatorHost}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, options.emulatorHost, 8080);
  }
}

/** Identificador deste aparelho (as marcações de cada aparelho ficam num documento próprio). */
function deviceId() {
  if (options.deviceId) return options.deviceId;
  try {
    let id = localStorage.getItem('panelai.deviceId');
    if (!id) {
      id = uid('ap').slice(3, 15);
      localStorage.setItem('panelai.deviceId', id);
    }
    options.deviceId = id;
  } catch {
    options.deviceId = uid('ap').slice(3, 15);
  }
  return options.deviceId;
}

// ---------- Login ----------

export const normalizeEmail = (e) => String(e ?? '').trim().toLowerCase();

function summarize(u) {
  if (!u) return null;
  return {
    uid: u.uid,
    email: normalizeEmail(u.email),
    name: u.displayName ?? '',
    verified: !!u.emailVerified,
    provider: u.providerData?.[0]?.providerId ?? 'password',
  };
}

/** Usuário atual, depois de o Firebase restaurar a sessão salva (funciona offline). */
export async function currentUser() {
  init();
  await auth.authStateReady();
  return summarize(auth.currentUser);
}

export function watchUser(cb) {
  init();
  return onAuthStateChanged(auth, (u) => cb(summarize(u)));
}

export async function signInGoogle() {
  init();
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const r = await signInWithPopup(auth, provider);
  return summarize(r.user);
}

export async function signInEmail(email, password) {
  init();
  const r = await signInWithEmailAndPassword(auth, normalizeEmail(email), password);
  return summarize(r.user);
}

export async function signUpEmail(email, password) {
  init();
  const r = await createUserWithEmailAndPassword(auth, normalizeEmail(email), password);
  await sendEmailVerification(r.user);
  return summarize(r.user);
}

export async function resendVerification() {
  init();
  if (auth.currentUser) await sendEmailVerification(auth.currentUser);
}

export async function resetPassword(email) {
  init();
  await sendPasswordResetEmail(auth, normalizeEmail(email));
}

/** Recarrega o usuário (após confirmar o e-mail) e renova o token usado pelas regras. */
export async function refreshUser() {
  init();
  if (!auth.currentUser) return null;
  await reload(auth.currentUser);
  await auth.currentUser.getIdToken(true);
  return summarize(auth.currentUser);
}

/** Sai da conta e apaga a cópia local dos dados da nuvem neste aparelho. */
export async function signOutAndClear() {
  init();
  stopSync();
  await signOut(auth);
  try {
    await terminate(db);
    await clearIndexedDbPersistence(db);
  } catch (err) {
    console.warn('Não foi possível limpar o cache da nuvem', err);
  }
}

// ---------- Casa (grupo de pessoas que compartilham os dados) ----------

const householdFromSnap = (snap) => {
  const d = snap.data();
  return { id: snap.id, name: d.name ?? 'Casa', ownerEmail: d.ownerEmail, memberEmails: d.memberEmails ?? [], viewerEmails: d.viewerEmails ?? [] };
};

/** Papel de um e-mail na casa: 'member' (lê e altera), 'viewer' (tela, só lê) ou null. */
export function roleIn(household, email) {
  const e = normalizeEmail(email);
  if (!household || !e) return null;
  if (household.memberEmails.includes(e)) return 'member';
  if ((household.viewerEmails ?? []).includes(e)) return 'viewer';
  return null;
}

/**
 * Procura a casa em que o e-mail do usuário está cadastrado: primeiro como
 * pessoa da casa, depois como conta de tela. Devolve a casa com `role`.
 */
export async function findMyHousehold() {
  init();
  const email = normalizeEmail(auth.currentUser?.email);
  if (!email) return null;
  for (const [field, role] of [
    ['memberEmails', 'member'],
    ['viewerEmails', 'viewer'],
  ]) {
    const snap = await getDocs(query(collection(db, HOUSEHOLDS), where(field, 'array-contains', email)));
    if (!snap.empty) return { ...householdFromSnap(snap.docs[0]), role };
  }
  return null;
}

/**
 * Cria a casa e envia os dados (operações no formato de src/storage/db.js).
 * O id da casa é o id da conta: cada conta cria no máximo uma casa.
 */
export async function createHousehold(name, ops) {
  init();
  const email = normalizeEmail(auth.currentUser?.email);
  const ref = doc(db, HOUSEHOLDS, auth.currentUser.uid);
  await setDoc(ref, {
    name: String(name || 'Minha casa').slice(0, 60),
    ownerEmail: email,
    memberEmails: [email],
    createdAt: serverTimestamp(),
  });
  await commitOps(newTarget(ref.id), ops, { wait: true });
  return ref.id;
}

export async function addMember(householdId, email) {
  init();
  await updateDoc(doc(db, HOUSEHOLDS, householdId), { memberEmails: arrayUnion(normalizeEmail(email)) });
}

export async function removeMember(householdId, email) {
  init();
  await updateDoc(doc(db, HOUSEHOLDS, householdId), { memberEmails: arrayRemove(normalizeEmail(email)) });
}

/** Conta de tela (só leitura). Só o responsável adiciona e remove. */
export async function addViewer(householdId, email) {
  init();
  await updateDoc(doc(db, HOUSEHOLDS, householdId), { viewerEmails: arrayUnion(normalizeEmail(email)) });
}

export async function removeViewer(householdId, email) {
  init();
  await updateDoc(doc(db, HOUSEHOLDS, householdId), { viewerEmails: arrayRemove(normalizeEmail(email)) });
}

/** Pessoa (que não é a responsável) sai da casa. */
export async function leaveHousehold(householdId) {
  init();
  await updateDoc(doc(db, HOUSEHOLDS, householdId), { memberEmails: arrayRemove(normalizeEmail(auth.currentUser?.email)) });
}

export async function renameHousehold(householdId, name) {
  init();
  await updateDoc(doc(db, HOUSEHOLDS, householdId), { name: String(name).slice(0, 60) });
}

// ---------- Sincronização ----------

const encId = (key) => encodeURIComponent(String(key));
const decId = (id) => decodeURIComponent(id);
const ref = (target, coll, id) => doc(db, HOUSEHOLDS, target.householdId, coll, encId(id));

function newTarget(householdId) {
  return {
    householdId,
    mirror: new Mirror(),
    pending: 0,
    unsubs: [],
    onPending: () => {},
    onError: () => {},
  };
}

let active = null;

/**
 * Começa a ouvir os dados da casa em tempo real.
 * Resolve com { [coleção]: alterações[] } da primeira leitura. Depois,
 * alterações vindas de outros aparelhos chegam em onChanges.
 *
 * requireServer: este aparelho ainda não tem uma cópia completa da casa, então
 * só abre com os dados vindos do servidor (sem internet, chama onWaiting e
 * continua esperando). Assim o app nunca abre "vazio" e grava por cima.
 * onServerSynced: todas as coleções foram confirmadas pelo servidor.
 */
export function startSync(householdId, { onChanges, onHousehold, onPending, onError, onWaiting = () => {}, onServerSynced = () => {}, requireServer = false }) {
  init();
  stopSync();
  const target = newTarget(householdId);
  target.onPending = onPending;
  target.onError = onError;
  active = target;

  return new Promise((resolve) => {
    const seen = new Map(ALL_COLLECTIONS.map((c) => [c, { any: false, server: false }]));
    let resolved = false;
    let serverDone = false;
    const all = (k) => [...seen.values()].every((s) => s[k]);
    const finish = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      resolve(target.mirror.flush());
    };
    let timedOut = false;
    // Cópia local com os dados da casa (as configurações só existem depois de um download completo).
    const localCopy = () => BASE_STORES.every((c) => seen.get(c).any) && target.mirror.docs.get('meta').has('settings');
    const check = () => {
      if (!resolved && (all('server') || (!requireServer && all('any') && target.mirror.docCount() > 0) || (timedOut && localCopy()))) finish();
      if (!serverDone && all('server')) {
        serverDone = true;
        onServerSynced();
      }
    };
    // Sem resposta do servidor: com cópia local, abre com ela; sem cópia, avisa e espera.
    const timer = setTimeout(() => {
      if (resolved) return;
      timedOut = true;
      if (!requireServer || localCopy()) finish();
      else onWaiting();
    }, 12000);

    target.unsubs.push(
      onSnapshot(
        doc(db, HOUSEHOLDS, householdId),
        (snap) => onHousehold(snap.exists() ? householdFromSnap(snap) : null),
        (err) => onError(err, 'household'),
      ),
    );

    for (const coll of ALL_COLLECTIONS) {
      const unsub = onSnapshot(
        collection(db, HOUSEHOLDS, householdId, coll),
        { includeMetadataChanges: true },
        (snap) => {
          if (active !== target) return;
          for (const ch of snap.docChanges()) {
            target.mirror.applyDoc(coll, decId(ch.doc.id), ch.type === 'removed' ? null : ch.doc.data().v);
          }
          const st = seen.get(coll);
          st.any = true;
          if (!snap.metadata.fromCache) st.server = true;
          if (resolved) {
            const changes = target.mirror.flush();
            for (const [store, list] of Object.entries(changes)) onChanges(store, list);
          }
          check();
        },
        (err) => onError(err, coll),
      );
      target.unsubs.push(unsub);
    }
  });
}

export function stopSync() {
  if (!active) return;
  for (const u of active.unsubs) u();
  active = null;
}

/** Grava operações do app na casa ativa. Não espera o servidor (funciona offline). */
export function writeOps(ops) {
  if (!active) return Promise.reject(new Error('Nuvem não conectada.'));
  return commitOps(active, ops, { wait: false });
}

function commitOps(target, ops, { wait }) {
  const { writes, errors } = target.mirror.plan(ops, { device: deviceId(), now: Date.now() });
  for (const msg of errors) target.onError(new Error(msg), 'write');

  const by = normalizeEmail(auth.currentUser?.email);
  const commits = [];
  for (let i = 0; i < writes.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const w of writes.slice(i, i + BATCH_SIZE)) {
      const r = ref(target, w.coll, w.id);
      if (w.raw == null) batch.delete(r);
      else batch.set(r, { v: w.raw, t: serverTimestamp(), by });
    }
    commits.push(batch.commit());
  }
  if (!commits.length) return Promise.resolve();

  target.pending += commits.length;
  target.onPending(target.pending);
  const tracked = commits.map((p) =>
    p.then(
      () => {
        target.pending--;
        target.onPending(target.pending);
      },
      (err) => {
        target.pending--;
        target.onPending(target.pending);
        target.onError(err, 'write');
        throw err;
      },
    ),
  );
  if (wait) return Promise.all(tracked);
  tracked.forEach((p) => p.catch(() => {}));
  return Promise.resolve();
}

// ---------- Manutenção (economiza leituras) ----------

/**
 * Incorpora marcações antigas aos registros e agrupa registros antigos em
 * pacotes mensais. Cada passo é uma transação: se outro aparelho mexer nos
 * mesmos documentos ao mesmo tempo, o Firestore repete ou desiste sem perder
 * nada. Roda só com internet e depois da sincronização completa.
 * Devolve { folded, archived } (quantidades).
 */
export async function runMaintenance({ maxSteps = 12, today = todayISO(), now = Date.now() } = {}) {
  const target = active;
  if (!target) return { folded: 0, archived: 0 };
  const by = normalizeEmail(auth.currentUser?.email);
  let steps = 0;
  let folded = 0;
  let archived = 0;

  for (const { store, key, markIds } of target.mirror.foldCandidates(now)) {
    if (steps++ >= maxSteps || active !== target) break;
    const done = await runTransaction(db, async (tx) => {
      const baseRef = ref(target, store, key);
      const markRefs = markIds.map((id) => ref(target, MARKS, id));
      const [base, ...marks] = await Promise.all([tx.get(baseRef), ...markRefs.map((r) => tx.get(r))]);
      const live = marks.filter((m) => m.exists());
      // Alguém marcou algo há pouco: deixa para depois.
      const fresh = live.some((m) => {
        const f = parseRaw(m.data().v)?.f ?? {};
        return Object.values(f).some((entries) => Object.values(entries ?? {}).some((e) => Number(e?.a) >= now - 2 * 86_400_000));
      });
      if (fresh) return false;
      // Semana que está no arquivo mensal: as marcações continuam valendo como estão.
      if (!base.exists() && target.mirror.archived.get(store)?.has(key)) return false;
      if (base.exists()) {
        const raw = foldRaw(store, key, base.data().v, live.map((m) => m.data().v));
        if (raw) tx.set(baseRef, { v: raw, t: serverTimestamp(), by });
      }
      for (const m of live) tx.delete(m.ref);
      return true;
    });
    if (done) folded++;
  }

  for (const { store, month, keys } of target.mirror.archiveCandidates(today)) {
    for (let i = 0; i < keys.length; i += 150) {
      if (steps++ >= maxSteps || active !== target) return { folded, archived };
      const chunk = keys.slice(i, i + 150);
      const ids = target.mirror.bundleIds(store, month);
      const lastId = ids[ids.length - 1] ?? month;
      const spareId = nextBundleId(month, ids.length ? ids : [month]);
      const n = await runTransaction(db, async (tx) => {
        const coll = archiveColl(store);
        const lastSnap = await tx.get(ref(target, coll, lastId));
        const spareSnap = await tx.get(ref(target, coll, spareId));
        const liveSnaps = await Promise.all(chunk.map((k) => tx.get(ref(target, store, k))));
        const moving = [];
        for (const snap of liveSnaps) {
          if (!snap.exists()) continue;
          const rec = parseRaw(snap.data().v);
          if (rec && isArchivable(store, rec, today) && archiveMonth(store, rec) === month) moving.push({ snap, rec });
        }
        if (!moving.length) return 0;
        let bundleId = lastId;
        let raw = bundleRaw(store, lastSnap.exists() ? parseRaw(lastSnap.data().v) : null, moving.map((m) => m.rec));
        if (raw.length > MAX_DOC_CHARS) {
          bundleId = spareId;
          raw = bundleRaw(store, spareSnap.exists() ? parseRaw(spareSnap.data().v) : null, moving.map((m) => m.rec));
          if (raw.length > MAX_DOC_CHARS) return 0;
        }
        tx.set(ref(target, coll, bundleId), { v: raw, t: serverTimestamp(), by });
        for (const m of moving) tx.delete(m.snap.ref);
        return moving.length;
      });
      archived += n;
    }
  }
  return { folded, archived };
}
