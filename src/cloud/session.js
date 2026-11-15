// Liga o estado do app (src/storage/store.js) à nuvem (src/cloud/cloud.js).
// Carregado sob demanda, só quando o Firebase está configurado.

import * as cloud from './cloud.js';
import { applyRemoteChanges, getState, loadFromChanges, seedOps, setState, setWriter } from '../storage/store.js';

const CACHE_KEY = 'panelai.cloud.household';

function readCache(email) {
  try {
    const v = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null');
    return v?.email === email ? v.id : null;
  } catch {
    return null;
  }
}

function writeCache(email, id) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ email, id }));
  } catch {
    /* ignora */
  }
}

function clearCache() {
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignora */
  }
}

const patchCloud = (patch) => setState((s) => ({ cloud: { ...s.cloud, ...patch } }));

const withTimeout = (p, ms) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('Tempo esgotado ao falar com a nuvem.')), ms))]);

let watching = false;
function ensureUserWatch() {
  if (watching) return;
  watching = true;
  cloud.watchUser((user) => patchCloud({ user }));
}

/**
 * Chamado na abertura do app. Se houver usuário logado e casa conhecida,
 * abre no modo nuvem (também sem internet, pelo cache) e devolve true.
 */
export async function startCloudIfReady() {
  ensureUserWatch();
  const user = await cloud.currentUser();
  patchCloud({ user });
  if (!user?.verified) {
    patchCloud({ status: 'idle' });
    return false;
  }
  let householdId = readCache(user.email);
  if (!householdId) {
    try {
      const h = await withTimeout(cloud.findMyHousehold(), 8000);
      if (h) {
        householdId = h.id;
        writeCache(user.email, h.id);
      }
    } catch (err) {
      console.warn('Não foi possível procurar a casa na nuvem', err);
    }
  }
  if (!householdId) {
    patchCloud({ status: 'idle' });
    return false;
  }
  await startSync(householdId);
  return true;
}

function describeError(err) {
  if (err?.code === 'permission-denied') {
    return 'Seu e-mail não tem acesso aos dados desta casa (talvez tenha sido removido). Saia da conta para voltar aos dados deste aparelho.';
  }
  if (err?.code === 'unauthenticated') return 'Sua sessão expirou. Saia e entre novamente.';
  return `Erro na nuvem: ${err?.message ?? err}`;
}

async function startSync(householdId) {
  const initial = await cloud.startSync(householdId, {
    onChanges: applyRemoteChanges,
    onHousehold: (household) => patchCloud({ household }),
    onPending: (pending) => patchCloud({ pending }),
    onError: (err, where) => {
      console.error('Nuvem', where, err);
      patchCloud({ error: describeError(err) });
      if (where === 'write') setState({ saveStatus: 'error' });
    },
  });
  loadFromChanges(initial);
  setWriter((ops) => cloud.writeOps(ops));
  setState({ mode: 'cloud', ready: true, persistent: true, loadError: null });
  patchCloud({ status: 'active', error: null });
}

// ---------- Ações da tela de Configurações ----------

const reloadApp = () => window.location.reload();

/** Depois do login: procura a casa do usuário. */
async function afterSignIn(user) {
  patchCloud({ user, error: null });
  if (!user?.verified) return { user, household: null };
  const household = await cloud.findMyHousehold();
  return { user, household };
}

export const signInGoogle = async () => afterSignIn(await cloud.signInGoogle());
export const signInEmail = async (email, password) => afterSignIn(await cloud.signInEmail(email, password));
export const signUpEmail = async (email, password) => afterSignIn(await cloud.signUpEmail(email, password));
export const resendVerification = () => cloud.resendVerification();
export const resetPassword = (email) => cloud.resetPassword(email);
export const findMyHousehold = () => cloud.findMyHousehold();

/** "Já confirmei meu e-mail". */
export async function checkVerification() {
  return afterSignIn(await cloud.refreshUser());
}

/** Passa a usar os dados da casa neste aparelho. */
export function joinHousehold(household) {
  const user = getState().cloud.user;
  writeCache(user.email, household.id);
  reloadApp();
}

/** Cria a casa na nuvem com os dados que estão neste aparelho. */
export async function createHouseholdFromThisDevice(name) {
  const s = getState();
  const ops = seedOps({
    ingredients: s.ingredients,
    recipes: s.recipes,
    pantry: s.pantry,
    weeks: s.weeks,
    marmitas: s.marmitas,
    movements: s.movements,
    purchases: s.purchases,
    settings: s.settings,
  });
  ops.push({ store: 'meta', type: 'put', value: { key: 'monthlySession', value: s.monthlySession } });
  ops.push({ store: 'meta', type: 'put', value: { key: 'countDraft', value: s.countDraft } });
  const id = await cloud.createHousehold(name, ops);
  writeCache(s.cloud.user.email, id);
  reloadApp();
}

export async function addMember(email) {
  const h = getState().cloud.household;
  const e = cloud.normalizeEmail(email);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) throw new Error('E-mail inválido.');
  if (h.memberEmails.includes(e)) throw new Error('Esse e-mail já faz parte da casa.');
  if (h.memberEmails.length >= cloud.MAX_MEMBERS) throw new Error(`Limite de ${cloud.MAX_MEMBERS} pessoas.`);
  await cloud.addMember(h.id, e);
}

export async function removeMember(email) {
  const h = getState().cloud.household;
  await cloud.removeMember(h.id, email);
}

export async function renameHousehold(name) {
  await cloud.renameHousehold(getState().cloud.household.id, name);
}

/** Sai da conta: apaga a cópia da nuvem neste aparelho e volta aos dados locais. */
export async function signOutCloud() {
  clearCache();
  await cloud.signOutAndClear();
  reloadApp();
}
