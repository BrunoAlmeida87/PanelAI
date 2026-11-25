import { describe, expect, it } from 'vitest';
import { FOLD_AFTER_MS, IMAGES, MARKS, Mirror, archiveColl, bundleRaw, foldRaw, isArchivable, nextBundleId, parseRaw, stable } from '../../src/cloud/layout.js';
import { emptyWeek } from '../../src/services/demand.js';

/** Servidor em memória: aplica gravações e avisa os aparelhos (como o onSnapshot). */
function makeServer() {
  const docs = new Map(); // "coll\0id" → raw
  const devices = [];
  return {
    docs,
    connect(mirror) {
      devices.push(mirror);
      for (const [k, raw] of docs) {
        const [coll, id] = k.split('\u0000');
        mirror.applyDoc(coll, id, raw);
      }
      return mirror.flush();
    },
    commit(writes) {
      for (const w of writes) {
        const k = `${w.coll}\u0000${w.id}`;
        if (w.raw == null) docs.delete(k);
        else docs.set(k, w.raw);
      }
      const out = devices.map((m) => {
        for (const w of writes) m.applyDoc(w.coll, w.id, w.raw);
        return m.flush();
      });
      return out;
    },
    get(coll, id) {
      return docs.get(`${coll}\u0000${id}`);
    },
    count(coll) {
      return [...docs.keys()].filter((k) => k.startsWith(`${coll}\u0000`)).length;
    },
  };
}

/** Aparelho: espelho + estado do app (mapas por coleção). */
function makeDevice(server, name) {
  const mirror = new Mirror();
  const state = {};
  const apply = (changes) => {
    for (const [store, list] of Object.entries(changes)) {
      state[store] ??= {};
      for (const c of list) {
        if (c.type === 'put') state[store][c.key] = c.value;
        else delete state[store][c.key];
      }
    }
  };
  apply(server.connect(mirror));
  return {
    mirror,
    state,
    /** Grava sem enviar (como sem internet): devolve as gravações para enviar depois. */
    write(ops, now = Date.now()) {
      for (const op of ops) {
        state[op.store] ??= {};
        if (op.type === 'put') state[op.store][op.value.id ?? op.value.key ?? op.value.ingredientId] = op.value;
        else if (op.type === 'delete') delete state[op.store][op.key];
        else if (op.type === 'clear') state[op.store] = {};
      }
      return mirror.plan(ops, { device: name, now });
    },
    receive: apply,
  };
}

function sync(server, devices, plan) {
  const outs = server.commit(plan.writes);
  outs.forEach((changes, i) => devices[i].receive(changes));
}

const WEEK = '2026-11-16';
const week = (patch = {}) => ({ ...emptyWeek(WEEK), createdAt: 'x', updatedAt: 'x', ...patch });
const withChecked = (w, checked) => ({ ...w, shopping: { ...w.shopping, checked: { ...w.shopping.checked, ...checked } }, updatedAt: String(Math.random()) });

describe('nuvem: marcações simultâneas', () => {
  it('duas pessoas marcando itens ao mesmo tempo não perdem marcações', () => {
    const server = makeServer();
    const a = makeDevice(server, 'A');
    const b = makeDevice(server, 'B');
    const devices = [a, b];
    sync(server, devices, a.write([{ store: 'weeks', type: 'put', value: week() }]));
    expect(b.state.weeks[WEEK]).toBeTruthy();

    // Os dois marcam sem ver a marcação do outro (ex.: sem sinal no mercado).
    const pa = a.write([{ store: 'weeks', type: 'put', value: withChecked(a.state.weeks[WEEK], { 'arroz|g': true }) }], 1000);
    const pb = b.write([{ store: 'weeks', type: 'put', value: withChecked(b.state.weeks[WEEK], { 'feijao|g': true }) }], 1001);
    // Só marcações: o documento da semana não é regravado.
    expect(pa.writes.map((w) => w.coll)).toEqual([MARKS]);
    expect(pb.writes.map((w) => w.coll)).toEqual([MARKS]);
    sync(server, devices, pa);
    sync(server, devices, pb);

    for (const d of devices) {
      expect(d.state.weeks[WEEK].shopping.checked).toEqual({ 'arroz|g': true, 'feijao|g': true });
    }
  });

  it('para o mesmo item vale a alteração mais recente', () => {
    const server = makeServer();
    const a = makeDevice(server, 'A');
    const b = makeDevice(server, 'B');
    const devices = [a, b];
    sync(server, devices, a.write([{ store: 'weeks', type: 'put', value: withChecked(week(), { x: true }) }]));
    const pa = a.write([{ store: 'weeks', type: 'put', value: withChecked(a.state.weeks[WEEK], { x: false }) }], 2000);
    const pb = b.write([{ store: 'weeks', type: 'put', value: withChecked(b.state.weeks[WEEK], { x: true, y: true }) }], 1000);
    sync(server, devices, pb);
    sync(server, devices, pa);
    for (const d of devices) expect(d.state.weeks[WEEK].shopping.checked).toEqual({ x: false, y: true });
  });

  it('avulsos adicionados por duas pessoas são somados', () => {
    const server = makeServer();
    const a = makeDevice(server, 'A');
    const b = makeDevice(server, 'B');
    const devices = [a, b];
    sync(server, devices, a.write([{ store: 'weeks', type: 'put', value: week() }]));
    const add = (w, id, name) => ({ ...w, shopping: { ...w.shopping, extras: [...w.shopping.extras, { id, name, checked: false }] } });
    const pa = a.write([{ store: 'weeks', type: 'put', value: add(a.state.weeks[WEEK], 'avulso_1', 'Pão') }], 10);
    const pb = b.write([{ store: 'weeks', type: 'put', value: add(b.state.weeks[WEEK], 'avulso_2', 'Leite') }], 11);
    sync(server, devices, pa);
    sync(server, devices, pb);
    for (const d of devices) expect(d.state.weeks[WEEK].shopping.extras.map((e) => e.name)).toEqual(['Pão', 'Leite']);

    // Remover um avulso também sincroniza.
    const w = a.state.weeks[WEEK];
    sync(server, devices, a.write([{ store: 'weeks', type: 'put', value: { ...w, shopping: { ...w.shopping, extras: w.shopping.extras.filter((e) => e.id !== 'avulso_1') } } }], 20));
    for (const d of devices) expect(d.state.weeks[WEEK].shopping.extras.map((e) => e.name)).toEqual(['Leite']);
  });

  it('mudar o cardápio grava a semana; marcar itens não regrava o cardápio', () => {
    const server = makeServer();
    const a = makeDevice(server, 'A');
    const b = makeDevice(server, 'B');
    const devices = [a, b];
    sync(server, devices, a.write([{ store: 'weeks', type: 'put', value: week() }]));
    const meals = { ...a.state.weeks[WEEK].meals, [WEEK]: { ...a.state.weeks[WEEK].meals[WEEK], almoco: [{ id: 'e1', kind: 'text', text: 'Sopa' }] } };
    const pa = a.write([{ store: 'weeks', type: 'put', value: { ...a.state.weeks[WEEK], meals } }]);
    expect(pa.writes.map((w) => w.coll)).toEqual(['weeks']);
    // B marca um item antes de receber o cardápio novo de A.
    const pb = b.write([{ store: 'weeks', type: 'put', value: withChecked(b.state.weeks[WEEK], { 'ovo|un': true }) }]);
    sync(server, devices, pa);
    sync(server, devices, pb);
    for (const d of devices) {
      expect(d.state.weeks[WEEK].meals[WEEK].almoco[0].text).toBe('Sopa');
      expect(d.state.weeks[WEEK].shopping.checked['ovo|un']).toBe(true);
    }
  });

  it('contagem da despensa e mercado do mês também mesclam por item', () => {
    const server = makeServer();
    const a = makeDevice(server, 'A');
    const b = makeDevice(server, 'B');
    const devices = [a, b];
    sync(server, devices, a.write([
      { store: 'meta', type: 'put', value: { key: 'countDraft', value: {} } },
      { store: 'meta', type: 'put', value: { key: 'monthlySession', value: { id: 's1', checked: {}, qty: {} } } },
    ]));
    const pa = a.write([{ store: 'meta', type: 'put', value: { key: 'countDraft', value: { arroz: '2' } } }], 5);
    const pb = b.write([{ store: 'meta', type: 'put', value: { key: 'countDraft', value: { feijao: '1' } } }], 6);
    sync(server, devices, pa);
    sync(server, devices, pb);
    for (const d of devices) expect(d.state.meta.countDraft.value).toEqual({ arroz: '2', feijao: '1' });

    const ma = a.write([{ store: 'meta', type: 'put', value: { key: 'monthlySession', value: { id: 's1', checked: { cafe: true }, qty: { cafe: 2 } } } }], 7);
    const mb = b.write([{ store: 'meta', type: 'put', value: { key: 'monthlySession', value: { id: 's1', checked: { sal: true }, qty: {} } } }], 8);
    sync(server, devices, ma);
    sync(server, devices, mb);
    for (const d of devices) expect(d.state.meta.monthlySession.value).toEqual({ id: 's1', checked: { cafe: true, sal: true }, qty: { cafe: 2 } });
  });

  it('incorpora as marcações ao registro (fold) sem mudar o resultado', () => {
    const server = makeServer();
    const a = makeDevice(server, 'A');
    const b = makeDevice(server, 'B');
    const devices = [a, b];
    sync(server, devices, a.write([{ store: 'weeks', type: 'put', value: week() }]));
    sync(server, devices, a.write([{ store: 'weeks', type: 'put', value: withChecked(a.state.weeks[WEEK], { p: true }) }], 100));
    sync(server, devices, b.write([{ store: 'weeks', type: 'put', value: withChecked(b.state.weeks[WEEK], { q: true }) }], 200));
    // (a data de alteração da semana não acompanha marcações: só o conteúdo importa)
    const content = (w) => stable({ ...w, updatedAt: null });
    const before = content(a.state.weeks[WEEK]);

    const [cand] = a.mirror.foldCandidates(200 + FOLD_AFTER_MS + 1);
    expect(cand.markIds).toHaveLength(2);
    const raw = foldRaw('weeks', WEEK, server.get('weeks', WEEK), cand.markIds.map((id) => server.get(MARKS, id)));
    expect(parseRaw(raw).__foldedAt).toBe(200);
    sync(server, devices, { writes: [{ coll: 'weeks', id: WEEK, raw }, ...cand.markIds.map((id) => ({ coll: MARKS, id, raw: null }))] });
    expect(server.count(MARKS)).toBe(0);
    for (const d of devices) expect(content(d.state.weeks[WEEK])).toBe(before);
    expect(a.mirror.foldCandidates(Date.now())).toEqual([]);

    // Uma marcação antiga reenviada depois do fold não desfaz nada.
    const stale = { coll: MARKS, id: 'weeks~x~B', raw: stable({ s: 'weeks', k: WEEK, d: 'B', f: { sc: { p: { a: 50, v: false } } } }) };
    sync(server, devices, { writes: [stale] });
    for (const d of devices) expect(d.state.weeks[WEEK].shopping.checked.p).toBe(true);
  });
});

describe('nuvem: arquivo mensal', () => {
  const mov = (id, date) => ({ id, date, type: 'compra', ingredientId: 'arroz', delta: 1, unit: 'g' });

  it('identifica registros antigos e mantém os recentes avulsos', () => {
    expect(isArchivable('movements', mov('m1', '2026-08-01T10:00:00Z'), '2026-11-17')).toBe(true);
    expect(isArchivable('movements', mov('m2', '2026-11-10T10:00:00Z'), '2026-11-17')).toBe(false);
    expect(isArchivable('tasks', { id: 't', date: '2026-08-01', status: 'todo' }, '2026-11-17')).toBe(false);
    expect(isArchivable('tasks', { id: 't', date: '2026-08-01', status: 'done' }, '2026-11-17')).toBe(true);
    expect(isArchivable('marmitas', { id: 'm', prepDate: '2026-08-01', status: 'armazenada' }, '2026-11-17')).toBe(false);
    expect(isArchivable('recipes', { id: 'r' }, '2026-11-17')).toBe(false);
    // Registros Montessori antigos vão para o arquivo mensal (a coleção tem nome simples: as regras não mudam).
    expect(isArchivable('montessoriLogs', { id: 'l', date: '2026-08-01' }, '2026-11-17')).toBe(true);
    expect(isArchivable('montessoriLogs', { id: 'l', date: '2026-11-01' }, '2026-11-17')).toBe(false);
    expect(archiveColl('montessoriLogs')).toMatch(/^[A-Za-z]{1,40}$/);
    expect(nextBundleId('2026-08', [])).toBe('2026-08');
    expect(nextBundleId('2026-08', ['2026-08'])).toBe('2026-08~2');
    expect(nextBundleId('2026-08', ['2026-08', '2026-08~2'])).toBe('2026-08~3');
  });

  it('arquivar não muda o que o app vê; alterar ou apagar arquivados funciona', () => {
    const server = makeServer();
    const a = makeDevice(server, 'A');
    const b = makeDevice(server, 'B');
    const devices = [a, b];
    sync(server, devices, a.write([
      { store: 'movements', type: 'put', value: mov('m1', '2026-08-01T10:00:00Z') },
      { store: 'movements', type: 'put', value: mov('m2', '2026-08-02T10:00:00Z') },
      { store: 'movements', type: 'put', value: mov('m3', '2026-11-10T10:00:00Z') },
    ]));
    const [cand] = a.mirror.archiveCandidates('2026-11-17');
    expect(cand).toEqual({ store: 'movements', month: '2026-08', keys: ['m1', 'm2'] });
    const raw = bundleRaw('movements', null, cand.keys.map((k) => parseRaw(server.get('movements', k))));
    const changes = server.commit([{ coll: archiveColl('movements'), id: '2026-08', raw }, ...cand.keys.map((id) => ({ coll: 'movements', id, raw: null }))]);
    // Mover para o arquivo não gera alteração para o app.
    expect(changes).toEqual([{}, {}]);
    expect(server.count('movements')).toBe(1);
    expect(Object.keys(b.state.movements).sort()).toEqual(['m1', 'm2', 'm3']);

    // Apagar um arquivado regrava o pacote.
    sync(server, devices, a.write([{ store: 'movements', type: 'delete', key: 'm1' }]));
    for (const d of devices) expect(Object.keys(d.state.movements).sort()).toEqual(['m2', 'm3']);
    // Alterar um arquivado o traz de volta como avulso.
    sync(server, devices, b.write([{ store: 'movements', type: 'put', value: { ...mov('m2', '2026-08-02T10:00:00Z'), note: 'x' } }]));
    expect(server.count(archiveColl('movements'))).toBe(0);
    for (const d of devices) expect(d.state.movements.m2.note).toBe('x');

    // Limpar a coleção (importar backup) apaga avulsos e arquivados.
    sync(server, devices, a.write([{ store: 'movements', type: 'clear' }]));
    expect(server.count('movements') + server.count(archiveColl('movements'))).toBe(0);
    for (const d of devices) expect(d.state.movements).toEqual({});
  });
});

describe('nuvem: imagens das receitas', () => {
  const recipe = (patch = {}) => ({ id: 'bolo', name: 'Bolo', servings: 4, ingredients: [], ...patch });

  it('guarda a imagem à parte e não a reenvia ao favoritar', () => {
    const server = makeServer();
    const a = makeDevice(server, 'A');
    const b = makeDevice(server, 'B');
    const devices = [a, b];
    const img = 'data:image/jpeg;base64,AAAA';
    const p1 = a.write([{ store: 'recipes', type: 'put', value: recipe({ image: img }) }]);
    expect(p1.writes.map((w) => w.coll).sort()).toEqual([IMAGES, 'recipes']);
    expect(parseRaw(p1.writes.find((w) => w.coll === 'recipes').raw).image).toBe(null);
    sync(server, devices, p1);
    expect(b.state.recipes.bolo.image).toBe(img);

    const p2 = b.write([{ store: 'recipes', type: 'put', value: { ...b.state.recipes.bolo, favorite: true } }]);
    expect(p2.writes.map((w) => w.coll)).toEqual(['recipes']);
    sync(server, devices, p2);
    expect(a.state.recipes.bolo).toMatchObject({ favorite: true, image: img });

    sync(server, devices, a.write([{ store: 'recipes', type: 'put', value: { ...a.state.recipes.bolo, image: null } }]));
    expect(server.count(IMAGES)).toBe(0);
    expect(b.state.recipes.bolo.image).toBe(null);
  });

  it('lê receitas antigas com a imagem dentro do registro', () => {
    const server = makeServer();
    server.docs.set('recipes\u0000bolo', JSON.stringify(recipe({ image: 'data:old' })));
    const a = makeDevice(server, 'A');
    expect(a.state.recipes.bolo.image).toBe('data:old');
  });
});

describe('nuvem: compatibilidade e casa nova', () => {
  it('casa nova: grava os registros inteiros, sem marcações nem exclusões', () => {
    const m = new Mirror();
    const { writes } = m.plan(
      [
        { store: 'weeks', type: 'clear' },
        { store: 'weeks', type: 'put', value: withChecked(week(), { a: true }) },
        { store: 'tasks', type: 'clear' },
        { store: 'tasks', type: 'put', value: { id: 't1', title: 'Lixo', date: '2026-11-17', status: 'todo' } },
      ],
      { device: 'A' },
    );
    expect(writes.map((w) => `${w.coll}/${w.id}`).sort()).toEqual(['tasks/t1', `weeks/${WEEK}`]);
    expect(parseRaw(writes.find((w) => w.coll === 'weeks').raw).shopping.checked).toEqual({ a: true });
  });

  it('não regrava registros que não mudaram', () => {
    const m = new Mirror();
    const t = { id: 't1', title: 'Lixo', date: '2026-11-17', status: 'todo' };
    m.plan([{ store: 'tasks', type: 'put', value: t }], { device: 'A' });
    expect(m.plan([{ store: 'tasks', type: 'put', value: { ...t } }], { device: 'A' }).writes).toEqual([]);
  });
});
