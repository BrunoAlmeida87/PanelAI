import { describe, expect, it } from 'vitest';
import { convert, factorToBase, formatQty, parseQty, roundForPurchase, toBase, compatibleUnits } from '../../src/models/units.js';
import { SEED_INGREDIENTS } from '../../src/data/ingredients.js';

const ing = Object.fromEntries(SEED_INGREDIENTS.map((i) => [i.id, i]));

describe('conversão de unidades', () => {
  it('converte unidades da mesma dimensão', () => {
    expect(convert(1.2, 'kg', 'g')).toBe(1200);
    expect(convert(1500, 'ml', 'l')).toBe(1.5);
    expect(convert(2, 'colher_sopa', 'ml')).toBe(30);
  });

  it('usa conversões específicas do ingrediente', () => {
    expect(factorToBase('dente', ing.alho)).toBe(5);
    expect(toBase(3, 'dente', ing.alho)).toEqual({ qty: 15, unit: 'g', compatible: true });
    expect(convert(1, 'caixa', 'g', ing['creme-de-leite'])).toBe(200);
  });

  it('converte volume em massa somente com densidade conhecida', () => {
    expect(convert(1, 'colher_cha', 'g', ing.sal)).toBeCloseTo(6);
    // Peito de frango não tem densidade: não converte ml → g
    expect(convert(100, 'ml', 'g', ing['peito-frango'])).toBeNull();
  });

  it('converte unidades contáveis com peso unitário', () => {
    expect(convert(300, 'g', 'un', ing.cebola)).toBe(2);
    expect(convert(2, 'un', 'g', ing.batata)).toBe(300);
  });

  it('não converte unidades incompatíveis sem dados confiáveis', () => {
    const r = toBase(2, 'un', ing['peito-frango']);
    expect(r.compatible).toBe(false);
    expect(r.unit).toBe('un');
    expect(convert(1, 'maco', 'g', ing.couve)).toBeNull();
  });

  it('trata "a gosto" sem quantidade', () => {
    expect(toBase(null, 'a_gosto', ing.sal)).toEqual({ qty: null, unit: 'a_gosto', compatible: true });
  });

  it('lista unidades compatíveis para o ingrediente', () => {
    const u = compatibleUnits(ing.alho);
    expect(u).toContain('g');
    expect(u).toContain('kg');
    expect(u).toContain('dente');
    expect(u).not.toContain('un');
  });
});

describe('formatação e arredondamento', () => {
  it('formata quantidades em pt-BR com a melhor unidade', () => {
    expect(formatQty(1200, 'g')).toBe('1,2 kg');
    expect(formatQty(700, 'g')).toBe('700 g');
    expect(formatQty(1500, 'ml')).toBe('1,5 L');
    expect(formatQty(2.5, 'un')).toBe('2,5 un');
    expect(formatQty(null, 'a_gosto')).toBe('a gosto');
  });

  it('arredonda compras para quantidades práticas', () => {
    expect(roundForPurchase(1.2, 'un')).toBe(2);
    expect(roundForPurchase(2, 'un')).toBe(2);
    expect(roundForPurchase(333, 'g')).toBe(340);
    expect(roundForPurchase(1210, 'g')).toBe(1250);
    expect(roundForPurchase(0, 'g')).toBe(0);
    expect(roundForPurchase(-5, 'g')).toBe(0);
  });

  it('interpreta números digitados', () => {
    expect(parseQty('1,5')).toBe(1.5);
    expect(parseQty('1.5')).toBe(1.5);
    expect(parseQty('1.250,5')).toBe(1250.5);
    expect(parseQty('1/2')).toBe(0.5);
    expect(parseQty('abc')).toBeNull();
    expect(parseQty('')).toBeNull();
  });
});
