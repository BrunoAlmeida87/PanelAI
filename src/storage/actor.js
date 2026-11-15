// Quem está usando o app (para registrar quem fez cada alteração).
//
// Ordem: nome definido neste aparelho (Configurações) → nome da conta na nuvem
// → início do e-mail → "Este aparelho".

import { useEffect, useState } from 'preact/hooks';
import { getState } from './store.js';

const KEY = 'panelai.deviceName';
const listeners = new Set();

export function getDeviceName() {
  try {
    return localStorage.getItem(KEY) ?? '';
  } catch {
    return '';
  }
}

export function setDeviceName(name) {
  const clean = String(name ?? '').trim().slice(0, 40);
  try {
    if (clean) localStorage.setItem(KEY, clean);
    else localStorage.removeItem(KEY);
  } catch {
    /* ignora */
  }
  for (const l of listeners) l(clean);
}

export function useDeviceName() {
  const [name, setName] = useState(getDeviceName);
  useEffect(() => {
    listeners.add(setName);
    return () => listeners.delete(setName);
  }, []);
  return name;
}

const firstName = (full) => String(full ?? '').trim().split(/\s+/)[0] ?? '';

/** { name, email } de quem está fazendo a alteração agora. */
export function currentActor() {
  const user = getState().cloud?.user;
  const device = getDeviceName();
  const email = user?.email ?? '';
  const name = device || firstName(user?.name) || (email ? email.split('@')[0] : '') || 'Este aparelho';
  return { name, email };
}
