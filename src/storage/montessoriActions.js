// Ações da aba Montessori: alteram o estado e gravam (local ou nuvem).
// As regras (idade, sugestões, validação) ficam em src/models/montessori.js.

import { getState, setState, persist } from './store.js';
import { currentActor } from './actor.js';
import { editLog, newChild, newLog, normalizeChild } from '../models/montessori.js';

function saveChildren(list) {
  if (!list.length) return;
  setState((s) => {
    const children = { ...s.children };
    for (const c of list) children[c.id] = c;
    return { children };
  });
  persist(list.map((c) => ({ store: 'children', type: 'put', value: c })));
}

function saveLogs(list) {
  if (!list.length) return;
  setState((s) => {
    const montessoriLogs = { ...s.montessoriLogs };
    for (const l of list) montessoriLogs[l.id] = l;
    return { montessoriLogs };
  });
  persist(list.map((l) => ({ store: 'montessoriLogs', type: 'put', value: l })));
}

const touch = (c) => ({ ...c, updatedAt: new Date().toISOString(), updatedBy: currentActor().name });

// ---------- Crianças ----------

/** Cria (sem id) ou atualiza (com id) o cadastro da criança. */
export function saveChild({ id = null, name, birthDate, gestationWeeks = null }) {
  const gw = gestationWeeks === '' || gestationWeeks == null ? null : Number(gestationWeeks);
  const prev = id ? getState().children[id] : null;
  const next = prev
    ? touch({ ...normalizeChild(prev), name: String(name).trim().slice(0, 40), birthDate, gestationWeeks: gw })
    : newChild({ name, birthDate, gestationWeeks: gw }, currentActor());
  saveChildren([next]);
  return next;
}

/** Apaga a criança e todos os registros dela. Devolve o que foi apagado (para desfazer). */
export function deleteChild(id) {
  const s = getState();
  const child = s.children[id];
  if (!child) return null;
  const logs = Object.values(s.montessoriLogs).filter((l) => l.childId === id);
  setState((st) => {
    const children = { ...st.children };
    delete children[id];
    const montessoriLogs = { ...st.montessoriLogs };
    for (const l of logs) delete montessoriLogs[l.id];
    return { children, montessoriLogs };
  });
  persist([{ store: 'children', type: 'delete', key: id }, ...logs.map((l) => ({ store: 'montessoriLogs', type: 'delete', key: l.id }))]);
  return { child, logs };
}

export function restoreChild({ child, logs }) {
  saveChildren([child]);
  saveLogs(logs);
}

/**
 * Atividades escolhidas para o dia (trocar, incluir, novas sugestões). Só é
 * gravado quando alguém mexe: sem isso, todos os aparelhos e a tela e-ink
 * calculam a mesma sugestão automática.
 */
export function setDayPlan(childId, date, ids, round = null) {
  const c = getState().children[childId];
  if (!c) return null;
  const prevRound = c.plan?.date === date ? (c.plan.round ?? 0) : 0;
  const next = touch({ ...normalizeChild(c), plan: { date, ids: [...ids], round: round ?? prevRound } });
  saveChildren([next]);
  return next;
}

/** Volta para a sugestão automática do dia. */
export function clearDayPlan(childId) {
  const c = getState().children[childId];
  if (!c?.plan) return null;
  const next = touch({ ...c, plan: null });
  saveChildren([next]);
  return next;
}

// ---------- Registros ----------

export function addLog(input) {
  const log = newLog(input, currentActor());
  saveLogs([log]);
  return log;
}

export function updateLog(id, patch) {
  const prev = getState().montessoriLogs[id];
  if (!prev) return null;
  const next = editLog(prev, patch, currentActor());
  saveLogs([next]);
  return next;
}

export function deleteLog(id) {
  const prev = getState().montessoriLogs[id];
  if (!prev) return null;
  setState((s) => {
    const montessoriLogs = { ...s.montessoriLogs };
    delete montessoriLogs[id];
    return { montessoriLogs };
  });
  persist([{ store: 'montessoriLogs', type: 'delete', key: id }]);
  return prev;
}

export const restoreLog = (log) => saveLogs([log]);
