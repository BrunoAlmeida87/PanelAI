import { describe, expect, it } from 'vitest';
import { addCustomCategory, pantryBoard, parseQuickProduct } from '../../src/services/pantry.js';
import { allCategories, categoryLabel, categoryOrder, isCategory, setCustomCategories } from '../../src/models/constants.js';
import { buildBackup, validateBackup } from '../../src/services/backup.js';

describe('estoque simples: quadro por categoria', () => {
  it('entende "Leite 6", "6 leite", "2x pão" e só o nome', () => {
    expect(parseQuickProduct('Leite 6')).toEqual({ name: 'Leite', qty: 6 });
    expect(parseQuickProduct('  6  leite ')).toEqual({ name: 'leite', qty: 6 });
    expect(parseQuickProduct('2x Pão de forma')).toEqual({ name: 'Pão de forma', qty: 2 });
    expect(parseQuickProduct('Azeite 0,5')).toEqual({ name: 'Azeite', qty: 0.5 });
    expect(parseQuickProduct('Sabão em pó')).toEqual({ name: 'Sabão em pó', qty: null });
    expect(parseQuickProduct('   ')).toBeNull();
  });

  it('agrupa nas categorias, em ordem alfabética, e manda categoria desconhecida para Outros', () => {
    const cats = [
      { id: 'hortifruti', label: 'Hortifruti' },
      { id: 'outros', label: 'Outros' },
    ];
    const ingredients = { b: { id: 'b', name: 'Banana', category: 'hortifruti' }, a: { id: 'a', name: 'Alface', category: 'hortifruti' }, x: { id: 'x', name: 'Pilha', category: 'eletronicos' } };
    const pantry = { b: { ingredientId: 'b', qty: 6 }, a: { ingredientId: 'a', qty: 1 }, x: { ingredientId: 'x', qty: 4 }, z: { ingredientId: 'sumiu', qty: 1 } };
    const board = pantryBoard(pantry, ingredients, cats);
    expect(board.map((c) => c.items.map((i) => i.ing.name))).toEqual([['Alface', 'Banana'], ['Pilha']]);
  });
});

describe('categorias criadas pela casa', () => {
  it('cria com id e cor, recusa nome repetido (sem acento) e vazio', () => {
    const all = [{ id: 'hortifruti', label: 'Hortifruti' }, { id: 'outros', label: 'Outros' }];
    const r = addCustomCategory([], '  Bebê  ', all, ['#111111', '#222222']);
    expect(r.category).toEqual({ id: 'c-bebe', label: 'Bebê', color: '#111111' });
    expect(addCustomCategory(r.list, 'bebe', [...all, r.category], ['#111111']).error).toMatch(/Já existe/);
    expect(addCustomCategory([], 'HORTIFRUTI', all, ['#1']).error).toMatch(/Já existe/);
    expect(addCustomCategory([], '  ', all, ['#1']).error).toMatch(/Escreva/);
  });

  it('valem no app todo: nome, ordem antes de Outros e validade', () => {
    setCustomCategories([{ id: 'c-pet', label: 'Pet', color: '#123456' }, { id: 'ruim', label: 'X' }, { id: 'c-pet', label: 'Dup' }]);
    try {
      expect(allCategories().map((c) => c.id).slice(-2)).toEqual(['c-pet', 'outros']);
      expect(categoryLabel('c-pet')).toBe('Pet');
      expect(isCategory('c-pet')).toBe(true);
      expect(isCategory('ruim')).toBe(false);
      expect(categoryOrder('c-pet')).toBeLessThan(categoryOrder('outros'));
    } finally {
      setCustomCategories([]);
    }
  });

  it('backup com produto de categoria criada é aceito', () => {
    const file = buildBackup({ settings: { customCategories: [{ id: 'c-pet', label: 'Pet', color: '#123456' }] }, ingredients: { racao: { id: 'racao', name: 'Ração', category: 'c-pet', baseUnit: 'un' } } });
    expect(validateBackup(file).ok).toBe(true);
    const bad = buildBackup({ ingredients: { racao: { id: 'racao', name: 'Ração', category: 'c-pet', baseUnit: 'un' } } });
    expect(validateBackup(bad).ok).toBe(false);
  });
});
