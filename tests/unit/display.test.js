import { describe, expect, it } from 'vitest';
import {
  CARD_TYPES,
  DEFAULT_TYPOGRAPHY,
  LAYOUT_PRESETS,
  inkThreshold,
  normalizeTypography,
  typographyCheck,
  typographyVars,
  changeCardType,
  clampCard,
  hasRoomFor,
  findFreeSpot,
  newLayout,
  overlappingIds,
  placeNewCard,
  presetCards,
  rescaleCards,
  screenSize,
} from '../../src/display/model.js';
import { buildDisplayData, checkedStillVisible, doneStillVisible, shoppingCheckedFor } from '../../src/display/data.js';
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

  it('compras do dia: lista manual mostra só o que foi escrito para hoje', () => {
    const now = new Date('2026-11-16T09:00:00');
    const base = buildSeed(now);
    const week = base.weeks['2026-11-16'];
    const extras = [
      { id: 'a1', name: 'Pão', qty: null, unit: 'un', checked: false, marketDate: '2026-11-16' },
      { id: 'a2', name: 'Detergente', qty: 1, unit: 'un', checked: false, marketDate: '2026-11-17' },
    ];
    const s = {
      ...base,
      settings: { ...base.settings, shoppingFromMenu: false },
      weeks: { ...base.weeks, '2026-11-16': { ...week, shopping: { ...week.shopping, extras } } },
    };
    const d = buildDisplayData(s, now);
    expect(d.shoppingFromMenu).toBe(false);
    expect(d.shopping().map((i) => i.name)).toEqual(['Pão', 'Detergente']);
    expect(d.shopping(d.dayOf('today'), true).map((i) => i.name)).toEqual(['Pão']);
    expect(d.shopping(d.dayOf('tomorrow'), true).map((i) => i.name)).toEqual(['Detergente']);
  });

  it('card de clima: começa sem cidade e tem opções de horas e dias', () => {
    const t = CARD_TYPES.find((c) => c.id === 'weather');
    expect(t).toBeTruthy();
    const keys = t.options.map((o) => o.key);
    expect(keys).toEqual(expect.arrayContaining(['place', 'hours', 'hourStep', 'days', 'showRain']));
    expect(t.options.find((o) => o.key === 'place').default).toBeNull();
  });

  it('"Atualizado às" usa a hora real da geração, não o horário agendado', () => {
    const seed = buildSeed(new Date('2026-11-16T09:00:00'));
    const agendado = new Date('2026-11-17T00:00:00');
    const real = new Date('2026-11-16T23:17:00');
    const d = buildDisplayData(seed, agendado, real);
    expect(d.today).toBe('2026-11-17'); // a imagem já mostra o dia novo
    expect(d.updatedAt).toBe(real);
    expect(buildDisplayData(seed, real).updatedAt).toBe(real); // sem horário agendado: o mesmo instante
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

describe('display: tarefas feitas somem depois de um tempo', () => {
  const now = new Date('2026-11-26T17:51:00');
  const done = (doneAt, date = '2026-11-26') => ({ id: doneAt, title: 'x', date, status: 'done', doneAt });

  it('fica na tela até o tempo escolhido depois de ticada', () => {
    expect(doneStillVisible(done('2026-11-25T18:00:00'), now, '24')).toBe(true);
    expect(doneStillVisible(done('2026-11-25T17:00:00'), now, '24')).toBe(false);
    expect(doneStillVisible(done('2026-11-26T10:00:00'), now, '6')).toBe(false);
    expect(doneStillVisible(done('2026-11-24T18:00:00'), now, '48')).toBe(true);
  });

  it('"só no dia", tarefa aberta e tarefa antiga sem doneAt continuam como antes', () => {
    expect(doneStillVisible(done('2026-11-20T10:00:00'), now, 'day')).toBe(true);
    expect(doneStillVisible({ status: 'todo' }, now, '6')).toBe(true);
    expect(doneStillVisible({ status: 'done', date: '2026-11-26' }, now, '24')).toBe(true);
  });

  it('atrasada de ontem ticada hoje aparece entre as feitas recentes', () => {
    const s = buildSeed(now);
    s.taskTemplates = {};
    s.tasks = {
      lixo: { id: 'lixo', title: 'Tirar o lixo', date: '2026-11-25', status: 'done', doneAt: '2026-11-26T08:00:00', createdAt: '2026-11-20T10:00:00Z' },
      velha: { id: 'velha', title: 'Lavar louça', date: '2026-11-25', status: 'done', doneAt: '2026-11-25T10:00:00', createdAt: '2026-11-20T10:00:00Z' },
    };
    const d = buildDisplayData(s, now);
    expect(d.recentlyDone('24').map((t) => t.id)).toEqual(['lixo']);
    expect(d.recentlyDone('day')).toEqual([]);
    expect(d.overdue()).toEqual([]);
  });
});

describe('display: letras (fontes, peso, tamanho)', () => {
  it('layout antigo sem letras usa o padrão (visual de antes)', () => {
    expect(normalizeTypography(undefined)).toEqual(DEFAULT_TYPOGRAPHY);
    const v = typographyVars(undefined);
    expect(v['--title-weight']).toBe('800');
    expect(v['--label-weight']).toBe('900');
    expect(v['--strong-weight']).toBe('600');
    expect(v['--title-case']).toBe('uppercase');
    expect(inkThreshold(normalizeTypography(undefined).ink)).toBe(150);
  });

  it('valores inválidos voltam ao padrão e o peso respeita o que a fonte tem', () => {
    const t = normalizeTypography({ title: { font: 'comic', weight: 950, size: 7 }, text: { font: 'atkinson', weight: 900 }, ink: 'x' });
    expect(t.title).toMatchObject({ font: 'inter', weight: 800, size: 1 });
    expect(t.ink).toBe('normal');
    // Atkinson vai só até 800.
    expect(typographyVars(t)['--text-weight']).toBe('800');
    expect(typographyVars({ text: { font: 'lexend', weight: 300 } })['--text-font']).toContain('Lexend');
  });

  it('avisa quando negrito fica pequeno demais para a tela de 1 bit', () => {
    const layout = newLayout({ modelId: '7in5', presetId: 'cozinha' });
    const ok = typographyCheck(layout);
    expect(ok.base).toBe(16);
    expect(ok.warnings).toEqual([]);
    const small = { ...layout, cards: layout.cards.map((c) => ({ ...c, fontScale: 0.75 })), typography: { title: { weight: 900, size: 0.85 }, text: { weight: 700 } } };
    const r = typographyCheck(small);
    expect(r.titlePx).toBeLessThan(9);
    expect(r.warnings.some((w) => w.startsWith('Títulos com'))).toBe(true);
    expect(r.warnings.some((w) => w.startsWith('O texto em negrito'))).toBe(true);
  });
});

describe('display: trocar e adicionar cards', () => {
  it('trocar o tipo mantém lugar, tamanho e aparência', () => {
    const l = newLayout({ presetId: 'cozinha' });
    const tasks = l.cards.find((c) => c.type === 'tasksDay');
    const m = changeCardType({ ...tasks, fontScale: 1.3, border: 'thick', title: 'X' }, 'montessori');
    expect(m).toMatchObject({ id: tasks.id, type: 'montessori', x: tasks.x, y: tasks.y, w: tasks.w, h: tasks.h, fontScale: 1.3, border: 'thick', title: '' });
    expect(m.options).toEqual({ showChild: true, showCategory: false, showDone: true });
  });

  it('sabe quando a tela está cheia', () => {
    const l = newLayout({ presetId: 'cozinha' });
    expect(hasRoomFor(l.cards, l.grid, 'montessori')).toBe(false);
    expect(hasRoomFor(l.cards.filter((c) => c.type !== 'pending'), l.grid, 'montessori')).toBe(true);
  });
});

describe('display: compras marcadas como comprado', () => {
  const now = new Date('2026-11-27T17:00:00');
  const item = (checkedAt, checked = true) => ({ name: 'Leite', checked, checkedAt });

  it('aparece com ✓ até o tempo escolhido depois de marcar', () => {
    expect(checkedStillVisible(item('2026-11-27T09:00:00'), now, '24')).toBe(true);
    expect(checkedStillVisible(item('2026-11-26T16:00:00'), now, '24')).toBe(false);
    expect(checkedStillVisible(item('2026-11-27T09:00:00'), now, '6')).toBe(false);
    expect(checkedStillVisible(item('2026-11-20T09:00:00'), now, 'always')).toBe(true);
    expect(checkedStillVisible(item('2026-11-27T16:59:00'), now, 'never')).toBe(false);
    expect(checkedStillVisible(item(null, false), now, 'never')).toBe(true);
    // Marcado antes de existir a hora da compra: continua aparecendo.
    expect(checkedStillVisible(item(null), now, '6')).toBe(true);
  });

  it('cards antigos: "Mostrar já comprados" ligado = sempre; desligado = 24 h', () => {
    expect(shoppingCheckedFor({ showChecked: true })).toBe('always');
    expect(shoppingCheckedFor({ showChecked: false })).toBe('24');
    expect(shoppingCheckedFor({ showChecked: false, checkedFor: 'never' })).toBe('never');
  });

  it('a lista de compras leva a hora da compra até a tela', () => {
    const s = buildSeed(now);
    const wid = Object.keys(s.weeks)[0];
    const week = s.weeks[wid];
    week.shopping = { ...(week.shopping ?? {}), checked: {}, checkedAt: {}, extras: [{ id: 'x', name: 'Pão E2E', checked: true, checkedAt: '2026-11-27T10:00:00', marketDate: wid }] };
    const d = buildDisplayData(s, now);
    const pao = d.shopping(wid).find((i) => i.name === 'Pão E2E');
    expect(pao).toMatchObject({ checked: true, checkedAt: '2026-11-27T10:00:00' });
    expect(d.boughtVisible(pao, '24')).toBe(true);
    expect(d.boughtVisible(pao, '6')).toBe(false);
  });
});
