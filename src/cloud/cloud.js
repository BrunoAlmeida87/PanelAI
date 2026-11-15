// Integração com o Firebase: login (Auth) e dados compartilhados (Firestore).
//
// Este módulo só é carregado quando a nuvem está configurada
// (src/cloud/firebase-config.js), para não pesar no uso apenas local.
//
// Modelo no Firestore:
//   households/{casa}                    { name, ownerEmail, memberEmails[], createdAt }
//   households/{casa}/{coleção}/{id}     { v: JSON do registro, t: data do servidor, by: e-mail }
// As coleções são as mesmas do IndexedDB (src/storage/db.js). Cada registro
// é guardado como texto JSON para manter exatamente o mesmo formato do app.

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
  addDoc,
  arrayRemove,
  arrayUnion,
  clearIndexedDbPersistence,
  collection,
  connectFirestoreEmulator,
  doc,
  getDocs,
  initializeFirestore,
  onSnapshot,
  persistentLocalCache,
  persistentMultipleTabManager,
  query,
  serverTimestamp,
  terminate,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { emulatorHost, firebaseConfig } from './firebase-config.js';
import { STORES } from '../storage/db.js';

const HOUSEHOLDS = 'households';
const BATCH_SIZE = 400; // limite do Firestore: 500 gravações por lote
const MAX_DOC_CHARS = 900_000; // limite do Firestore: ~1 MB por documento
export const MAX_MEMBERS = 10;

let app = null;
let auth = null;
let db = null;

function init() {
  if (app) return;
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  // Cache persistente: o app abre e grava sem internet; o Firestore envia
  // as alterações quando a conexão volta.
  db = initializeFirestore(app, {
    localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
    ignoreUndefinedProperties: true,
  });
  if (emulatorHost) {
    connectAuthEmulator(auth, `http://${emulatorHost}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, emulatorHost, 8080);
  }
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
  return { id: snap.id, name: d.name ?? 'Casa', ownerEmail: d.ownerEmail, memberEmails: d.memberEmails ?? [] };
};

/** Procura a casa em que o e-mail do usuário está cadastrado. */
export async function findMyHousehold() {
  init();
  const email = normalizeEmail(auth.currentUser?.email);
  if (!email) return null;
  const snap = await getDocs(query(collection(db, HOUSEHOLDS), where('memberEmails', 'array-contains', email)));
  return snap.empty ? null : householdFromSnap(snap.docs[0]);
}

/** Cria a casa e envia os dados (operações no formato de src/storage/db.js). */
export async function createHousehold(name, ops) {
  init();
  const email = normalizeEmail(auth.currentUser?.email);
  const ref = await addDoc(collection(db, HOUSEHOLDS), {
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

export async function renameHousehold(householdId, name) {
  init();
  await updateDoc(doc(db, HOUSEHOLDS, householdId), { name: String(name).slice(0, 60) });
}

// ---------- Sincronização ----------

const encId = (key) => encodeURIComponent(String(key));
const decId = (id) => decodeURIComponent(id);

function newTarget(householdId) {
  return {
    householdId,
    // Ids existentes e último JSON conhecido de cada registro (para "limpar"
    // coleções e para ignorar ecos que não mudam nada).
    known: Object.fromEntries(Object.keys(STORES).map((s) => [s, new Map()])),
    pending: 0,
    unsubs: [],
    onPending: () => {},
    onError: () => {},
  };
}

let active = null;

/**
 * Começa a ouvir os dados da casa em tempo real.
 * Resolve com { [coleção]: alterações[] } da primeira leitura (do cache local,
 * quando houver). Depois, alterações vindas de outros aparelhos chegam em onChanges.
 */
export function startSync(householdId, { onChanges, onHousehold, onPending, onError }) {
  init();
  stopSync();
  const target = newTarget(householdId);
  target.onPending = onPending;
  target.onError = onError;
  active = target;

  return new Promise((resolve) => {
    const initial = {};
    let waiting = Object.keys(STORES).length;
    let resolved = false;
    const finish = () => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timer);
      resolve(initial);
    };
    // Sem resposta (ex.: sem internet e sem cache), abre com o que houver.
    const timer = setTimeout(finish, 12000);

    target.unsubs.push(
      onSnapshot(
        doc(db, HOUSEHOLDS, householdId),
        (snap) => onHousehold(snap.exists() ? householdFromSnap(snap) : null),
        (err) => onError(err, 'household'),
      ),
    );

    for (const store of Object.keys(STORES)) {
      let first = true;
      const known = target.known[store];
      const unsub = onSnapshot(
        collection(db, HOUSEHOLDS, householdId, store),
        (snap) => {
          const changes = [];
          for (const ch of snap.docChanges()) {
            const key = decId(ch.doc.id);
            if (ch.type === 'removed') {
              if (known.has(key)) changes.push({ type: 'delete', key });
              known.delete(key);
              continue;
            }
            const raw = ch.doc.data().v;
            // Eco de uma gravação deste aparelho, ou registro sem mudança real.
            if (!first && (ch.doc.metadata.hasPendingWrites || known.get(key) === raw)) {
              known.set(key, raw);
              continue;
            }
            known.set(key, raw);
            try {
              changes.push({ type: 'put', key, value: JSON.parse(raw) });
            } catch {
              console.warn('Registro inválido na nuvem', store, key);
            }
          }
          if (first && !resolved) {
            first = false;
            initial[store] = changes;
            if (--waiting === 0) finish();
            return;
          }
          first = false;
          if (changes.length) onChanges(store, changes);
        },
        (err) => onError(err, store),
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
  // Reduz as operações ao estado final de cada registro.
  const final = new Map();
  const id = (store, key) => `${store}\u0000${key}`;
  for (const op of ops) {
    if (op.type === 'clear') {
      for (const key of target.known[op.store].keys()) final.set(id(op.store, key), { store: op.store, key, value: null });
      for (const [k, w] of final) if (w.store === op.store) final.set(k, { ...w, value: null });
    } else if (op.type === 'put') {
      const key = op.value[STORES[op.store]];
      final.set(id(op.store, key), { store: op.store, key, value: op.value });
    } else if (op.type === 'delete') {
      final.set(id(op.store, op.key), { store: op.store, key: op.key, value: null });
    }
  }

  const by = normalizeEmail(auth.currentUser?.email);
  const writes = [];
  for (const w of final.values()) {
    const ref = doc(db, HOUSEHOLDS, target.householdId, w.store, encId(w.key));
    const known = target.known[w.store];
    if (w.value == null) {
      if (!known.has(w.key) && target !== active) continue; // casa nova: nada a apagar
      known.delete(w.key);
      writes.push((b) => b.delete(ref));
      continue;
    }
    const v = JSON.stringify(w.value);
    if (v.length > MAX_DOC_CHARS) {
      target.onError(new Error(`Registro grande demais para a nuvem (${w.store}: ${w.key}). Use imagens menores.`), 'write');
      continue;
    }
    if (known.get(w.key) === v) continue; // nada mudou
    known.set(w.key, v);
    writes.push((b) => b.set(ref, { v, t: serverTimestamp(), by }));
  }

  const commits = [];
  for (let i = 0; i < writes.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const fn of writes.slice(i, i + BATCH_SIZE)) fn(batch);
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
