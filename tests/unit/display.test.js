import { describe, expect, it } from 'vitest';
import {
  CARD_TYPES,
  LAYOUT_PRESETS,
  clampCard,
  findFreeSpot,
  newLayout,
  overlappingIds,
  placeNewCard,
  presetCards,
  rescaleCards,
  screenSize,
} from '../../src/display/model.js';
import { buildDisplayData } from '../../src/display/data.js';
import { buildSeed } from '../../src/data/seed.js';

const grid = { cols: 12, rows: 8, gap: 8, padding: 12 };

describe('display: grade', () => {
  it('mantém o card dentro da grade', () => {
    expect(clampCard({ x: 10, y: 7, w: 5, h: 3 }, grid)).toMatchObject({ x: 7, y: 5, w: 5, h: 3 });
    expect(clampCard({ x: -2, y: -1, w: 0, h: 99 }, grid)).toMatchObject({ x: 0, y: 0, w: 1, h: 8 });
  });

  it('acha espaço livre e detecta sobreposição', () => {
    const cards = [
      { id: 'a', x: 0, y: 0, w: 12, h: 1 },
      { id: 'b', x: 0, y: 1, w: 6, h: 7 },
    ];
    expect(findFreeSpot(cards, grid, 6, 4)).toEqual({ x: 6, y: 1, w: 6, h: 4 });
    expect(findFreeSpot(cards, grid, 7, 1)).toBeNull();
    expect([...overlappingIds([...cards, { id: 'c', x: 5, y: 2, w: 2, h: 2 }])].sort()).toEqual(['b', 'c']);
    const placed = placeNewCard(cards, grid, 'shopping');
    expect(placed).toMatchObject({ x: 6, y: 1, w: 6, h: 3 });
  });

  it('converte entre grades mantendo proporção', () => {
    const out = rescaleCards([{ id: 'a', x: 6, y: 4, w: 6, h: 4 }], { cols: 12, rows: 8 }, { cols: 24, rows: 16 });
    expect(out[0]).toMatchObject({ x: 12, y: 8, w: 12, h: 8 });
  });

  it('layouts sugeridos cabem na grade, sem sobreposição', () => {
    for (const p of LAYOUT_PRESETS) {
      const g = p.orientation === 'portrait' ? { cols: 8, rows: 12 } : grid;
      const cards = presetCards(p, g);
      expect(overlappingIds(cards).size, p.id).toBe(0);
      for (const c of cards) {
        expect(c.x + c.w).toBeLessThanOrEqual(g.cols);
        expect(c.y + c.h).toBeLessThanOrEqual(g.rows);
      }
    }
  });

  it('novo layout: modelo, orientação e tamanho da tela', () => {
    const l = newLayout({ modelId: '7in5', presetId: 'geladeira' }, { name: 'Bruno' });
    expect(l.orientation).toBe('portrait');
    expect(screenSize(l)).toEqual({ w: 480, h: 800 });
    expect(l.createdBy).toBe('Bruno');
  });
});

describe('display: dados dos cards', () => {
  it('monta os dados de todos os tipos de card a partir do estado', () => {
    const seed = buildSeed(new Date('2026-11-16T09:00:00'));
    const d = buildDisplayData(seed, new Date('2026-11-16T09:00:00'));
    expect(d.today).toBe('2026-11-16');
    expect(d.meals('2026-11-16').find((m) => m.slot === 'almoco').entries.length).toBeGreaterThan(0);
    expect(d.shopping().length).toBeGreaterThan(0);
    expect(Array.isArray(d.pantryLow())).toBe(true);
    expect(d.marmitas().length).toBe(1);
    expect(d.summary()).toMatchObject({ plannedTotal: 14 });
    expect(d.tasksOn('2026-11-17').map((t) => t.title)).toContain('Levar roupas na lavanderia');
    expect(CARD_TYPES.length).toBeGreaterThanOrEqual(10);
  });

  it('mostra as tarefas fixas do dia mesmo sem ninguém ter aberto o app (sem duplicar)', () => {
    const now = new Date('2026-11-16T09:00:00');
    const base = buildSeed(now);
    const tpl = { id: 'tpl_lixo', title: 'Tirar o lixo', category: 'casa', assignee: '', notes: '', repeat: { kind: 'weekly', weekdays: [1, 3] }, startDate: '2026-11-01' };
    const s = { ...base, tasks: {}, taskTemplates: { [tpl.id]: tpl } };
    const d = buildDisplayData(s, now);
    expect(d.tasksOn('2026-11-16').map((t) => t.title)).toEqual(['Tirar o lixo']);
    expect(d.tasksOn('2026-11-18').map((t) => t.title)).toEqual(['Tirar o lixo']);
    expect(d.tasksOn('2026-11-17')).toEqual([]);
    // Já criada no app (feita): aparece uma vez só, com o estado salvo.
    const saved = { ...d.tasksOn('2026-11-16')[0], status: 'done' };
    const d2 = buildDisplayData({ ...s, tasks: { [saved.id]: saved } }, now);
    expect(d2.tasksOn('2026-11-16').map((t) => t.status)).toEqual(['done']);
    // Nada foi gravado no estado.
    expect(s.tasks).toEqual({});
  });
});

describe('display: Montessori de hoje', () => {
  it('mostra as atividades do dia da criança, com as feitas marcadas, sem gravar nada', () => {
    const now = new Date('2026-11-24T06:00:00');
    const child = { id: 'crianca_ana', name: 'Ana', birthDate: '2025-07-10', gestationWeeks: null, plan: null };
    const s = { ...buildSeed(now), children: { [child.id]: child }, montessoriLogs: {} };
    const [kid] = buildDisplayData(s, now).montessori();
    expect(kid.child.name).toBe('Ana');
    expect(kid.band.id).toBe('12-18');
    expect(kid.items).toHaveLength(3);
    expect(kid.items.every((i) => !i.done)).toBe(true);

    // Registrada hoje: aparece marcada; a lista do dia não muda.
    const first = kid.items[0].activity.id;
    const log = { id: 'mreg_1', childId: child.id, activityId: first, date: '2026-11-24', interest: 'alto', autonomy: 'ajuda', notes: '' };
    const [after] = buildDisplayData({ ...s, montessoriLogs: { [log.id]: log } }, now).montessori();
    expect(after.items.map((i) => i.activity.id)).toEqual(kid.items.map((i) => i.activity.id));
    expect(after.items[0].done).toBe(true);

    // Lista escolhida à mão para o dia vale também na tela.
    const planned = { ...child, plan: { date: '2026-11-24', ids: ['regar-as-plantas'] } };
    const [p] = buildDisplayData({ ...s, children: { [child.id]: planned } }, now).montessori();
    expect(p.items.map((i) => i.activity.id)).toEqual(['regar-as-plantas']);
    expect(s.children[child.id].plan).toBeNull();
  });

  it('sem criança cadastrada, o card fica vazio', () => {
    const now = new Date('2026-11-24T06:00:00');
    expect(buildDisplayData(buildSeed(now), now).montessori()).toEqual([]);
  });
});
