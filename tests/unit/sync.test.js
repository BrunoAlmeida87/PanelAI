import { describe, expect, it } from 'vitest';
import {
  SyncError,
  chunkRecords,
  createRemote,
  decodeInvite,
  deliveredKeys,
  encodeInvite,
  isValidRemote,
  makeHouseCode,
  mergePull,
  outboxEntries,
  validateConfig,
} from '../../src/services/sync.js';

const T1 = '2026-11-10T10:00:00.000Z';
const T2 = '2026-11-10T11:00:00.000Z';
const remote = (collection, id, data, changedAt = T1) => ({ collection, id, data, deleted: data == null, changedAt });
const local = (collection, id, changedAt) => ({ key: `${collection}:${id}`, collection, id, data: { id }, deleted: false, changedAt });

describe('código da casa e convite', () => {
  it('gera códigos longos, diferentes e aceitos pela validação', () => {
    const a = makeHouseCode();
    const b = makeHouseCode();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^([a-z2-9]{4}-){7}[a-z2-9]{4}$/);
    expect(validateConfig({ url: 'https://x.supabase.co', key: 'k', code: a })).toEqual([]);
  });

  it('recusa configuração incompleta', () => {
    expect(validateConfig({ url: 'x.supabase.co', key: '', code: 'curto' })).toHaveLength(3);
  });

  it('convite vai e volta, inclusive dentro de um link', () => {
    const cfg = { url: 'https://x.supabase.co/', key: 'sb_publishable_ç', code: makeHouseCode() };
    const token = encodeInvite(cfg);
    const expected = { ...cfg, url: 'https://x.supabase.co' };
    expect(decodeInvite(token)).toEqual(expected);
    expect(decodeInvite(`https://site/PanelAI/#/ajustes?casa=${token}`)).toEqual(expected);
    expect(decodeInvite('não é convite')).toBeNull();
    expect(decodeInvite(encodeInvite({ url: 'https://x', key: 'k', code: 'curto' }))).toBeNull();
  });
});

describe('fila de envio', () => {
  it('converte gravações em itens, com a última operação prevalecendo', async () => {
    const entries = await outboxEntries(
      [
        { store: 'recipes', type: 'put', value: { id: 'r1', name: 'A' } },
        { store: 'recipes', type: 'put', value: { id: 'r1', name: 'B' } },
        { store: 'pantry', type: 'put', value: { ingredientId: 'arroz', qty: 1 } },
        { store: 'notes', type: 'delete', key: 'n1' },
        { store: 'meta', type: 'put', value: { key: 'settings', value: { people: 3 } } },
        { store: 'meta', type: 'put', value: { key: 'countDraft', value: {} } },
        { store: 'outbox', type: 'clear' },
      ],
      { now: T1 },
    );
    expect([...entries.keys()].sort()).toEqual(['notes:n1', 'pantry:arroz', 'recipes:r1', 'settings:settings']);
    expect(entries.get('recipes:r1')).toMatchObject({ data: { name: 'B' }, deleted: false, changedAt: T1 });
    expect(entries.get('notes:n1')).toMatchObject({ data: null, deleted: true });
    expect(entries.get('settings:settings').data).toEqual({ people: 3 });
  });

  it('"apagar tudo" vira exclusões, exceto do que é regravado em seguida', async () => {
    const entries = await outboxEntries(
      [
        { store: 'weeks', type: 'clear' },
        { store: 'weeks', type: 'put', value: { id: 'w2' } },
      ],
      { existingKeys: async (store) => (store === 'weeks' ? ['w1', 'w2'] : []) },
    );
    expect(entries.get('weeks:w1').deleted).toBe(true);
    expect(entries.get('weeks:w2').deleted).toBe(false);
  });

  it('divide em lotes por quantidade e por tamanho', () => {
    const small = Array.from({ length: 5 }, (_, i) => ({ data: { i } }));
    expect(chunkRecords(small, { maxCount: 2 }).map((c) => c.length)).toEqual([2, 2, 1]);
    const big = [{ data: { img: 'x'.repeat(900) } }, { data: { img: 'x'.repeat(900) } }, { data: null }];
    expect(chunkRecords(big, { maxBytes: 1500 }).map((c) => c.length)).toEqual([1, 2]);
  });

  it('só remove da fila o que não mudou durante o envio', () => {
    const sentRecords = [local('recipes', 'a', T1), local('recipes', 'b', T1), local('recipes', 'c', T1)];
    const current = new Map([
      ['recipes:a', local('recipes', 'a', T1)],
      ['recipes:b', local('recipes', 'b', T2)], // editado de novo
    ]);
    expect(deliveredKeys(sentRecords, current)).toEqual(['recipes:a']);
  });
});

describe('mesclagem do que vem da nuvem', () => {
  it('aplica gravações, exclusões e configurações', () => {
    const { ops, applied } = mergePull([
      remote('recipes', 'r1', { id: 'r1', name: 'A' }),
      remote('notes', 'n1', null),
      remote('settings', 'settings', { people: 4 }),
      remote('pantry', 'arroz', { ingredientId: 'arroz', qty: 2 }),
    ]);
    expect(applied).toBe(4);
    expect(ops).toEqual([
      { store: 'recipes', type: 'put', value: { id: 'r1', name: 'A' } },
      { store: 'notes', type: 'delete', key: 'n1' },
      { store: 'meta', type: 'put', value: { key: 'settings', value: { people: 4 } } },
      { store: 'pantry', type: 'put', value: { ingredientId: 'arroz', qty: 2 } },
    ]);
  });

  it('a alteração local mais nova vence; a mais antiga é descartada', () => {
    const outbox = new Map([
      ['recipes:novo', local('recipes', 'novo', T2)],
      ['recipes:velho', local('recipes', 'velho', T1)],
    ]);
    const { ops, dropOutbox, applied } = mergePull(
      [remote('recipes', 'novo', { id: 'novo', v: 'nuvem' }, T1), remote('recipes', 'velho', { id: 'velho', v: 'nuvem' }, T2)],
      { outbox },
    );
    expect(applied).toBe(1);
    expect(dropOutbox).toEqual(['recipes:velho']);
    expect(ops).toEqual([
      { store: 'recipes', type: 'put', value: { id: 'velho', v: 'nuvem' } },
      { store: 'outbox', type: 'delete', key: 'recipes:velho' },
    ]);
  });

  it('ignora o eco do próprio envio, mesmo com outro formato de data', () => {
    const sent = new Map([['recipes:r1', Date.parse(T1)]]);
    const { applied } = mergePull([remote('recipes', 'r1', { id: 'r1' }, '2026-11-10T10:00:00+00:00')], { sent });
    expect(applied).toBe(0);
  });

  it('descarta registros malformados', () => {
    expect(isValidRemote(remote('recipes', 'r1', { id: 'outro' }))).toBe(false);
    expect(isValidRemote(remote('desconhecida', 'x', { id: 'x' }))).toBe(false);
    expect(isValidRemote(remote('outbox', 'x', { key: 'x' }))).toBe(false);
    expect(isValidRemote(remote('meta', 'seeded', { key: 'seeded' }))).toBe(false);
    expect(isValidRemote(remote('settings', 'settings', null))).toBe(false);
    expect(isValidRemote(remote('recipes', 'r1', [1]))).toBe(false);
    expect(mergePull([null, remote('recipes', '', { id: '' })]).applied).toBe(0);
  });
});

describe('cliente do servidor', () => {
  const ok = (json) => ({ ok: true, status: 200, json: async () => json });

  it('chama as funções com endereço, chave e corpo corretos', async () => {
    const calls = [];
    const fetch = async (url, init) => {
      calls.push({ url, headers: init.headers, body: JSON.parse(init.body) });
      return ok(url.endsWith('pull') ? { records: [], cursor: 7, more: false } : { saved: 1 });
    };
    const r = createRemote({ url: 'https://x.supabase.co/', key: 'eyJabc', fetch });
    expect(await r.pull('codigo', 3)).toEqual({ records: [], cursor: 7, more: false });
    await r.push('codigo', [{ key: 'recipes:r1', collection: 'recipes', id: 'r1', data: { id: 'r1' }, deleted: false, changedAt: T1 }]);
    expect(calls[0].url).toBe('https://x.supabase.co/rest/v1/rpc/panelai_pull');
    expect(calls[0].headers).toMatchObject({ apikey: 'eyJabc', Authorization: 'Bearer eyJabc' });
    expect(calls[0].body).toEqual({ p_code: 'codigo', p_since: 3, p_limit: 50 });
    expect(calls[1].body.p_records).toEqual([{ collection: 'recipes', id: 'r1', data: { id: 'r1' }, deleted: false, changedAt: T1 }]);
  });

  it('chaves novas (publishable) não vão no Authorization', async () => {
    let headers;
    const fetch = async (_url, init) => ((headers = init.headers), ok({ records: [], cursor: 0, more: false }));
    await createRemote({ url: 'https://x', key: 'sb_publishable_1', fetch }).pull('c');
    expect(headers.Authorization).toBeUndefined();
  });

  it('traduz falhas de rede e erros do servidor', async () => {
    const down = createRemote({ url: 'https://x', key: 'k', fetch: async () => Promise.reject(new TypeError('Failed to fetch')) });
    await expect(down.pull('c')).rejects.toMatchObject({ name: 'SyncError', offline: true });

    const fail = (status, body) => createRemote({ url: 'https://x', key: 'k', fetch: async () => ({ ok: false, status, json: async () => body }) });
    await expect(fail(401, {}).pull('c')).rejects.toThrow(/chave pública/);
    await expect(fail(404, { message: 'Could not find the function public.panelai_pull' }).pull('c')).rejects.toThrow(/panelai\.sql/);
    await expect(fail(400, { message: 'codigo_invalido' }).pull('c')).rejects.toThrow(/Código da casa inválido/);
    await expect(createRemote({ url: 'https://x', key: 'k', fetch: async () => ok({}) }).pull('c')).rejects.toBeInstanceOf(SyncError);
  });
});
