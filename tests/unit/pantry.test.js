import { describe, expect, it } from 'vitest';
import { pantryBoard, parseQuickProduct } from '../../src/services/pantry.js';

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
