import { describe, expect, it } from 'vitest';
import { cleanMealTags, hiddenItem, knownMealTags, mealTagFields, mealTextKey, mergeMealTexts, rememberedItem, sanitizeMealTexts, suggestMealTexts, textsFromWeeks } from '../../src/services/mealTexts.js';
import { balanceStats } from '../../src/services/indicators.js';
import { mergeMarks, markFields } from '../../src/cloud/layout.js';
import { buildBackup, validateBackup } from '../../src/services/backup.js';

const week = (id, meals) => ({ id, meals });
const text = (t) => ({ id: t, kind: 'text', text: t });

describe('comidas escritas à mão: histórico', () => {
  it('mesma comida com ou sem acento/maiúscula é uma só', () => {
    expect(mealTextKey('  Macarrão  ao  sugo ')).toBe('macarrao ao sugo');
    expect(mealTextKey('MACARRAO ao sugo')).toBe('macarrao ao sugo');
  });

  it('registrar uso conta as vezes, guarda o último jeito escrito e tira da lixeira', () => {
    const a = rememberedItem(undefined, 'macarrão', '2026-11-20');
    expect(a).toEqual({ text: 'macarrão', n: 1, last: '2026-11-20' });
    const b = rememberedItem(hiddenItem(a, 'macarrão'), 'Macarrão', '2026-11-26');
    expect(b).toEqual({ text: 'Macarrão', n: 2, last: '2026-11-26' });
    expect(rememberedItem(undefined, '   ', '2026-11-26')).toBeNull();
  });

  it('junta o histórico guardado com o que está nas semanas abertas', () => {
    const weeks = {
      '2026-11-23': week('2026-11-23', {
        '2026-11-23': { jantar: [text('Macarrão'), { id: 'r', kind: 'recipe', recipeId: 'x' }] },
        '2026-11-24': { jantar: [text('macarrao')], lanche_manha: [text('Fruta')] },
      }),
    };
    expect(textsFromWeeks(weeks).get('macarrao')).toEqual({ text: 'macarrao', n: 2, last: '2026-11-24' });
    const stored = { 'pao de queijo': { text: 'Pão de queijo', n: 5, last: '2026-07-01' } };
    expect(suggestMealTexts({ stored, weeks }).map((x) => x.text)).toEqual(['Pão de queijo', 'macarrao', 'Fruta']);
  });

  it('enquanto digita: parecidas primeiro as que começam igual, sem repetir o próprio texto', () => {
    const stored = {
      macarrao: { text: 'Macarrão', n: 1, last: '2026-11-01' },
      'macarrao ao sugo': { text: 'Macarrão ao sugo', n: 1, last: '2026-11-02' },
      'salada de macarrao': { text: 'Salada de macarrão', n: 9, last: '2026-11-03' },
      arroz: { text: 'Arroz', n: 3, last: '2026-11-03' },
    };
    expect(suggestMealTexts({ stored, query: 'macar' }).map((x) => x.text)).toEqual(['Macarrão ao sugo', 'Macarrão', 'Salada de macarrão']);
    expect(suggestMealTexts({ stored, query: 'macarrão' }).map((x) => x.text)).toEqual(['Macarrão ao sugo', 'Salada de macarrão']);
  });

  it('lixeira tira das sugestões mesmo se a comida ainda está numa semana', () => {
    const weeks = { w: week('2026-11-23', { '2026-11-30': { jantar: [text('Macarão')] } }) };
    const stored = { macarao: hiddenItem({ text: 'Macarão', n: 1, last: '2026-11-26' }) };
    expect(suggestMealTexts({ stored, weeks })).toEqual([]);
  });

  it('nuvem: cada comida é mesclada separadamente entre aparelhos', () => {
    expect(markFields('meta', 'mealTexts')).toEqual([{ id: 'mt', path: ['value'] }]);
    const base = { key: 'mealTexts', value: { arroz: { text: 'Arroz', n: 1, last: '2026-11-01' } } };
    const marks = new Map([
      ['celular-a', { mt: { macarrao: { a: 10, v: { text: 'Macarrão', n: 1, last: '2026-11-26' } } } }],
      ['celular-b', { mt: { arroz: { a: 11, x: 1 } } }],
    ]);
    expect(mergeMarks('meta', 'mealTexts', base, marks).value).toEqual({ macarrao: { text: 'Macarrão', n: 1, last: '2026-11-26' } });
  });

  it('backup: exporta, valida e junta com o histórico atual', () => {
    const bad = sanitizeMealTexts({ a: { text: '  Sopa  ', n: '2', last: '2026-11-01' }, b: { text: '' }, c: 3 });
    expect(bad).toEqual({ sopa: { text: 'Sopa', n: 2, last: '2026-11-01' } });
    const merged = mergeMealTexts({ sopa: { text: 'Sopa', n: 1, last: '2026-10-01' } }, { sopa: { text: 'Sopa', n: 2, last: '2026-11-01' }, pao: { text: 'Pão', n: 1, last: '' } });
    expect(merged.sopa.n).toBe(2);
    expect(Object.keys(merged)).toEqual(['sopa', 'pao']);
    const file = buildBackup({ mealTexts: { sopa: { text: 'Sopa', n: 1, last: '2026-11-01' } } });
    expect(file.data.mealTexts.sopa.text).toBe('Sopa');
  });

  it('backup antigo sem histórico não apaga o atual (fica undefined)', () => {
    const file = buildBackup({});
    delete file.data.mealTexts;
    const r = validateBackup(file);
    expect(r.ok).toBe(true);
    expect(r.data.mealTexts).toBeUndefined();
  });
});

describe('comidas escritas: categorias opcionais (equilíbrio da semana)', () => {
  it('limpa as categorias e marca Proteína junto com o tipo', () => {
    expect(cleanMealTags({ composition: ['massa', 'xx', 'massa'], protein: 'frango' })).toEqual({ composition: ['proteina', 'massa'], protein: 'frango' });
    expect(cleanMealTags(null)).toEqual({ composition: [], protein: null });
    expect(mealTagFields({ composition: [] })).toEqual({});
  });

  it('histórico guarda as categorias; sem categorias informadas, mantém as de antes', () => {
    const a = rememberedItem(undefined, 'Macarrão', '2026-11-20', { composition: ['massa'] });
    expect(a.composition).toEqual(['massa']);
    expect(rememberedItem(a, 'Macarrão', '2026-11-26').composition).toEqual(['massa']);
    // Escolher "nenhuma" de propósito limpa.
    expect(rememberedItem(a, 'Macarrão', '2026-11-26', { composition: [], protein: null }).composition).toBeUndefined();
    // Só mudar a categoria não conta como mais um uso.
    expect(rememberedItem(a, 'Macarrão', '2026-11-26', { composition: ['massa', 'vegetal'] }, { count: false }).n).toBe(1);
  });

  it('ao escrever a mesma comida, as categorias já vêm (histórico ou semana)', () => {
    const stored = { macarrao: { text: 'Macarrão', n: 2, last: '2026-11-20', composition: ['massa'] } };
    expect(knownMealTags({ stored, text: 'MACARRÃO' })).toEqual({ composition: ['massa'], protein: null });
    const weeks = { w: { id: 'w', meals: { '2026-11-24': { jantar: [{ id: 'e', kind: 'text', text: 'Feijoada', composition: ['leguminosa'], protein: 'suina' }] } } } };
    expect(knownMealTags({ weeks, text: 'feijoada' })).toEqual({ composition: ['proteina', 'leguminosa'], protein: 'suina' });
    expect(suggestMealTexts({ weeks })[0]).toMatchObject({ text: 'Feijoada', protein: 'suina' });
    expect(knownMealTags({ stored, text: 'arroz' })).toBeNull();
  });

  it('equilíbrio da semana conta a comida escrita que tem categoria', () => {
    const week = {
      meals: {
        '2026-11-23': {
          almoco: [{ id: 'a', kind: 'text', text: 'Macarrão', composition: ['massa'] }],
          jantar: [{ id: 'b', kind: 'text', text: 'Omelete', composition: ['proteina'], protein: 'ovos' }, { id: 'c', kind: 'text', text: 'Sem categoria' }],
        },
      },
    };
    const b = balanceStats({ week, recipesById: {} });
    expect(b.meals).toBe(2);
    expect(b.composition.massa).toBe(1);
    expect(b.proteins.ovos).toBe(1);
  });
});

describe('categorias: Frutas e Legumes e verduras', () => {
  it('fruta é uma categoria e conta no equilíbrio', () => {
    expect(cleanMealTags({ composition: ['fruta', 'vegetal'] })).toEqual({ composition: ['vegetal', 'fruta'], protein: null });
    const week = { meals: { '2026-11-23': { lanche_manha: [{ id: 'f', kind: 'text', text: 'Kiwi', composition: ['fruta'] }] } } };
    expect(balanceStats({ week, recipesById: {} }).composition.fruta).toBe(1);
  });
});
