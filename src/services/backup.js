// Exportação e importação de dados em JSON, com validação antes de qualquer gravação.

import { CATEGORY_IDS, MARMITA_STATUS, MEAL_SLOT_IDS } from '../models/constants.js';
import { validateRecipe } from '../models/recipe.js';
import { isUnit } from '../models/units.js';
import { isValidISODate, weekStartOf } from '../utils/dates.js';

export const BACKUP_APP = 'PanelAI';
export const BACKUP_VERSION = 1;
export const COLLECTIONS = ['ingredients', 'recipes', 'pantry', 'weeks', 'marmitas', 'movements', 'purchases'];

export function buildBackup(data, now = new Date()) {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    data: {
      ingredients: Object.values(data.ingredients ?? {}),
      recipes: Object.values(data.recipes ?? {}),
      pantry: Object.values(data.pantry ?? {}),
      weeks: Object.values(data.weeks ?? {}),
      marmitas: Object.values(data.marmitas ?? {}),
      movements: data.movements ?? [],
      purchases: data.purchases ?? [],
      settings: data.settings ?? {},
    },
  };
}

const isObj = (v) => v && typeof v === 'object' && !Array.isArray(v);
const isStr = (v) => typeof v === 'string' && v.length > 0;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

/**
 * Valida o conteúdo de um arquivo de backup.
 * Retorna { ok, errors, data } — `data` normalizado em mapas por id quando válido.
 */
export function validateBackup(raw) {
  const errors = [];
  let json = raw;
  if (typeof raw === 'string') {
    try {
      json = JSON.parse(raw);
    } catch {
      return { ok: false, errors: ['O arquivo não é um JSON válido.'] };
    }
  }
  if (!isObj(json)) return { ok: false, errors: ['Estrutura do arquivo inválida.'] };
  if (json.app !== BACKUP_APP) errors.push('O arquivo não foi gerado pelo PanelAI.');
  if (!isNum(json.version) || json.version > BACKUP_VERSION) errors.push('Versão do arquivo não suportada.');
  const d = json.data;
  if (!isObj(d)) return { ok: false, errors: [...errors, 'Seção "data" ausente.'] };
  for (const c of COLLECTIONS) {
    if (!Array.isArray(d[c])) errors.push(`Coleção "${c}" ausente ou inválida.`);
  }
  if (errors.length) return { ok: false, errors };

  const limit = (list, name) => {
    if (list.length > 20000) errors.push(`Coleção "${name}" grande demais.`);
  };
  COLLECTIONS.forEach((c) => limit(d[c], c));

  const ingredients = {};
  d.ingredients.forEach((ing, idx) => {
    if (!isObj(ing) || !isStr(ing.id) || !isStr(ing.name)) {
      errors.push(`Ingrediente #${idx + 1}: id e nome são obrigatórios.`);
      return;
    }
    if (!isUnit(ing.baseUnit)) errors.push(`Ingrediente "${ing.name}": unidade-base inválida.`);
    if (!CATEGORY_IDS.includes(ing.category)) errors.push(`Ingrediente "${ing.name}": categoria inválida.`);
    if (ingredients[ing.id]) errors.push(`Ingrediente duplicado: ${ing.id}.`);
    ingredients[ing.id] = { flags: [], ...ing };
  });

  const recipes = {};
  d.recipes.forEach((r, idx) => {
    const errs = validateRecipe(r, ingredients);
    if (errs.length) errors.push(`Receita "${r?.name ?? '#' + (idx + 1)}": ${errs[0]}`);
    else if (recipes[r.id]) errors.push(`Receita duplicada: ${r.id}.`);
    else recipes[r.id] = r;
  });

  const pantry = {};
  d.pantry.forEach((p, idx) => {
    if (!isObj(p) || !isStr(p.ingredientId) || !ingredients[p.ingredientId]) {
      errors.push(`Estoque #${idx + 1}: ingrediente inexistente.`);
      return;
    }
    if (!isNum(p.qty) || p.qty < 0 || !isUnit(p.unit)) errors.push(`Estoque "${p.ingredientId}": quantidade ou unidade inválida.`);
    pantry[p.ingredientId] = { min: 0, desired: 0, monthly: false, ...p };
  });

  const marmitas = {};
  d.marmitas.forEach((m, idx) => {
    if (!isObj(m) || !isStr(m.id) || !isStr(m.recipeId) || !isValidISODate(m.prepDate)) {
      errors.push(`Marmita #${idx + 1}: dados inválidos.`);
      return;
    }
    if (!MARMITA_STATUS.some((s) => s.id === m.status)) errors.push(`Marmita #${idx + 1}: status inválido.`);
    marmitas[m.id] = m;
  });

  const weeks = {};
  d.weeks.forEach((w, idx) => {
    if (!isObj(w) || !isValidISODate(w.id) || weekStartOf(w.id) !== w.id || !isObj(w.meals)) {
      errors.push(`Semana #${idx + 1}: identificador ou refeições inválidos.`);
      return;
    }
    for (const [date, slots] of Object.entries(w.meals)) {
      if (!isValidISODate(date) || !isObj(slots)) {
        errors.push(`Semana ${w.id}: dia inválido (${date}).`);
        continue;
      }
      for (const [slot, entries] of Object.entries(slots)) {
        if (!MEAL_SLOT_IDS.includes(slot) || !Array.isArray(entries)) {
          errors.push(`Semana ${w.id}: refeição inválida (${slot}).`);
          continue;
        }
        for (const e of entries) {
          if (!isObj(e) || !isStr(e.id) || !['recipe', 'marmita', 'out', 'text'].includes(e.kind)) {
            errors.push(`Semana ${w.id}: item de refeição inválido em ${date}.`);
          }
        }
      }
    }
    weeks[w.id] = {
      favorite: false,
      favoriteName: '',
      tasksDone: {},
      manualTasks: [],
      ...w,
      shopping: { checked: {}, overrides: {}, missing: {}, extras: [], ...(w.shopping ?? {}) },
    };
  });

  const movements = d.movements.filter((m) => isObj(m) && isStr(m.id));
  const purchases = d.purchases.filter((p) => isObj(p) && isStr(p.id));
  const settings = isObj(d.settings) ? d.settings : {};

  if (errors.length) return { ok: false, errors: errors.slice(0, 20) };
  return { ok: true, errors: [], data: { ingredients, recipes, pantry, weeks, marmitas, movements, purchases, settings } };
}
