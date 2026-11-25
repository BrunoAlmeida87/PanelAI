// Biblioteca Montessori carregada do JSON (src/data/montessori_activities.json)
// e o resumo "atividades de hoje" usado pela aba, pelo card do Cardápio e pela
// tela e-ink. Este arquivo só é baixado junto com essas telas.

import json from './montessori_activities.json';
import { bandOf, childAge, childLogs, dayPlan, doneOn, loadLibrary, normalizeChild } from '../models/montessori.js';

export const LIBRARY = loadLibrary(json);

if (LIBRARY.problems.length) console.warn('Biblioteca Montessori: atividades ignoradas', LIBRARY.problems);

/** Crianças cadastradas, da mais nova para a mais velha. */
export function sortedChildren(children) {
  return Object.values(children ?? {})
    .map(normalizeChild)
    .sort((a, b) => String(b.birthDate).localeCompare(String(a.birthDate)) || a.name.localeCompare(b.name, 'pt-BR'));
}

/**
 * Hoje para cada criança: idade, faixa, atividades do dia (com "feita hoje")
 * e se a lista foi escolhida à mão. Não grava nada (serve à conta de tela).
 */
export function montessoriToday(state, date) {
  const logs = Object.values(state.montessoriLogs ?? {});
  return sortedChildren(state.children).map((child) => {
    const own = childLogs(logs, child.id);
    const age = childAge(child, date);
    const plan = dayPlan({ activities: LIBRARY.activities, byId: LIBRARY.byId, child, logs: own, date });
    const done = doneOn(own, child.id, date);
    return {
      child,
      age,
      band: age ? bandOf(Math.max(0, age.months)) : null,
      custom: plan.custom,
      items: plan.ids.map((id) => ({ activity: LIBRARY.byId[id], done: done.has(id) })).filter((x) => x.activity),
    };
  });
}
