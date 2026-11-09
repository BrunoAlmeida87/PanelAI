import { describe, expect, it } from 'vitest';
import { addDays, formatWeekRange, weekDates, weekStartOf, parseISODate } from '../../src/utils/dates.js';
import { recipeRestrictions, scaleIngredients, validateRecipe, emptyRecipe, recipeSpeed } from '../../src/models/recipe.js';
import { copyWeekMeals, duplicateEntry, moveEntry, removeEntry, countEntries, clearMeals } from '../../src/services/planning.js';
import { balanceStats, planningStats, prepTasks } from '../../src/services/indicators.js';
import { evaluateRecipe } from '../../src/services/suggestions.js';
import { newPantryItem, setStock, applyStockDelta, replenishment, isBelowMin } from '../../src/services/pantry.js';
import { buildBackup, validateBackup } from '../../src/services/backup.js';
import { menuToText } from '../../src/services/share.js';
import { SEED_RECIPES } from '../../src/data/recipes.js';
import { ingredientsById, recipesById, testRecipe, WEEK, weekWith } from './fixtures.js';
import { emptyWeek } from '../../src/services/demand.js';

describe('datas e semanas', () => {
  it('identifica a segunda-feira da semana, inclusive no domingo e na virada do ano', () => {
    expect(weekStartOf('2026-11-09')).toBe('2026-11-09');
    expect(weekStartOf('2026-11-15')).toBe('2026-11-09');
    expect(weekStartOf('2027-01-01')).toBe('2026-12-28');
  });

  it('gera os 7 dias da semana com o ano correto', () => {
    expect(weekDates('2026-12-28')).toEqual([
      '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03',
    ]);
    expect(addDays('2026-11-09', 7)).toBe('2026-11-16');
    expect(formatWeekRange('2026-11-09')).toBe('09/11 – 15/11/2026');
  });

  it('rejeita datas inválidas', () => {
    expect(() => parseISODate('2026-02-30')).toThrow();
    expect(() => parseISODate('abc')).toThrow();
  });
});

describe('receitas', () => {
  it('todas as receitas iniciais são válidas e usam ingredientes do catálogo', () => {
    for (const r of SEED_RECIPES) expect(validateRecipe(r, ingredientsById), r.id).toEqual([]);
    expect(SEED_RECIPES.filter((r) => r.category === 'lanche').length).toBeGreaterThan(5);
  });

  it('escala porções proporcionalmente', () => {
    const scaled = scaleIngredients(recipesById['arroz-branco'], 8);
    expect(scaled.find((l) => l.ingredientId === 'arroz').qty).toBe(500);
    expect(recipesById['arroz-branco'].ingredients.find((l) => l.ingredientId === 'arroz').qty).toBe(250);
  });

  it('deduz restrições alimentares a partir dos ingredientes', () => {
    expect(recipeRestrictions(recipesById['ensopado-lentilha'], ingredientsById)).toEqual(
      expect.arrayContaining(['vegetariano', 'vegano', 'sem-gluten', 'sem-lactose']),
    );
    // Bacon opcional não impede o feijão de ser vegetariano
    expect(recipeRestrictions(recipesById['feijao-carioca'], ingredientsById)).toContain('vegetariano');
    expect(recipeRestrictions(recipesById['strogonoff-frango'], ingredientsById)).not.toContain('vegetariano');
    expect(recipeRestrictions(recipesById['strogonoff-frango'], ingredientsById)).not.toContain('sem-lactose');
  });

  it('classifica a velocidade pelo tempo de preparo', () => {
    expect(recipeSpeed({ time: 10 })).toBe('ultrarrapida');
    expect(recipeSpeed({ time: 30 })).toBe('rapida');
    expect(recipeSpeed({ time: 45 })).toBe('moderada');
    expect(recipeSpeed({ time: 90 })).toBe('elaborada');
  });

  it('valida campos obrigatórios', () => {
    const errors = validateRecipe({ ...emptyRecipe(), id: 'x' }, ingredientsById);
    expect(errors).toContain('Informe o nome da receita.');
    expect(errors).toContain('Adicione pelo menos um ingrediente.');
    const bad = { ...emptyRecipe(), id: 'x', name: 'X', ingredients: [{ ingredientId: 'nao-existe', qty: 1, unit: 'g' }] };
    expect(validateRecipe(bad, ingredientsById)[0]).toMatch(/não existe/);
    const meat = { ...emptyRecipe(), id: 'x', name: 'X', protein: 'sem-carne', ingredients: [{ ingredientId: 'bacon', qty: 50, unit: 'g' }] };
    expect(validateRecipe(meat, ingredientsById)[0]).toMatch(/Sem carne/);
    const zero = { ...emptyRecipe(), id: 'x', name: 'X', ingredients: [{ ingredientId: 'sal', qty: 0, unit: 'g' }] };
    expect(validateRecipe(zero, ingredientsById)[0]).toMatch(/maior que zero/);
  });
});

describe('operações do cardápio', () => {
  const week = () =>
    weekWith([
      ['2026-11-09', 'almoco', { kind: 'recipe', recipeId: 'arroz-branco', servings: 2 }],
      ['2026-11-09', 'jantar', { kind: 'out', text: 'Aniversário' }],
    ]);

  it('transfere refeição entre dias', () => {
    const w = week();
    const id = w.meals['2026-11-09'].almoco[0].id;
    const moved = moveEntry(w, id, '2026-11-10', 'jantar');
    expect(moved.meals['2026-11-09'].almoco).toHaveLength(0);
    expect(moved.meals['2026-11-10'].jantar[0].id).toBe(id);
  });

  it('duplica refeição com novos IDs', () => {
    const w = week();
    const id = w.meals['2026-11-09'].almoco[0].id;
    const dup = duplicateEntry(w, id, [
      { date: '2026-11-10', slot: 'almoco' },
      { date: '2026-11-11', slot: 'almoco' },
    ]);
    expect(countEntries(dup)).toBe(4);
    expect(dup.meals['2026-11-10'].almoco[0].id).not.toBe(id);
  });

  it('exclui e limpa refeições', () => {
    const w = week();
    const id = w.meals['2026-11-09'].almoco[0].id;
    expect(countEntries(removeEntry(w, '2026-11-09', 'almoco', id))).toBe(1);
    expect(countEntries(clearMeals(w))).toBe(0);
  });

  it('copia a semana anterior deslocando as datas', () => {
    const src = week();
    const copy = copyWeekMeals({ source: src, sourceId: WEEK, target: null, targetId: '2026-11-16' });
    expect(copy.id).toBe('2026-11-16');
    const target = copyWeekMeals({ source: src, sourceId: WEEK, target: emptyWeek('2026-11-16'), targetId: '2026-11-16' });
    expect(target.id).toBe('2026-11-16');
    expect(target.meals['2026-11-16'].almoco[0].recipeId).toBe('arroz-branco');
    expect(target.meals['2026-11-16'].jantar[0].kind).toBe('out');
  });
});

describe('indicadores', () => {
  it('conta refeições planejadas, pendências e tipos', () => {
    const w = weekWith([
      ['2026-11-09', 'almoco', { kind: 'recipe', recipeId: 'frango-grelhado', servings: 2 }],
      ['2026-11-09', 'jantar', { kind: 'out', text: '' }],
      ['2026-11-10', 'lanche_manha', { kind: 'text', text: 'Fruta' }],
    ]);
    const s = planningStats({ weekId: WEEK, week: w, settings: { trackSnacks: false } });
    expect(s.tracked).toBe(14);
    expect(s.filledTracked).toBe(2);
    expect(s.pending).toHaveLength(12);
    expect(s.kinds).toEqual({ recipe: 1, marmita: 0, out: 1, text: 1 });
    const s2 = planningStats({ weekId: WEEK, week: w, settings: { trackSnacks: true } });
    expect(s2.tracked).toBe(28);
  });

  it('calcula equilíbrio por proteína e composição', () => {
    const w = weekWith([
      ['2026-11-09', 'almoco', { kind: 'recipe', recipeId: 'frango-grelhado', servings: 2 }],
      ['2026-11-10', 'almoco', { kind: 'recipe', recipeId: 'peixe-assado', servings: 2 }],
    ]);
    const b = balanceStats({ week: w, recipesById });
    expect(b.meals).toBe(2);
    expect(b.proteins.frango).toBe(1);
    expect(b.proteins.peixe).toBe(1);
    expect(b.composition.vegetal).toBe(1);
  });

  it('gera tarefas de preparo antecipado na véspera', () => {
    const w = weekWith([['2026-11-10', 'almoco', { kind: 'recipe', recipeId: 'r', servings: 2 }]]);
    const tasks = prepTasks({ weekId: WEEK, week: w, recipesById: { r: testRecipe('r', 300) } });
    expect(tasks).toHaveLength(1);
    expect(tasks[0].date).toBe('2026-11-09');
    expect(tasks[0].done).toBe(false);
  });
});

describe('sugestões pelo estoque', () => {
  it('classifica receitas por ingredientes faltantes', () => {
    const pantry = {
      ovos: newPantryItem(ingredientsById.ovos, { qty: 12 }),
      mussarela: newPantryItem(ingredientsById.mussarela, { qty: 200 }),
      tomate: newPantryItem(ingredientsById.tomate, { qty: 3 }),
      sal: newPantryItem(ingredientsById.sal, { qty: 1, unit: 'kg' }),
      'cheiro-verde': newPantryItem(ingredientsById['cheiro-verde'], { qty: 1 }),
    };
    const ctx = { pantry, ingredientsById };
    expect(evaluateRecipe(recipesById.omelete, ctx).level).toBe('todos');
    const pure = evaluateRecipe(recipesById['pure-batata'], ctx);
    expect(pure.level).toBe('muitos');
    expect(pure.missing.map((m) => m.ingredientId)).toEqual(['batata', 'leite', 'manteiga']);
    const tapioca = evaluateRecipe(recipesById['tapioca-queijo'], ctx);
    expect(tapioca.level).toBe('poucos');
  });
});

describe('estoque', () => {
  it('registra movimentações de compra e contagem', () => {
    const item = newPantryItem(ingredientsById.arroz, { qty: 1, unit: 'kg' });
    const { item: after, movement } = applyStockDelta({ item, ingredient: ingredientsById.arroz, delta: 500, unit: 'g', type: 'compra' });
    expect(after.qty).toBe(1.5);
    expect(movement).toMatchObject({ type: 'compra', delta: 0.5, unit: 'kg', before: 1, after: 1.5 });
    const counted = setStock({ item: after, qty: 1.2 });
    expect(counted.movement.delta).toBeCloseTo(-0.3);
    expect(setStock({ item: after, qty: 1.5 }).movement).toBeNull();
  });

  it('consumo nunca deixa o estoque negativo', () => {
    const item = newPantryItem(ingredientsById.ovos, { qty: 2 });
    const { item: after, movement } = applyStockDelta({ item, ingredient: ingredientsById.ovos, delta: -5, unit: 'un', type: 'consumo' });
    expect(after.qty).toBe(0);
    expect(movement.delta).toBe(-2);
  });

  it('recusa conversões incompatíveis', () => {
    const item = newPantryItem(ingredientsById.couve, { qty: 1 });
    expect(() => applyStockDelta({ item, ingredient: ingredientsById.couve, delta: 100, unit: 'g', type: 'compra' })).toThrow();
  });

  it('calcula reposição e alerta de mínimo', () => {
    expect(replenishment({ qty: 1, desired: 4 })).toBe(3);
    expect(replenishment({ qty: 5, desired: 4 })).toBe(0);
    expect(isBelowMin({ qty: 1, min: 2 })).toBe(true);
    expect(isBelowMin({ qty: 1, min: 0 })).toBe(false);
  });
});

describe('exportação e importação', () => {
  const data = () => ({
    ingredients: ingredientsById,
    recipes: recipesById,
    pantry: { arroz: newPantryItem(ingredientsById.arroz, { qty: 2, unit: 'kg' }) },
    weeks: { [WEEK]: weekWith([['2026-11-09', 'almoco', { kind: 'recipe', recipeId: 'arroz-branco', servings: 2 }]]) },
    marmitas: {},
    movements: [],
    purchases: [],
    settings: { people: 3 },
  });

  it('exporta e importa sem perdas', () => {
    const json = JSON.stringify(buildBackup(data()));
    const r = validateBackup(json);
    expect(r.ok).toBe(true);
    expect(Object.keys(r.data.recipes)).toHaveLength(Object.keys(recipesById).length);
    expect(r.data.weeks[WEEK].meals['2026-11-09'].almoco).toHaveLength(1);
    expect(r.data.settings.people).toBe(3);
  });

  it('rejeita arquivos inválidos sem aplicar nada', () => {
    expect(validateBackup('não é json').ok).toBe(false);
    expect(validateBackup({ app: 'Outro', version: 1, data: {} }).ok).toBe(false);
    const b = buildBackup(data());
    b.data.recipes[0] = { ...b.data.recipes[0], ingredients: [{ ingredientId: 'inexistente', qty: 1, unit: 'g' }] };
    const r = validateBackup(b);
    expect(r.ok).toBe(false);
    expect(r.errors[0]).toMatch(/não existe/);
    const b2 = buildBackup(data());
    b2.data.weeks[0] = { ...b2.data.weeks[0], id: '2026-11-10' }; // não é segunda-feira
    expect(validateBackup(b2).ok).toBe(false);
  });
});

describe('compartilhamento', () => {
  it('gera texto do cardápio para WhatsApp', () => {
    const w = weekWith([['2026-11-09', 'almoco', { kind: 'recipe', recipeId: 'arroz-branco', servings: 2 }]]);
    const text = menuToText({ weekId: WEEK, week: w, recipesById });
    expect(text).toContain('*Segunda (09/11)*');
    expect(text).toContain('Almoço: Arroz branco');
  });
});
