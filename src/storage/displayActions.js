// Ações dos layouts do display e-ink.

import { getState, setState, persist } from './store.js';
import { currentActor } from './actor.js';
import { updateSettings } from './actions.js';
import { newLayout } from '../display/model.js';
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
