import { describe, expect, it } from 'vitest';
import library from '../../src/data/montessori_activities.json';
import {
  AGE_BANDS,
  DAILY_COUNT,
  MAX_PER_DAY,
  MONTESSORI_CATEGORIES,
  activityStats,
  activityStatus,
  addToPlan,
  agePartsBetween,
  bandOf,
  childAge,
  dayPlan,
  doneOn,
  editLog,
  formatAge,
  formatAgeShort,
  formatMinAge,
  groupLogsByDate,
  isForAge,
  loadLibrary,
  matchesStatus,
  newChild,
  newLog,
  regeneratePlan,
  removeFromPlan,
  suggestActivities,
  swapInPlan,
  validateActivity,
  validateChildInput,
  validateLogInput,
} from '../../src/models/montessori.js';
import { addDays } from '../../src/utils/dates.js';

const lib = loadLibrary(library);
const { activities, byId } = lib;
const actor = { name: 'Bruno' };
const child = (birthDate, extra = {}) => ({ ...newChild({ name: 'Ana', birthDate }, actor), id: 'crianca_teste', ...extra });
const log = (activityId, date, extra = {}) => ({ ...newLog({ childId: 'crianca_teste', activityId, date, interest: 'medio', autonomy: 'ajuda' }, actor), ...extra });

describe('montessori: biblioteca', () => {
  it('o JSON da biblioteca é válido e cobre todas as faixas e categorias', () => {
    expect(lib.problems).toEqual([]);
    expect(activities.length).toBeGreaterThanOrEqual(60);
    for (const band of AGE_BANDS) expect(activities.some((a) => a.faixa === band.id)).toBe(true);
    for (const cat of MONTESSORI_CATEGORIES) expect(activities.some((a) => a.categoria === cat.id)).toBe(true);
  });

  it('toda atividade tem os campos pedidos e referências conhecidas', () => {
    for (const a of activities) {
      expect(a.habilidades.length, a.id).toBeGreaterThan(0);
      expect(a.materiais.length, a.id).toBeGreaterThan(0);
      expect(a.passos.length, a.id).toBeGreaterThanOrEqual(3);
      for (const r of a.referencias) expect(lib.references[r], `${a.id}: ${r}`).toBeTruthy();
    }
  });

  it('nenhuma atividade é atribuída ao livro sem a página', () => {
    for (const a of activities.filter((x) => x.origem === 'livro')) expect(a.pagina, a.id).toBeTruthy();
  });

  it('há atividades da rotina da casa em todas as faixas', () => {
    for (const band of AGE_BANDS) {
      const eligible = activities.filter((a) => isForAge(a, band.min));
      expect(eligible.some((a) => a.rotinaDaCasa), band.id).toBe(true);
    }
  });

  it('valida atividades novas e ignora só as inválidas', () => {
    expect(validateActivity({ id: 'Ruim', nome: '', categoria: 'x', idadeMinimaMeses: 40, descricao: '', passos: [], origem: 'outro' }).length).toBeGreaterThan(4);
    const out = loadLibrary({
      atividades: [
        { id: 'a', nome: 'A', categoria: 'tatil', idadeMinimaMeses: 3, descricao: 'x', passos: ['p'], origem: 'complementar' },
        { id: 'a', nome: 'A de novo', categoria: 'tatil', idadeMinimaMeses: 3, descricao: 'x', passos: ['p'], origem: 'complementar' },
        { id: 'b', nome: 'B', categoria: 'nada', idadeMinimaMeses: 3, descricao: 'x', passos: ['p'], origem: 'complementar' },
      ],
    });
    expect(out.activities.map((a) => a.id)).toEqual(['a']);
    expect(out.activities[0].faixa).toBe('3-6');
    expect(out.problems).toHaveLength(2);
  });
});

describe('montessori: idade', () => {
  it('calcula meses completos e dias, inclusive no fim do mês', () => {
    expect(agePartsBetween('2025-07-10', '2026-11-24')).toMatchObject({ months: 16, days: 14 });
    // Nasceu em 31/01: completa 1 mês no último dia de fevereiro.
    expect(agePartsBetween('2026-01-31', '2026-02-27')).toMatchObject({ months: 0, days: 27 });
    expect(agePartsBetween('2026-01-31', '2026-02-28')).toMatchObject({ months: 1, days: 0 });
    expect(agePartsBetween('2026-01-31', '2026-03-01')).toMatchObject({ months: 1, days: 1 });
    expect(agePartsBetween('2026-11-24', '2026-11-24')).toMatchObject({ months: 0, days: 0 });
    expect(agePartsBetween('2026-11-25', '2026-11-24').months).toBe(-1);
  });

  it('mostra a idade em anos e meses', () => {
    expect(formatAge({ months: 16, days: 14 })).toBe('1 ano e 4 meses');
    expect(formatAge({ months: 24, days: 2 })).toBe('2 anos');
    expect(formatAge({ months: 1, days: 3 })).toBe('1 mês e 3 dias');
    expect(formatAge({ months: 5, days: 3 })).toBe('5 meses');
    expect(formatAge({ months: 0, days: 12 })).toBe('12 dias');
    expect(formatAge({ months: 0, days: 0 })).toBe('recém-nascido');
    expect(formatAgeShort({ months: 16, days: 0 })).toBe('1a 4m');
    expect(formatMinAge(18)).toBe('a partir de 1 ano e meio');
    expect(formatMinAge(0)).toBe('desde o nascimento');
  });

  it('usa a idade corrigida para prematuros até os 2 anos', () => {
    const premature = child('2026-06-01', { gestationWeeks: 32 });
    const a = childAge(premature, '2026-11-24');
    expect(a.corrected).toBe(true);
    expect(a.real.months).toBe(5);
    expect(a.months).toBe(3); // 8 semanas a menos
    expect(childAge(premature, '2028-07-01').corrected).toBe(false);
    expect(childAge(child('2026-06-01', { gestationWeeks: 39 }), '2026-11-24').corrected).toBe(false);
  });

  it('acha a faixa de cada idade', () => {
    expect(bandOf(0).id).toBe('0-3');
    expect(bandOf(2).id).toBe('0-3');
    expect(bandOf(3).id).toBe('3-6');
    expect(bandOf(17).id).toBe('12-18');
    expect(bandOf(35).id).toBe('24-36');
    expect(bandOf(40).id).toBe('24-36');
  });

  it('valida o cadastro da criança', () => {
    const today = '2026-11-24';
    expect(validateChildInput({ name: 'Ana', birthDate: '2025-07-10' }, today)).toEqual({});
    expect(Object.keys(validateChildInput({ name: ' ', birthDate: '2026-12-01' }, today)).sort()).toEqual(['birthDate', 'name']);
    expect(validateChildInput({ name: 'Ana', birthDate: '2025-07-10', gestationWeeks: '15' }, today).gestationWeeks).toBeTruthy();
    expect(validateChildInput({ name: 'Ana', birthDate: '2025-07-10', gestationWeeks: '' }, today)).toEqual({});
  });
});

describe('montessori: registros', () => {
  it('valida e edita registros', () => {
    expect(validateLogInput({ date: '2026-11-24', interest: 'alto', autonomy: 'sozinha' }, '2026-11-24')).toEqual({});
    expect(Object.keys(validateLogInput({ date: '2026-11-25', interest: 'x', autonomy: '' }, '2026-11-24')).sort()).toEqual(['autonomy', 'date', 'interest']);
    const l = log('guardar-brinquedos', '2026-11-20');
    const e = editLog(l, { interest: 'alto', notes: '  adorou  ' }, { name: 'Maria' });
    expect(e).toMatchObject({ interest: 'alto', notes: 'adorou', updatedBy: 'Maria', id: l.id, date: '2026-11-20' });
  });

  it('conta as vezes, a última data e o último interesse', () => {
    const logs = [
      log('a', '2026-11-01', { interest: 'baixo' }),
      log('a', '2026-11-10', { interest: 'alto' }),
      log('b', '2026-11-24'),
      { ...log('a', '2026-11-12'), childId: 'outra' },
    ];
    const st = activityStats(logs, 'crianca_teste');
    expect(st.get('a')).toMatchObject({ count: 2, last: '2026-11-10', first: '2026-11-01', lastInterest: 'alto' });
    expect(activityStats(logs, 'crianca_teste', { before: '2026-11-24' }).has('b')).toBe(false);
    expect(activityStatus(st, 'a')).toBe('preferida');
    expect(activityStatus(st, 'c')).toBe('nova');
    expect(matchesStatus(st, 'a', 'feita')).toBe(true);
    expect(matchesStatus(st, 'c', 'feita')).toBe(false);
    expect([...doneOn(logs, 'crianca_teste', '2026-11-24')]).toEqual(['b']);
    expect(groupLogsByDate([logs[2], logs[1], logs[0]]).map((g) => g.date)).toEqual(['2026-11-24', '2026-11-10', '2026-11-01']);
  });
});

describe('montessori: sugestões do dia', () => {
  const today = '2026-11-24';
  const toddler = child('2025-07-10'); // 1 ano e 4 meses

  it('sugere 3 atividades indicadas para a idade, de categorias diferentes, com uma da rotina da casa', () => {
    const ids = suggestActivities({ activities, child: toddler, logs: [], date: today });
    expect(ids).toHaveLength(DAILY_COUNT);
    const list = ids.map((id) => byId[id]);
    for (const a of list) expect(isForAge(a, 16), a.id).toBe(true);
    expect(new Set(list.map((a) => a.categoria)).size).toBe(3);
    expect(list.some((a) => a.rotinaDaCasa)).toBe(true);
  });

  it('ao longo de uma semana, todas as categorias aparecem (rodízio diário)', () => {
    const seen = new Set();
    for (let i = 0; i < 7; i++) {
      for (const id of suggestActivities({ activities, child: toddler, logs: [], date: addDays(today, i) })) seen.add(byId[id].categoria);
    }
    expect(seen.size).toBe(MONTESSORI_CATEGORIES.length);
  });

  it('é estável: mesmo dia e mesmos registros dão o mesmo resultado', () => {
    const a = suggestActivities({ activities, child: toddler, logs: [], date: today });
    const b = suggestActivities({ activities, child: toddler, logs: [], date: today });
    expect(a).toEqual(b);
  });

  it('registrar uma atividade hoje não muda as sugestões de hoje', () => {
    const before = suggestActivities({ activities, child: toddler, logs: [], date: today });
    const after = suggestActivities({ activities, child: toddler, logs: [log(before[0], today)], date: today });
    expect(after).toEqual(before);
  });

  it('prefere atividades ainda não apresentadas e as feitas há mais tempo', () => {
    const eligible = activities.filter((a) => isForAge(a, 16));
    // Todas feitas ontem, menos uma feita há 40 dias: ela tem de aparecer.
    const logs = eligible.map((a) => log(a.id, a.id === 'regar-as-plantas' ? addDays(today, -40) : addDays(today, -1)));
    const ids = suggestActivities({ activities, child: toddler, logs, date: today });
    expect(ids).toContain('regar-as-plantas');
    // Uma nunca feita entre muitas já feitas.
    const logs2 = eligible.filter((a) => a.id !== 'cesto-de-vocabulario').map((a) => log(a.id, addDays(today, -3)));
    expect(suggestActivities({ activities, child: toddler, logs: logs2, date: today })).toContain('cesto-de-vocabulario');
  });

  it('interesse baixo afasta a atividade por um tempo, sem excluir para sempre', () => {
    const only = [byId['guardar-brinquedos'], byId['servir-agua-da-jarrinha'], byId['regar-as-plantas'], byId['limpar-o-que-derramou']];
    const low = [log('guardar-brinquedos', addDays(today, -5), { interest: 'baixo' })];
    const others = ['servir-agua-da-jarrinha', 'regar-as-plantas', 'limpar-o-que-derramou'].map((id) => log(id, addDays(today, -5)));
    const ids = suggestActivities({ activities: only, child: toddler, logs: [...low, ...others], date: today, count: 3 });
    expect(ids).not.toContain('guardar-brinquedos');
    const later = suggestActivities({ activities: only, child: toddler, logs: [...low.map((l) => ({ ...l, date: addDays(today, -40) })), ...others], date: today, count: 1 });
    expect(later).toEqual(['guardar-brinquedos']);
  });

  it('não sugere atividades de idades acima nem as que já passaram da idade', () => {
    const baby = child('2026-10-20'); // 1 mês
    const ids = suggestActivities({ activities, child: baby, logs: [], date: today });
    for (const id of ids) expect(byId[id].idadeMinimaMeses).toBeLessThanOrEqual(1);
    const big = child('2023-12-01'); // ~3 anos
    for (const id of suggestActivities({ activities, child: big, logs: [], date: today })) expect(byId[id].idadeMaximaMeses ?? 99).toBeGreaterThan(35);
  });

  it('plano do dia: automático, escolhido, trocado e com atividade que saiu do catálogo', () => {
    const auto = dayPlan({ activities, byId, child: toddler, logs: [], date: today });
    expect(auto.custom).toBe(false);
    expect(auto.ids).toHaveLength(3);

    const fresh = regeneratePlan({ activities, child: toddler, logs: [], date: today, current: auto.ids });
    expect(fresh).toHaveLength(3);
    expect(fresh.filter((id) => auto.ids.includes(id))).toEqual([]);

    // As já feitas hoje ficam; só as outras são trocadas. Tudo feito → mais três.
    const keepOne = regeneratePlan({ activities, child: toddler, logs: [], date: today, current: auto.ids, keep: [auto.ids[0]] });
    expect(keepOne).toHaveLength(3);
    expect(keepOne[0]).toBe(auto.ids[0]);
    expect(keepOne.slice(1).filter((id) => auto.ids.includes(id))).toEqual([]);
    const more = regeneratePlan({ activities, child: toddler, logs: [], date: today, current: auto.ids, keep: auto.ids });
    expect(more).toHaveLength(6);
    expect(more.slice(0, 3)).toEqual(auto.ids);

    const swapped = swapInPlan({ activities, child: toddler, logs: [], date: today, current: auto.ids, id: auto.ids[1] });
    expect(swapped[0]).toBe(auto.ids[0]);
    expect(swapped[2]).toBe(auto.ids[2]);
    expect(auto.ids).not.toContain(swapped[1]);

    const withPlan = { ...toddler, plan: { date: today, ids: ['guardar-brinquedos', 'atividade-que-saiu', 'regar-as-plantas'] } };
    const p = dayPlan({ activities, byId, child: withPlan, logs: [], date: today });
    expect(p.custom).toBe(true);
    expect(p.ids.slice(0, 2)).toEqual(['guardar-brinquedos', 'regar-as-plantas']);
    expect(p.ids).toHaveLength(3);

    // Plano de outro dia não vale hoje.
    expect(dayPlan({ activities, byId, child: { ...withPlan, plan: { date: '2026-11-23', ids: ['x'] } }, logs: [], date: today }).custom).toBe(false);
  });

  it('incluir e tirar do dia', () => {
    expect(addToPlan(['a'], 'b')).toEqual(['a', 'b']);
    expect(addToPlan(['a'], 'a')).toEqual(['a']);
    const full = Array.from({ length: MAX_PER_DAY }, (_, i) => `x${i}`);
    expect(addToPlan(full, 'y')).toBe(full);
    expect(removeFromPlan(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('sem criança ou sem data de nascimento não sugere nada', () => {
    expect(dayPlan({ activities, byId, child: null, logs: [], date: today }).ids).toEqual([]);
    expect(suggestActivities({ activities, child: { id: 'x', name: 'X' }, logs: [], date: today })).toEqual([]);
  });
});
