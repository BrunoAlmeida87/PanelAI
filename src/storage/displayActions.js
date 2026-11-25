// Ações dos layouts do display e-ink.

import { flush, getState, setState, subscribe, persist } from './store.js';
import { currentActor } from './actor.js';
import { updateSettings } from './actions.js';
import { newLayout } from '../display/model.js';
import { normalizeDisplayDevice } from '../display/schedule.js';
import { isValidGithubToken, repoFromSite, requestImageGeneration } from '../display/github.js';
import { uid } from '../utils/id.js';

export function saveLayout(layout) {
  const next = { ...layout, updatedAt: new Date().toISOString(), updatedBy: currentActor().name };
  setState((s) => ({ displayLayouts: { ...s.displayLayouts, [next.id]: next } }));
  persist([{ store: 'displayLayouts', type: 'put', value: next }]);
  return next;
}

export function createLayout(opts = {}) {
  const layout = newLayout(opts, currentActor());
  saveLayout(layout);
  if (!getState().settings.displayLayoutId) setActiveLayout(layout.id);
  return layout;
}

export function duplicateLayout(id) {
  const src = getState().displayLayouts[id];
  if (!src) return null;
  const copy = { ...structuredClone(src), id: uid('display'), name: `${src.name} (cópia)`, createdAt: new Date().toISOString(), createdBy: currentActor().name };
  copy.cards = copy.cards.map((c) => ({ ...c, id: uid('card') }));
  return saveLayout(copy);
}

export function deleteLayout(id) {
  setState((s) => {
    const displayLayouts = { ...s.displayLayouts };
    delete displayLayouts[id];
    return { displayLayouts };
  });
  persist([{ store: 'displayLayouts', type: 'delete', key: id }]);
  if (getState().settings.displayLayoutId === id) {
    const other = Object.keys(getState().displayLayouts)[0] ?? null;
    setActiveLayout(other);
  }
}

/** Layout que o aparelho deve mostrar. */
export function setActiveLayout(id) {
  updateSettings({ displayLayoutId: id });
}

/**
 * Tela física: horários, fuso e código do endereço (Configurações → Tela e-ink).
 * Sempre grava num formato válido (src/display/schedule.js).
 */
export function updateDisplayDevice(patch) {
  const current = normalizeDisplayDevice(getState().settings.displayDevice);
  const next = normalizeDisplayDevice({ ...current, ...patch });
  updateSettings({ displayDevice: next });
  return next;
}

// ---------- "Atualizar a tela agora" (pedido ao GitHub) ----------

const LAST_REQUEST_KEY = 'panelai.tela.ultimoPedido';

/** Quando este aparelho pediu uma imagem nova pela última vez (ms; 0 = nunca). */
export function lastScreenRequest() {
  try {
    return Number(localStorage.getItem(LAST_REQUEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function rememberScreenRequest(ms) {
  try {
    localStorage.setItem(LAST_REQUEST_KEY, String(ms));
  } catch {
    /* sem armazenamento: só perde o intervalo mínimo entre pedidos automáticos */
  }
}

/**
 * Guarda (ou apaga, com null) a chave do GitHub da casa. Fica em meta/github,
 * separada das configurações, para não entrar nos backups.
 */
export function setGithubToken(token) {
  const value = token == null ? null : String(token).trim();
  if (value != null && !isValidGithubToken(value)) throw new Error('Chave do GitHub em formato inválido.');
  setState({ githubToken: value });
  return persist([{ store: 'meta', type: 'put', value: { key: 'github', value: { token: value } } }]);
}

/**
 * Espera as gravações deste aparelho chegarem ao servidor da nuvem (o app
 * grava primeiro no aparelho e envia em seguida). Desiste depois de `timeoutMs`.
 */
async function cloudSaved(timeoutMs = 15_000) {
  await flush();
  if (getState().mode !== 'cloud' || !getState().cloud?.pending) return;
  await new Promise((resolve) => {
    let off = () => {};
    const timer = setTimeout(() => {
      off();
      resolve();
    }, timeoutMs);
    off = subscribe((st) => {
      if (st.cloud?.pending) return;
      clearTimeout(timer);
      off();
      resolve();
    });
  });
}

/** Repositório deste site no GitHub (o workflow da imagem roda nele). */
const siteRepo = () => repoFromSite(globalThis.location?.hostname, import.meta.env.BASE_URL);

/**
 * Pede ao GitHub para gerar e publicar a imagem da tela agora.
 *  - manual (padrão): marca o pedido nas configurações; a tela, ao ver o pedido
 *    novo no config.json, baixa a imagem e redesenha (na próxima conferência);
 *  - auto: só refaz a imagem (algo mudou no PanelAI); a tela continua seguindo os horários.
 * Resolve com { ok, status?, message? } (src/display/github.js).
 */
export async function requestScreenUpdate({ auto = false, keepalive = false } = {}) {
  const now = Date.now();
  if (!auto) {
    updateDisplayDevice({ requestedAt: now });
    // O pedido precisa estar no servidor antes de o GitHub ler as configurações.
    await cloudSaved();
  }
  const result = await requestImageGeneration({ token: getState().githubToken, repo: siteRepo(), keepalive });
  if (result.ok) rememberScreenRequest(Date.now());
  return result;
}
