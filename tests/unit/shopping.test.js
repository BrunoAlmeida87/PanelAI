import { describe, expect, it } from 'vitest';
import { computeDemand } from '../../src/services/demand.js';
import {
  assignMarketDate,
  buildShoppingList,
  groupByMarketAndCategory,
  marketDatesForWeek,
  purchasableLines,
} from '../../src/services/shopping.js';
import { applyStockDelta, monthlyList, newPantryItem } from '../../src/services/pantry.js';
import { addEntry, newEntry, updateEntry } from '../../src/services/planning.js';
import { ingredientsById, recipesById as seedRecipes, testRecipe, WEEK, weekWith } from './fixtures.js';

const recipes = {
  ...seedRecipes,
  r300: testRecipe('r300', 300),
  r500: testRecipe('r500', 500),
  r400: testRecipe('r400', 400),
  r1000: testRecipe('r1000', 1000),
};
const settings = { marketDays: [0, 3] };

function listFor(week, pantry = {}, marmitas = []) {
  const demand = computeDemand({ weekId: WEEK, week, recipesById: recipes, ingredientsById, marmitas });
  return { demand, list: buildShoppingList({ weekId: WEEK, week, demand, pantry, ingredientsById, settings }) };
}

const chicken = (list) => list.items.find((i) => i.ingredientId === 'peito-frango');

describe('consolidação de ingredientes', () => {
  it('soma ingredientes repetidos na semana (300 g + 500 g + 400 g = 1,2 kg)', () => {
    const week = weekWith([
      ['2026-11-09', 'almoco', { kind: 'recipe', recipeId: 'r300', servings: 2 }],
      ['2026-11-11', 'almoco', { kind: 'recipe', recipeId: 'r500', servings: 2 }],
      ['2026-11-13', 'jantar', { kind: 'recipe', recipeId: 'r400', servings: 2 }],
    ]);
    const { list } = listFor(week);
    const item = chicken(list);
    expect(item.need).toBe(1200);
    expect(item.toBuy).toBe(1200);
    expect(item.sources).toHaveLength(3);
    expect(item.sources.map((s) => s.date)).toEqual(['2026-11-09', '2026-11-11', '2026-11-13']);
  });

  it('desconta o estoque disponível (1,2 kg − 500 g = 700 g)', () => {
    const week = weekWith([
      ['2026-11-09', 'almoco', { kind: 'recipe', recipeId: 'r300', servings: 2 }],
      ['2026-11-11', 'almoco', { kind: 'recipe', recipeId: 'r500', servings: 2 }],
      ['2026-11-13', 'jantar', { kind: 'recipe', recipeId: 'r400', servings: 2 }],
    ]);
    const pantry = { 'peito-frango': newPantryItem(ingredientsById['peito-frango'], { qty: 0.5, unit: 'kg' }) };
    const { list } = listFor(week, pantry);
    const item = chicken(list);
    expect(item.stock).toBe(500);
    expect(item.toBuy).toBe(700);
    expect(item.status).toBe('comprar');
  });

  it('recalcula ao adicionar receita (1,5 kg − 500 g = 1 kg; +400 g = 1,4 kg)', () => {
    let week = weekWith([
      ['2026-11-09', 'almoco', { kind: 'recipe', recipeId: 'r1000', servings: 2 }],
      ['2026-11-10', 'almoco', { kind: 'recipe', recipeId: 'r500', servings: 2 }],
    ]);
    const pantry = { 'peito-frango': newPantryItem(ingredientsById['peito-frango'], { qty: 500, unit: 'g' }) };
    expect(chicken(listFor(week, pantry).list).toBuy).toBe(1000);
    week = addEntry(week, '2026-11-12', 'jantar', newEntry({ kind: 'recipe', recipeId: 'r400', servings: 2 }));
    expect(chicken(listFor(week, pantry).list).toBuy).toBe(1400);
  });

  it('ajusta quantidades pelas porções sem alterar a receita original', () => {
    const week = weekWith([['2026-11-09', 'almoco', { kind: 'recipe', recipeId: 'r300', servings: 4 }]]);
    expect(chicken(listFor(week).list).need).toBe(600);
    expect(recipes.r300.ingredients[0].qty).toBe(300);
  });

  it('normaliza unidades diferentes do mesmo ingrediente (dentes + gramas de alho)', () => {
    const week = weekWith([
      ['2026-11-09', 'almoco', { kind: 'recipe', recipeId: 'arroz-branco', servings: 4 }], // 2 dentes
      ['2026-11-10', 'almoco', { kind: 'recipe', recipeId: 'couve-refogada', servings: 4 }], // 3 dentes
    ]);
    const alho = listFor(week).list.items.find((i) => i.ingredientId === 'alho');
    expect(alho.unit).toBe('g');
    expect(alho.need).toBe(25);
  });

  it('não desconta estoque só porque a receita foi planejada', () => {
    const week = weekWith([['2026-11-09', 'almoco', { kind: 'recipe', recipeId: 'r300', servings: 2 }]]);
    const pantry = { 'peito-frango': newPantryItem(ingredientsById['peito-frango'], { qty: 1000, unit: 'g' }) };
    listFor(week, pantry);
    expect(pantry['peito-frango'].qty).toBe(1000);
  });

  it('remove da demanda refeições já preparadas', () => {
    let week = weekWith([['2026-11-09', 'almoco', { kind: 'recipe', recipeId: 'r300', servings: 2 }]]);
    const entry = week.meals['2026-11-09'].almoco[0];
    week = updateEntry(week, '2026-11-09', 'almoco', entry.id, { done: true });
    expect(chicken(listFor(week).list)).toBeUndefined();
  });

  it('ignora ingredientes opcionais e água', () => {
    const week = weekWith([['2026-11-09', 'almoco', { kind: 'recipe', recipeId: 'feijao-carioca', servings: 8 }]]);
    const ids = listFor(week).list.items.map((i) => i.ingredientId);
    expect(ids).not.toContain('bacon');
    expect(ids).not.toContain('agua');
    expect(ids).toContain('feijao-carioca');
  });

  it('coloca temperos "a gosto" sem estoque em "confira na despensa"', () => {
    const week = weekWith([['2026-11-09', 'almoco', { kind: 'recipe', recipeId: 'omelete', servings: 1 }]]);
    const { list } = listFor(week);
    expect(list.toCheck.map((t) => t.ingredientId)).toContain('cheiro-verde');
  });
});

describe('marmitas', () => {
  it('conta os ingredientes do lote uma única vez', () => {
    const marmita = { id: 'm1', recipeId: 'r300', portions: 6, prepDate: '2026-11-08', status: 'planejada' };
    // Preparo no domingo anterior: fora da semana → não conta nesta semana
    let week = weekWith([
      ['2026-11-10', 'almoco', { kind: 'marmita', marmitaId: 'm1', servings: 1 }],
      ['2026-11-11', 'almoco', { kind: 'marmita', marmitaId: 'm1', servings: 1 }],
    ]);
    expect(chicken(listFor(week, {}, [marmita]).list)).toBeUndefined();
    // Preparo dentro da semana: conta o lote (6 porções = 900 g), não as entradas
    const m2 = { ...marmita, prepDate: '2026-11-09' };
    const item = chicken(listFor(week, {}, [m2]).list);
    expect(item.need).toBe(900);
    expect(item.sources).toHaveLength(1);
    // Após preparada, sai da demanda
    expect(chicken(listFor(week, {}, [{ ...m2, status: 'preparada' }]).list)).toBeUndefined();
  });
});

describe('dias de mercado', () => {
  it('inclui o domingo anterior e as quartas', () => {
    expect(marketDatesForWeek(WEEK, [0, 3])).toEqual(['2026-11-08', '2026-11-11', '2026-11-15']);
  });

  it('atribui o último mercado antes do uso', () => {
    const dates = ['2026-11-08', '2026-11-11'];
    expect(assignMarketDate('2026-11-10', dates)).toBe('2026-11-08');
    expect(assignMarketDate('2026-11-11', dates)).toBe('2026-11-11');
    expect(assignMarketDate('2026-11-14', dates)).toBe('2026-11-11');
    expect(assignMarketDate('2026-11-09', [])).toBeNull();
  });

  it('agrupa itens por mercado e categoria', () => {
    const week = weekWith([
      ['2026-11-09', 'almoco', { kind: 'recipe', recipeId: 'r300', servings: 2 }],
      ['2026-11-12', 'almoco', { kind: 'recipe', recipeId: 'salada-verde', servings: 4 }],
    ]);
    const groups = groupByMarketAndCategory(listFor(week).list);
    expect(groups.map((g) => g.marketDate)).toEqual(['2026-11-08', '2026-11-11']);
    expect(groups[0].categories[0].category).toBe('acougue');
    expect(groups[1].categories[0].category).toBe('hortifruti');
  });
});

describe('estados da lista, ajustes e registro de compra', () => {
  const base = () =>
    weekWith([
      ['2026-11-09', 'almoco', { kind: 'recipe', recipeId: 'r300', servings: 2 }],
      ['2026-11-11', 'almoco', { kind: 'recipe', recipeId: 'r500', servings: 2 }],
    ]);

  it('preserva marcações válidas quando o cardápio muda', () => {
    let week = base();
    week = { ...week, shopping: { ...week.shopping, checked: { 'peito-frango|g': true, 'fantasma|g': true } } };
    week = addEntry(week, '2026-11-12', 'jantar', newEntry({ kind: 'recipe', recipeId: 'r400', servings: 2 }));
    const item = chicken(listFor(week).list);
    expect(item.checked).toBe(true);
    expect(item.need).toBe(1200);
  });

  it('respeita ajuste manual de quantidade', () => {
    let week = base();
    week = { ...week, shopping: { ...week.shopping, overrides: { 'peito-frango|g': 1000 } } };
    const item = chicken(listFor(week).list);
    expect(item.toBuy).toBe(1000);
    expect(item.suggested).toBe(800);
    expect(item.overridden).toBe(true);
  });

  it('marcar como comprado não altera o estoque; registrar compra evita duplicação', () => {
    let week = base();
    week = { ...week, shopping: { ...week.shopping, checked: { 'peito-frango|g': true } } };
    let pantry = {};
    let { list } = listFor(week, pantry);
    const lines = purchasableLines(list);
    expect(lines).toEqual([expect.objectContaining({ ingredientId: 'peito-frango', qty: 800, unit: 'g' })]);
    expect(pantry['peito-frango']).toBeUndefined();

    // Registro: cria item de estoque e lança a quantidade comprada
    const item = newPantryItem(ingredientsById['peito-frango']);
    const { item: updated, movement } = applyStockDelta({
      item,
      ingredient: ingredientsById['peito-frango'],
      delta: 800,
      unit: 'g',
      type: 'compra',
    });
    expect(movement.delta).toBe(800);
    pantry = { 'peito-frango': updated };

    // A lista é recalculada contra o estoque: item fica coberto e não pode ser lançado de novo
    ({ list } = listFor(week, pantry));
    expect(chicken(list).status).toBe('coberto');
    expect(purchasableLines(list)).toEqual([]);
  });

  it('itens avulsos entram na contagem e só são registrados uma vez', () => {
    let week = base();
    week = {
      ...week,
      shopping: {
        ...week.shopping,
        extras: [
          { id: 'x1', name: 'Café em pó', qty: 1, unit: 'pacote', category: 'mercearia', ingredientId: 'cafe', checked: true },
          { id: 'x2', name: 'Pilhas', qty: 4, unit: 'un', category: 'outros', ingredientId: null, checked: true },
          { id: 'x3', name: 'Café', qty: 1, unit: 'pacote', category: 'mercearia', ingredientId: 'cafe', checked: true, registered: true },
        ],
      },
    };
    const { list } = listFor(week);
    expect(list.summary.total).toBe(4);
    expect(list.summary.done).toBe(3);
    expect(purchasableLines(list).map((l) => l.key)).toEqual(['x1']);
  });
});

describe('conciliação semanal × mensal', () => {
  it('itens do mercado do mês não duplicam na lista da semana', () => {
    const week = weekWith([['2026-11-09', 'almoco', { kind: 'recipe', recipeId: 'arroz-branco', servings: 4 }]]);
    const pantry = {
      arroz: newPantryItem(ingredientsById.arroz, { qty: 1, unit: 'kg', desired: 5, min: 1, monthly: true }),
    };
    const { list, demand } = listFor(week, pantry);
    expect(list.buyItems.find((i) => i.ingredientId === 'arroz')).toBeUndefined();
    expect(list.monthly.find((i) => i.ingredientId === 'arroz')).toBeDefined();

    // Compra sugerida = máx(0, demanda semanal + desejado − disponível) = 0,25 + 5 − 1 = 4,25 → 4,3 kg
    const m = monthlyList({ pantry, ingredientsById, demand });
    expect(m[0].weekNeed).toBeCloseTo(0.25);
    expect(m[0].suggested).toBe(4.3);
  });

  it('reposição nunca é negativa', () => {
    const pantry = {
      cafe: newPantryItem(ingredientsById.cafe, { qty: 5, unit: 'pacote', desired: 2, monthly: true }),
    };
    const m = monthlyList({ pantry, ingredientsById, demand: new Map() });
    expect(m[0].suggested).toBe(0);
  });
});
