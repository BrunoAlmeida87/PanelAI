// Dados de demonstração coerentes, criados no primeiro acesso
// (ou ao restaurar a demonstração nas configurações).

import { SEED_INGREDIENTS } from './ingredients.js';
import { SEED_RECIPES } from './recipes.js';
import { DEFAULT_SETTINGS } from '../models/constants.js';
import { emptyWeek } from '../services/demand.js';
import { addEntry, newEntry } from '../services/planning.js';
import { newPantryItem } from '../services/pantry.js';
import { addDays, todayISO, weekStartOf } from '../utils/dates.js';

const PANTRY = [
  // ingredientId, qty, unit, min, desired, monthly
  ['arroz', 2, 'kg', 1, 5, true],
  ['feijao-carioca', 1, 'kg', 0.5, 2, true],
  ['cafe', 1, 'pacote', 1, 3, true],
  ['acucar', 1, 'kg', 0.5, 2, true],
  ['azeite', 300, 'ml', 250, 1000, true],
  ['oleo', 900, 'ml', 450, 1800, true],
  ['sal', 1, 'kg', 0.2, 1, true],
  ['macarrao-espaguete', 1, 'pacote', 1, 3, true],
  ['molho-tomate', 2, 'un', 1, 4, true],
  ['farinha-trigo', 1, 'kg', 0.5, 1, true],
  ['aveia', 250, 'g', 100, 500, true],
  ['shoyu', 150, 'ml', 100, 500, true],
  ['ketchup', 200, 'g', 0, 400, true],
  ['mostarda', 100, 'g', 0, 200, true],
  ['maionese', 0, 'g', 0, 500, true],
  ['detergente', 1, 'un', 2, 5, true],
  ['sabao-po', 1, 'pacote', 1, 2, true],
  ['agua-sanitaria', 500, 'ml', 500, 2000, true],
  ['esponja', 2, 'un', 1, 4, true],
  ['papel-higienico', 6, 'rolo', 8, 24, true],
  ['sabonete', 2, 'un', 2, 6, true],
  ['creme-dental', 1, 'un', 1, 3, true],
  ['ovos', 6, 'un', 6, 12, false],
  ['leite', 1, 'l', 1, 4, false],
  ['manteiga', 200, 'g', 100, 400, false],
  ['alho', 120, 'g', 50, 200, false],
  ['cebola', 3, 'un', 2, 6, false],
  ['tomate', 2, 'un', 0, 6, false],
  ['peito-frango', 500, 'g', 0, 1000, false],
  ['mussarela', 150, 'g', 0, 300, false],
  ['pimenta-do-reino', 50, 'g', 0, 50, false],
  ['cheiro-verde', 1, 'maco', 0, 1, false],
  ['limao', 2, 'un', 0, 6, false],
  ['banana', 4, 'un', 0, 6, false],
];

export function buildSeed(now = new Date()) {
  const ingredients = Object.fromEntries(SEED_INGREDIENTS.map((i) => [i.id, { ...i }]));
  const recipes = Object.fromEntries(SEED_RECIPES.map((r) => [r.id, structuredClone(r)]));
  recipes['strogonoff-frango'].favorite = true;
  recipes['arroz-branco'].favorite = true;
  recipes['feijao-carioca'].favorite = true;

  const stamp = now.toISOString();
  const pantry = {};
  for (const [id, qty, unit, min, desired, monthly] of PANTRY) {
    pantry[id] = newPantryItem(ingredients[id], { qty, unit, min, desired, monthly, updatedAt: stamp });
  }

  const weekId = weekStartOf(todayISO(now));
  const d = (n) => addDays(weekId, n);
  const people = DEFAULT_SETTINGS.people;
  const marmitaId = 'marmita_demo_carne';
  const marmitas = {
    [marmitaId]: {
      id: marmitaId,
      recipeId: 'carne-panela',
      portions: 4,
      prepDate: d(0),
      status: 'planejada',
      storage: 'geladeira',
      notes: 'Separar em 2 potes de 2 porções.',
      createdAt: stamp,
    },
  };

  let w = emptyWeek(weekId);
  const add = (day, slot, data) => {
    w = addEntry(w, d(day), slot, newEntry(data));
  };
  const r = (recipeId, servings = people) => ({ kind: 'recipe', recipeId, servings });

  add(0, 'lanche_manha', r('iogurte-frutas', 2));
  add(0, 'almoco', r('arroz-branco'));
  add(0, 'almoco', r('feijao-carioca'));
  add(0, 'almoco', r('frango-grelhado'));
  add(0, 'jantar', r('omelete'));
  add(1, 'almoco', r('strogonoff-frango'));
  add(1, 'almoco', r('arroz-branco'));
  add(1, 'jantar', r('sanduiche-natural'));
  add(2, 'almoco', { kind: 'marmita', marmitaId, servings: 2 });
  add(2, 'jantar', r('yakisoba'));
  add(3, 'almoco', { kind: 'marmita', marmitaId, servings: 2 });
  add(3, 'jantar', { kind: 'out', text: 'Pizza com os amigos' });
  add(4, 'almoco', r('peixe-assado'));
  add(4, 'almoco', r('salada-verde'));
  add(5, 'almoco', r('macarrao-bolonhesa'));
  add(6, 'almoco', { kind: 'out', text: 'Almoço de família' });

  return {
    ingredients,
    recipes,
    pantry,
    weeks: { [weekId]: w },
    marmitas,
    movements: [],
    purchases: [],
    notes: {
      recado_demo_lixo: {
        id: 'recado_demo_lixo',
        text: 'Colocar o lixo reciclável para fora',
        author: '',
        pinned: false,
        startDate: null,
        endDate: null,
        weekdays: [2, 4],
        createdAt: stamp,
        updatedAt: stamp,
      },
      recado_demo_boasvindas: {
        id: 'recado_demo_boasvindas',
        text: 'Bem-vindo ao PanelAI! Deixe aqui avisos para quem mora com você.',
        author: 'PanelAI',
        pinned: true,
        startDate: null,
        endDate: d(6),
        weekdays: [],
        createdAt: stamp,
        updatedAt: stamp,
      },
    },
    settings: { ...DEFAULT_SETTINGS },
  };
}
