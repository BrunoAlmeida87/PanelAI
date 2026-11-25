// Dados do sistema prontos para os cards do display (a partir do estado do app).

import { MEAL_SLOTS } from '../models/constants.js';
import { formatQty } from '../models/units.js';
import { computeDemand, emptyWeek } from '../services/demand.js';
import { buildShoppingList } from '../services/shopping.js';
import { prepTasks } from '../services/indicators.js';
import { isBelowMin } from '../services/pantry.js';
import { entryLabel } from '../services/share.js';
import { missingRecurring, overdueTasks, tasksOn, weekSummary } from '../models/tasks.js';
import { addDays, todayISO, weekDates, weekStartOf } from '../utils/dates.js';
import { montessoriToday } from '../data/montessoriLibrary.js';

/**
 * Tarefas da semana atual e da próxima, incluindo as tarefas fixas que ainda
 * não foram criadas. O display mostra a tarefa fixa de hoje mesmo que ninguém
 * tenha aberto o app hoje (e sem gravar nada: a conta da tela é só leitura).
 * Os ids são os mesmos que o app usa ao criar, então nada aparece em dobro.
 */
function displayTasks(s, today, weekId, now) {
  const stored = Object.values(s.tasks ?? {});
  const planned = missingRecurring({
    templates: Object.values(s.taskTemplates ?? {}),
    dates: [...weekDates(weekId), ...weekDates(addDays(weekId, 7))],
    tasksById: s.tasks ?? {},
    today,
    actor: { name: 'Tarefa fixa' },
    now,
  });
  return planned.length ? [...stored, ...planned] : stored;
}

/**
 * @param now       instante "da tela" (dia de hoje, horas do clima…). Perto de um horário
 *                  agendado, a imagem é feita para ele (ex.: 00:00, para já mostrar o dia novo).
 * @param updatedAt quando a imagem foi realmente gerada ("Atualizado às" do card de data).
 */
export function buildDisplayData(s, now = new Date(), updatedAt = now) {
  const today = todayISO(now);
  const tomorrow = addDays(today, 1);
  const weekId = weekStartOf(today);
  const weekOf = (date) => s.weeks[weekStartOf(date)] ?? emptyWeek(weekStartOf(date));
  const tasks = displayTasks(s, today, weekId, now);
  const ctx = { recipesById: s.recipes, marmitasById: s.marmitas };

  const meals = (date) =>
    MEAL_SLOTS.map((slot) => ({
      slot: slot.id,
      label: slot.label,
      short: slot.short,
      entries: (weekOf(date).meals?.[date]?.[slot.id] ?? []).map((e) => ({
        text: entryLabel(e, ctx),
        servings: e.servings,
        done: !!e.done,
      })),
    }));

  const shoppingCache = new Map();
  /** Lista de compras da semana de `date` (padrão: hoje). Com `onlyDay`, só o que é para aquele dia. */
  const getShopping = (date = today, onlyDay = false) => {
    const wid = weekStartOf(date);
    if (!shoppingCache.has(wid)) {
      const week = weekOf(date);
      const demand = computeDemand({ weekId: wid, week, recipesById: s.recipes, ingredientsById: s.ingredients, marmitas: Object.values(s.marmitas) });
      const list = buildShoppingList({ weekId: wid, week, demand, pantry: s.pantry, ingredientsById: s.ingredients, settings: s.settings });
      shoppingCache.set(wid, [
        ...list.buyItems.map((i) => ({ name: i.name, qty: formatQty(i.toBuy, i.unit), checked: i.checked, category: i.category, date: i.marketDate })),
        ...list.extras.map((e) => ({ name: e.name, qty: e.qty ? formatQty(e.qty, e.unit) : '', checked: e.checked, category: e.category ?? 'outros', date: e.marketDate })),
        ...list.toCheck.filter((t) => t.missing).map((t) => ({ name: t.name, qty: '', checked: t.checked, category: t.category, date: t.marketDate })),
      ]);
    }
    const all = shoppingCache.get(wid);
    return onlyDay ? all.filter((i) => i.date === date) : all;
  };

  const pantryLow = () =>
    Object.values(s.pantry)
      .filter((p) => isBelowMin(p) || ((Number(p.min) || 0) > 0 && (Number(p.qty) || 0) <= 0))
      .map((p) => ({ name: s.ingredients[p.ingredientId]?.name ?? p.ingredientId, qty: formatQty(Number(p.qty) || 0, p.unit), min: formatQty(Number(p.min) || 0, p.unit) }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  const marmitas = () =>
    Object.values(s.marmitas)
      .filter((m) => ['planejada', 'preparada', 'armazenada'].includes(m.status))
      .map((m) => ({ name: s.recipes[m.recipeId]?.name ?? 'Marmita', portions: m.portions, status: m.status, storage: m.storage, prepDate: m.prepDate }))
      .sort((a, b) => a.prepDate.localeCompare(b.prepDate));

  const prep = (date) => {
    const wid = weekStartOf(date);
    return prepTasks({ weekId: wid, week: weekOf(date), recipesById: s.recipes, marmitas: Object.values(s.marmitas) }).filter((t) => t.date === date && !t.done);
  };

  const summary = () => {
    const dates = weekDates(weekId);
    const t = weekSummary(tasks, dates);
    const week = weekOf(today);
    let planned = 0;
    for (const d of dates) for (const slot of ['almoco', 'jantar']) if ((week.meals?.[d]?.[slot] ?? []).length) planned++;
    const shop = getShopping();
    return { tasksDone: t.done, tasksTotal: t.total, pending: t.pending, planned, plannedTotal: 14, toBuy: shop.filter((i) => !i.checked).length };
  };

  // Atividades Montessori do dia: calculadas sem gravar (a conta da tela só lê).
  let montessori = null;
  const getMontessori = () => (montessori ??= montessoriToday(s, today));

  return {
    now,
    updatedAt,
    today,
    tomorrow,
    weekId,
    dayOf: (key) => (key === 'tomorrow' ? tomorrow : today),
    meals,
    tasksOn: (date) => tasksOn(tasks, date).filter((t) => t.status !== 'postponed'),
    overdue: () => overdueTasks(tasks, today),
    pending: () => {
      const list = tasks.filter((t) => !t.deleted && t.status === 'pending');
      const late = overdueTasks(tasks, today).filter((t) => t.status !== 'pending');
      return [...list, ...late].sort((a, b) => a.date.localeCompare(b.date));
    },
    shopping: getShopping,
    shoppingFromMenu: s.settings?.shoppingFromMenu !== false,
    pantryLow,
    marmitas,
    prep,
    summary,
    montessori: getMontessori,
  };
}
