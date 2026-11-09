// Ações do usuário: alteram o estado e gravam no IndexedDB.

import { getState, setState, persist, seedOps, applyFullData } from './store.js';
import { emptyWeek, computeDemand, consumptionLines } from '../services/demand.js';
import {
  addEntry,
  copyWeekMeals,
  clearMeals,
  duplicateEntry,
  moveEntry,
  newEntry,
  removeEntry,
  updateEntry,
  findEntry,
} from '../services/planning.js';
import { applyStockDelta, newPantryItem, setStock } from '../services/pantry.js';
import { buildBackup } from '../services/backup.js';
import { buildSeed } from '../data/seed.js';
import { DEFAULT_SETTINGS } from '../models/constants.js';
import { convert } from '../models/units.js';
import { addDays } from '../utils/dates.js';
import { uid, uniqueSlug } from '../utils/id.js';

// ---------- Semanas ----------

export function getWeek(weekId) {
  return getState().weeks[weekId] ?? emptyWeek(weekId);
}

export function saveWeek(week) {
  const w = { ...week, updatedAt: new Date().toISOString() };
  setState((s) => ({ weeks: { ...s.weeks, [w.id]: w } }));
  persist([{ store: 'weeks', type: 'put', value: w }]);
  return w;
}

/** Adiciona uma mesma refeição em vários destinos (dia/refeição). */
export function addMeals(weekId, targets, data) {
  let w = getWeek(weekId);
  for (const t of targets) w = addEntry(w, t.date, t.slot, newEntry(data));
  return saveWeek(w);
}

export function updateMeal(weekId, date, slot, entryId, patch) {
  return saveWeek(updateEntry(getWeek(weekId), date, slot, entryId, patch));
}

/** Remove e devolve a semana anterior para permitir "Desfazer". */
export function removeMeal(weekId, date, slot, entryId) {
  const before = getWeek(weekId);
  saveWeek(removeEntry(before, date, slot, entryId));
  return before;
}

export function restoreWeek(week) {
  return saveWeek(week);
}

export function moveMeal(weekId, entryId, toDate, toSlot) {
  return saveWeek(moveEntry(getWeek(weekId), entryId, toDate, toSlot));
}

export function duplicateMeal(weekId, entryId, targets) {
  return saveWeek(duplicateEntry(getWeek(weekId), entryId, targets));
}

/** Substitui uma refeição por outra(s), na mesma posição. */
export function replaceMeal(weekId, date, slot, entryId, newDataList) {
  let w = getWeek(weekId);
  const list = w.meals[date]?.[slot] ?? [];
  const idx = list.findIndex((e) => e.id === entryId);
  const fresh = newDataList.map((d) => newEntry(d));
  const next = idx === -1 ? [...list, ...fresh] : [...list.slice(0, idx), ...fresh, ...list.slice(idx + 1)];
  w = { ...w, meals: { ...w.meals, [date]: { ...w.meals[date], [slot]: next } } };
  return saveWeek(w);
}

export function clearWeekMeals(weekId, onlyDate = null) {
  const before = getWeek(weekId);
  saveWeek(clearMeals(before, onlyDate));
  return before;
}

export function copyFromWeek(sourceId, targetId, merge = false) {
  const s = getState();
  const source = s.weeks[sourceId];
  if (!source) throw new Error('Semana de origem sem refeições.');
  const before = getWeek(targetId);
  const result = copyWeekMeals({ source, sourceId, target: before, targetId, marmitasById: s.marmitas, merge });
  saveWeek(result);
  return before;
}

export function setWeekFavorite(weekId, favorite, name = '') {
  return saveWeek({ ...getWeek(weekId), favorite, favoriteName: favorite ? name : '' });
}

// ---------- Preparo e consumo ----------

function consumeIngredients(lines, refId, note) {
  const s = getState();
  const pantry = { ...s.pantry };
  const movements = [];
  const skipped = [];
  for (const line of lines) {
    const ing = s.ingredients[line.ingredientId];
    const item = pantry[line.ingredientId];
    if (!ing || !item || ing.ignoreStock) continue;
    if (convert(line.qty, line.unit, item.unit, ing) == null) {
      skipped.push(ing.name);
      continue;
    }
    const r = applyStockDelta({ item, ingredient: ing, delta: -line.qty, unit: line.unit, type: 'consumo', refId, note });
    pantry[line.ingredientId] = r.item;
    if (r.movement.delta !== 0) movements.push(r.movement);
  }
  setState({ pantry, movements: [...movements, ...s.movements] });
  persist([
    ...movements.map((m) => ({ store: 'pantry', type: 'put', value: pantry[m.ingredientId] })),
    ...movements.map((m) => ({ store: 'movements', type: 'put', value: m })),
  ]);
  return { count: movements.length, skipped };
}

/** Marca uma refeição como preparada (sai da demanda) e, opcionalmente, desconta o estoque. */
export function setMealDone(weekId, date, slot, entryId, done, consume = false) {
  const s = getState();
  const found = findEntry(getWeek(weekId), entryId);
  let result = { count: 0, skipped: [] };
  if (done && consume && found?.entry.kind === 'recipe') {
    const recipe = s.recipes[found.entry.recipeId];
    if (recipe) {
      result = consumeIngredients(
        consumptionLines({ recipe, servings: found.entry.servings ?? recipe.servings }),
        entryId,
        recipe.name,
      );
    }
  }
  updateMeal(weekId, date, slot, entryId, { done, doneAt: done ? new Date().toISOString() : null, stockConsumed: done && consume });
  return result;
}

// ---------- Marmitas ----------

export function createMarmita({ recipeId, portions, prepDate, storage = 'geladeira', notes = '' }) {
  const m = { id: uid('marmita'), recipeId, portions, prepDate, status: 'planejada', storage, notes, createdAt: new Date().toISOString() };
  setState((s) => ({ marmitas: { ...s.marmitas, [m.id]: m } }));
  persist([{ store: 'marmitas', type: 'put', value: m }]);
  return m;
}

export function updateMarmita(id, patch) {
  const s = getState();
  const m = { ...s.marmitas[id], ...patch };
  setState({ marmitas: { ...s.marmitas, [id]: m } });
  persist([{ store: 'marmitas', type: 'put', value: m }]);
  return m;
}

/**
 * Avança o status do lote. Ao sair de "planejada" para "preparada",
 * os ingredientes podem ser descontados do estoque (uma única vez).
 */
export function setMarmitaStatus(id, status, consume = false) {
  const s = getState();
  const m = s.marmitas[id];
  if (!m) return null;
  let result = { count: 0, skipped: [] };
  const patch = { status };
  if (status === 'preparada' && m.status === 'planejada') {
    patch.preparedAt = new Date().toISOString();
    if (consume && !m.stockConsumed) {
      const recipe = s.recipes[m.recipeId];
      if (recipe) {
        result = consumeIngredients(consumptionLines({ recipe, servings: m.portions }), m.id, `Marmita: ${recipe.name}`);
        patch.stockConsumed = true;
      }
    }
  }
  updateMarmita(id, patch);
  return result;
}

export function deleteMarmita(id) {
  const s = getState();
  // Remove as entradas que usam o lote em todas as semanas.
  const ops = [];
  const weeks = { ...s.weeks };
  for (const w of Object.values(s.weeks)) {
    let changed = false;
    const meals = {};
    for (const [date, slots] of Object.entries(w.meals)) {
      meals[date] = {};
      for (const [slot, list] of Object.entries(slots)) {
        const filtered = list.filter((e) => !(e.kind === 'marmita' && e.marmitaId === id));
        if (filtered.length !== list.length) changed = true;
        meals[date][slot] = filtered;
      }
    }
    if (changed) {
      weeks[w.id] = { ...w, meals, updatedAt: new Date().toISOString() };
      ops.push({ store: 'weeks', type: 'put', value: weeks[w.id] });
    }
  }
  const marmitas = { ...s.marmitas };
  delete marmitas[id];
  setState({ weeks, marmitas });
  persist([...ops, { store: 'marmitas', type: 'delete', key: id }]);
}

/** Porções do lote já distribuídas no cardápio. */
export function marmitaUsage(marmitaId) {
  let used = 0;
  const uses = [];
  for (const w of Object.values(getState().weeks)) {
    for (const [date, slots] of Object.entries(w.meals)) {
      for (const [slot, list] of Object.entries(slots)) {
        for (const e of list) {
          if (e.kind === 'marmita' && e.marmitaId === marmitaId) {
            used += Number(e.servings) || 1;
            uses.push({ weekId: w.id, date, slot, entry: e });
          }
        }
      }
    }
  }
  return { used, uses };
}

// ---------- Tarefas ----------

export function toggleTask(weekId, key, done) {
  const w = getWeek(weekId);
  saveWeek({ ...w, tasksDone: { ...w.tasksDone, [key]: done } });
}

export function addManualTask(weekId, date, text) {
  const w = getWeek(weekId);
  saveWeek({ ...w, manualTasks: [...(w.manualTasks ?? []), { id: uid('task'), date, text }] });
}

export function removeManualTask(weekId, id) {
  const w = getWeek(weekId);
  saveWeek({ ...w, manualTasks: (w.manualTasks ?? []).filter((t) => t.id !== id) });
}

// ---------- Receitas e ingredientes ----------

export function saveRecipe(recipe) {
  const s = getState();
  const r = { ...recipe };
  if (!r.id) r.id = uniqueSlug(r.name, new Set(Object.keys(s.recipes)));
  r.updatedAt = new Date().toISOString();
  setState({ recipes: { ...s.recipes, [r.id]: r } });
  persist([{ store: 'recipes', type: 'put', value: r }]);
  return r;
}

export function duplicateRecipe(id) {
  const s = getState();
  const src = s.recipes[id];
  if (!src) return null;
  const copy = structuredClone(src);
  copy.name = `${src.name} (cópia)`;
  copy.id = uniqueSlug(copy.name, new Set(Object.keys(s.recipes)));
  copy.favorite = false;
  return saveRecipe(copy);
}

export function toggleRecipeFavorite(id) {
  const r = getState().recipes[id];
  if (r) saveRecipe({ ...r, favorite: !r.favorite });
}

/** Quantas refeições e marmitas usam a receita. */
export function recipeUsage(id) {
  const s = getState();
  let meals = 0;
  for (const w of Object.values(s.weeks)) {
    for (const slots of Object.values(w.meals)) {
      for (const list of Object.values(slots)) meals += list.filter((e) => e.kind === 'recipe' && e.recipeId === id).length;
    }
  }
  const marmitas = Object.values(s.marmitas).filter((m) => m.recipeId === id).length;
  return { meals, marmitas };
}

export function deleteRecipe(id) {
  const s = getState();
  const recipes = { ...s.recipes };
  delete recipes[id];
  setState({ recipes });
  persist([{ store: 'recipes', type: 'delete', key: id }]);
}

export function saveIngredient(data) {
  const s = getState();
  const ing = { flags: [], ...data };
  if (!ing.id) ing.id = uniqueSlug(ing.name, new Set(Object.keys(s.ingredients)));
  setState({ ingredients: { ...s.ingredients, [ing.id]: ing } });
  persist([{ store: 'ingredients', type: 'put', value: ing }]);
  return ing;
}

// ---------- Estoque ----------

export function savePantryItem(item, { recordMovement = true } = {}) {
  const s = getState();
  const prev = s.pantry[item.ingredientId];
  let next = { ...item, updatedAt: new Date().toISOString() };
  const ops = [];
  let movements = s.movements;
  if (prev && recordMovement && prev.unit === next.unit && Number(prev.qty) !== Number(next.qty)) {
    const r = setStock({ item: prev, qty: next.qty, type: 'ajuste' });
    if (r.movement) {
      movements = [r.movement, ...movements];
      ops.push({ store: 'movements', type: 'put', value: r.movement });
    }
  }
  setState({ pantry: { ...s.pantry, [next.ingredientId]: next }, movements });
  ops.push({ store: 'pantry', type: 'put', value: next });
  persist(ops);
  return next;
}

export function deletePantryItem(ingredientId) {
  const s = getState();
  const pantry = { ...s.pantry };
  delete pantry[ingredientId];
  setState({ pantry });
  persist([{ store: 'pantry', type: 'delete', key: ingredientId }]);
}

/** Lança no estoque uma lista de compras { ingredientId, qty, unit }. */
export function registerPurchase({ lines, type, weekId = null, extrasRegistered = [] }) {
  const s = getState();
  const purchaseId = uid('compra');
  const pantry = { ...s.pantry };
  const movements = [];
  const items = [];
  const errors = [];
  for (const line of lines) {
    if (!(line.qty > 0)) continue;
    const ing = s.ingredients[line.ingredientId];
    if (!ing) continue;
    const item = pantry[ing.id] ?? newPantryItem(ing, { unit: line.unit });
    try {
      const r = applyStockDelta({ item, ingredient: ing, delta: line.qty, unit: line.unit, type: 'compra', refId: purchaseId, note: type === 'mensal' ? 'Mercado do mês' : 'Lista da semana' });
      pantry[ing.id] = r.item;
      movements.push(r.movement);
      items.push({ ingredientId: ing.id, name: ing.name, qty: line.qty, unit: line.unit });
    } catch (err) {
      errors.push(err.message);
    }
  }
  const purchase = { id: purchaseId, date: new Date().toISOString(), type, weekId, items };
  const ops = [
    ...items.map((i) => ({ store: 'pantry', type: 'put', value: pantry[i.ingredientId] })),
    ...movements.map((m) => ({ store: 'movements', type: 'put', value: m })),
    { store: 'purchases', type: 'put', value: purchase },
  ];
  let weeks = s.weeks;
  if (weekId && extrasRegistered.length) {
    const w = getWeek(weekId);
    const extras = (w.shopping.extras ?? []).map((e) => (extrasRegistered.includes(e.id) ? { ...e, registered: true } : e));
    const nw = { ...w, shopping: { ...w.shopping, extras }, updatedAt: new Date().toISOString() };
    weeks = { ...weeks, [weekId]: nw };
    ops.push({ store: 'weeks', type: 'put', value: nw });
  }
  setState({ pantry, movements: [...movements, ...s.movements], purchases: [purchase, ...s.purchases], weeks });
  persist(ops);
  return { purchase, errors };
}

/** Confirma a contagem: define o estoque dos itens contados e registra as diferenças. */
export function confirmCount(counts) {
  const s = getState();
  const refId = uid('contagem');
  const pantry = { ...s.pantry };
  const movements = [];
  const ops = [];
  for (const [ingredientId, qty] of Object.entries(counts)) {
    const item = pantry[ingredientId];
    if (!item || qty == null || Number.isNaN(qty)) continue;
    const r = setStock({ item, qty, type: 'contagem', refId });
    pantry[ingredientId] = r.item;
    ops.push({ store: 'pantry', type: 'put', value: r.item });
    if (r.movement) {
      movements.push(r.movement);
      ops.push({ store: 'movements', type: 'put', value: r.movement });
    }
  }
  setState({ pantry, movements: [...movements, ...s.movements], countDraft: {} });
  ops.push({ store: 'meta', type: 'put', value: { key: 'countDraft', value: {} } });
  persist(ops);
  return { updated: Object.keys(counts).length, changed: movements.length };
}

export function saveCountDraft(draft) {
  setState({ countDraft: draft });
  persist([{ store: 'meta', type: 'put', value: { key: 'countDraft', value: draft } }]);
}

// ---------- Lista da semana ----------

function updateShopping(weekId, fn) {
  const w = getWeek(weekId);
  const shopping = fn({ checked: {}, overrides: {}, missing: {}, extras: [], ...w.shopping });
  return saveWeek({ ...w, shopping });
}

export function setChecked(weekId, key, checked) {
  updateShopping(weekId, (sh) => ({ ...sh, checked: { ...sh.checked, [key]: checked } }));
}

export function setOverride(weekId, key, qty) {
  updateShopping(weekId, (sh) => {
    const overrides = { ...sh.overrides };
    if (qty == null) delete overrides[key];
    else overrides[key] = qty;
    return { ...sh, overrides };
  });
}

export function setMissing(weekId, key, missing) {
  updateShopping(weekId, (sh) => ({ ...sh, missing: { ...sh.missing, [key]: missing } }));
}

export function addExtra(weekId, extra) {
  updateShopping(weekId, (sh) => ({ ...sh, extras: [...sh.extras, { id: uid('avulso'), checked: false, registered: false, ...extra }] }));
}

export function updateExtra(weekId, id, patch) {
  updateShopping(weekId, (sh) => ({ ...sh, extras: sh.extras.map((e) => (e.id === id ? { ...e, ...patch } : e)) }));
}

export function removeExtra(weekId, id) {
  updateShopping(weekId, (sh) => ({ ...sh, extras: sh.extras.filter((e) => e.id !== id) }));
}

export function clearChecked(weekId) {
  updateShopping(weekId, (sh) => ({ ...sh, checked: {}, extras: sh.extras.map((e) => ({ ...e, checked: false })) }));
}

// ---------- Mercado do mês ----------

function saveMonthly(session) {
  setState({ monthlySession: session });
  persist([{ store: 'meta', type: 'put', value: { key: 'monthlySession', value: session } }]);
}

export function setMonthlyChecked(ingredientId, checked, qty) {
  const s = getState().monthlySession;
  const session = { id: s.id ?? uid('mensal'), checked: { ...s.checked, [ingredientId]: checked }, qty: { ...s.qty } };
  if (qty != null && session.qty[ingredientId] == null) session.qty[ingredientId] = qty;
  saveMonthly(session);
}

export function setMonthlyQty(ingredientId, qty) {
  const s = getState().monthlySession;
  saveMonthly({ id: s.id ?? uid('mensal'), checked: { ...s.checked }, qty: { ...s.qty, [ingredientId]: qty } });
}

export function resetMonthly() {
  saveMonthly({ id: null, checked: {}, qty: {} });
}

/** Finaliza a compra mensal uma única vez por sessão (evita lançamentos duplicados). */
export function finalizeMonthly(lines) {
  const s = getState();
  const sessionId = s.monthlySession.id;
  if (sessionId && s.purchases.some((p) => p.sessionId === sessionId)) {
    return { duplicate: true };
  }
  const { purchase, errors } = registerPurchase({ lines, type: 'mensal' });
  const withSession = { ...purchase, sessionId };
  setState((st) => ({ purchases: st.purchases.map((p) => (p.id === purchase.id ? withSession : p)) }));
  persist([{ store: 'purchases', type: 'put', value: withSession }]);
  resetMonthly();
  return { purchase: withSession, errors };
}

// ---------- Configurações e dados ----------

export function updateSettings(patch) {
  const settings = { ...getState().settings, ...patch };
  setState({ settings });
  persist([{ store: 'meta', type: 'put', value: { key: 'settings', value: settings } }]);
}

export function exportData() {
  return buildBackup(getState());
}

export async function importData(data) {
  const full = { ...data, settings: { ...DEFAULT_SETTINGS, ...data.settings } };
  await persist(seedOps(full));
  applyFullData(full);
}

export async function resetDemo() {
  const seed = buildSeed();
  await persist(seedOps(seed));
  applyFullData(seed);
}

/** Apaga cardápios, estoque e histórico, mantendo receitas e catálogo. */
export async function startFresh() {
  const s = getState();
  const data = {
    ingredients: s.ingredients,
    recipes: s.recipes,
    pantry: {},
    weeks: {},
    marmitas: {},
    movements: [],
    purchases: [],
    settings: s.settings,
  };
  await persist(seedOps(data));
  applyFullData(data);
}

/** Demanda da semana já com o estado atual (atalho para as telas). */
export function weekDemand(weekId) {
  const s = getState();
  return computeDemand({
    weekId,
    week: getWeek(weekId),
    recipesById: s.recipes,
    ingredientsById: s.ingredients,
    marmitas: Object.values(s.marmitas),
  });
}

export { addDays };
