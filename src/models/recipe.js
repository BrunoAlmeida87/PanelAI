import {
  COMPOSITION,
  DIFFICULTIES,
  PROTEINS,
  speedOf,
} from './constants.js';
import { isUnit } from './units.js';

/** Escala os ingredientes de uma receita sem alterar a receita original. */
export function scaleIngredients(recipe, servings) {
  const base = Number(recipe.servings) || 1;
  const factor = (Number(servings) || base) / base;
  return recipe.ingredients.map((line) => ({
    ...line,
    qty: line.qty == null ? null : line.qty * factor,
  }));
}

export function recipeSpeed(recipe) {
  return speedOf(recipe.time);
}

/**
 * Deduz restrições alimentares atendidas a partir dos marcadores dos ingredientes
 * (ingredientes opcionais não são considerados).
 */
export function recipeRestrictions(recipe, ingredientsById) {
  const flags = new Set();
  for (const line of recipe.ingredients) {
    if (line.optional) continue;
    for (const f of ingredientsById[line.ingredientId]?.flags ?? []) flags.add(f);
  }
  const out = [];
  const meat = flags.has('carne') || flags.has('peixe');
  if (!meat) out.push('vegetariano');
  if (!meat && !flags.has('lactose') && !flags.has('ovo') && !flags.has('mel')) out.push('vegano');
  if (!flags.has('gluten')) out.push('sem-gluten');
  if (!flags.has('lactose')) out.push('sem-lactose');
  return out;
}

export function emptyRecipe(category = 'prato') {
  return {
    id: '',
    name: '',
    description: '',
    category,
    servings: 4,
    time: 30,
    difficulty: 'facil',
    protein: 'sem-carne',
    composition: [],
    ingredients: [],
    steps: [],
    notes: '',
    tags: [],
    marmita: false,
    freezing: { freezable: false, days: 0, notes: '' },
    advancePrep: [],
    favorite: false,
    image: null,
  };
}

/** Valida uma receita. Retorna lista de erros (vazia se válida). */
export function validateRecipe(r, ingredientsById = null) {
  const errors = [];
  if (!r || typeof r !== 'object') return ['Receita inválida.'];
  if (typeof r.id !== 'string' || !r.id) errors.push('ID ausente.');
  if (typeof r.name !== 'string' || !r.name.trim()) errors.push('Informe o nome da receita.');
  if (r.name && r.name.length > 120) errors.push('Nome muito longo (máx. 120 caracteres).');
  if (!['prato', 'lanche'].includes(r.category)) errors.push('Categoria deve ser prato ou lanche.');
  if (!(Number(r.servings) > 0 && Number(r.servings) <= 100)) errors.push('Porções devem estar entre 1 e 100.');
  if (!(Number(r.time) >= 0 && Number(r.time) <= 24 * 60)) errors.push('Tempo de preparo inválido.');
  if (!DIFFICULTIES.some((d) => d.id === r.difficulty)) errors.push('Dificuldade inválida.');
  if (!PROTEINS.some((p) => p.id === r.protein)) errors.push('Tipo de proteína inválido.');
  if (!Array.isArray(r.composition) || r.composition.some((c) => !COMPOSITION.some((x) => x.id === c))) {
    errors.push('Composição inválida.');
  }
  if (!Array.isArray(r.ingredients) || r.ingredients.length === 0) {
    errors.push('Adicione pelo menos um ingrediente.');
  } else {
    r.ingredients.forEach((line, idx) => {
      const n = idx + 1;
      if (!line || typeof line.ingredientId !== 'string' || !line.ingredientId) {
        errors.push(`Ingrediente ${n}: selecione um ingrediente.`);
        return;
      }
      if (ingredientsById && !ingredientsById[line.ingredientId]) {
        errors.push(`Ingrediente ${n}: "${line.ingredientId}" não existe no catálogo.`);
      }
      if (!isUnit(line.unit)) errors.push(`Ingrediente ${n}: unidade inválida.`);
      if (line.unit !== 'a_gosto' && !(typeof line.qty === 'number' && line.qty > 0 && Number.isFinite(line.qty))) {
        errors.push(`Ingrediente ${n}: quantidade deve ser maior que zero.`);
      }
    });
  }
  if (r.protein === 'sem-carne' && ingredientsById && Array.isArray(r.ingredients)) {
    const meat = r.ingredients.find(
      (l) => !l.optional && (ingredientsById[l.ingredientId]?.flags ?? []).some((f) => f === 'carne' || f === 'peixe'),
    );
    if (meat) errors.push(`Proteína marcada como "Sem carne", mas ${ingredientsById[meat.ingredientId].name} está nos ingredientes.`);
  }
  if (!Array.isArray(r.steps)) errors.push('Modo de preparo inválido.');
  if (r.advancePrep && !Array.isArray(r.advancePrep)) errors.push('Preparo antecipado inválido.');
  return errors;
}
