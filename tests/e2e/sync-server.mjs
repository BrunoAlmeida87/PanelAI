// Servidor de sincronização de teste: imita, em memória, as funções
// panelai_push e panelai_pull de supabase/panelai.sql (mesmo contrato HTTP do Supabase).

import { createServer } from 'node:http';

const COLLECTIONS = new Set(['ingredients', 'recipes', 'pantry', 'weeks', 'marmitas', 'movements', 'purchases', 'notes', 'settings']);
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'apikey, authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export function startSyncServer(port, { apiKey = 'chave-de-teste' } = {}) {
  const houses = new Map(); // código → Map(chave → registro)
  let seq = 0;
  const house = (code) => {
    if (typeof code !== 'string' || code.length < 20) throw new Error('codigo_invalido');
    if (!houses.has(code)) houses.set(code, new Map());
    return houses.get(code);
  };

  const rpc = {
    panelai_push({ p_code, p_records }) {
      const h = house(p_code);
      let saved = 0;
      for (const r of p_records) {
        if (!COLLECTIONS.has(r.collection) || !r.id) continue;
        const key = `${r.collection}:${r.id}`;
        const changedAt = new Date(Math.min(Date.parse(r.changedAt), Date.now())).toISOString();
        const old = h.get(key);
        if (old && Date.parse(old.changedAt) > Date.parse(changedAt)) continue;
        h.set(key, { collection: r.collection, id: r.id, data: r.deleted ? null : r.data, deleted: !!r.deleted, changedAt, seq: ++seq });
        saved++;
      }
      return { saved };
    },
    panelai_pull({ p_code, p_since = 0, p_limit = 50 }) {
      const rows = [...house(p_code).values()].filter((r) => r.seq > p_since).sort((a, b) => a.seq - b.seq).slice(0, p_limit);
      return {
        records: rows.map(({ seq: _seq, ...rec }) => rec),
        cursor: rows.length ? rows[rows.length - 1].seq : p_since,
        more: rows.length === p_limit,
      };
    },
  };

  const server = createServer((req, res) => {
    const send = (status, body) => {
      res.writeHead(status, { ...CORS, 'Content-Type': 'application/json' });
      res.end(JSON.stringify(body));
    };
    if (req.method === 'OPTIONS') return send(204, null);
    const fn = /^\/rest\/v1\/rpc\/(\w+)$/.exec(req.url)?.[1];
    if (req.method !== 'POST' || !rpc[fn]) return send(404, { message: 'Could not find the function' });
    if (req.headers.apikey !== apiKey) return send(401, { message: 'Invalid API key' });
    let raw = '';
    req.on('data', (c) => (raw += c));
    req.on('end', () => {
      try {
        send(200, rpc[fn](JSON.parse(raw)));
      } catch (err) {
        send(400, { message: String(err.message) });
      }
    });
  });
  return new Promise((resolve) => server.listen(port, () => resolve({ url: `http://localhost:${port}`, apiKey, close: () => server.close() })));
}
