import { compositionLabel, speedLabel, proteinLabel } from '../../models/constants.js';
import { recipeSpeed } from '../../models/recipe.js';

export const SPEED_BADGE = {
  ultrarrapida: 'badge-green',
  rapida: 'badge-blue',
  moderada: 'badge-amber',
  elaborada: 'badge-coral',
};

export function recipeSubtitle(r) {
  const parts = [proteinLabel(r.protein), ...(r.composition ?? []).map(compositionLabel)];
  return [...new Set(parts)].join(' · ');
}

export function speedBadge(r) {
  const id = recipeSpeed(r);
  return { id, label: speedLabel(id), cls: SPEED_BADGE[id] };
}
