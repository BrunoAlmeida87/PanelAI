// Servidor de sincronização de teste: imita, em memória, as funções
// panelai_push, panelai_pull, panelai_panel_token e panelai_panel de supabase/panelai.sql (mesmo contrato HTTP do Supabase).

import { createHash } from 'node:crypto';
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

  const panels = new Map(); // token → código da casa
  const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const SLOTS = [['lanche_manha', 'Lanche da manhã'], ['almoco', 'Almoço'], ['lanche_tarde', 'Lanche da tarde'], ['jantar', 'Jantar']];

  function dayMeals(h, date) {
    const get = (collection, id) => {
      const r = h.get(`${collection}:${id}`);
      return r && !r.deleted ? r.data : null;
    };
    const d = new Date(`${date}T12:00:00`);
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    const day = get('weeks', iso(monday))?.meals?.[date] ?? {};
    const label = (e) => {
      if (e.kind === 'recipe') return get('recipes', e.recipeId)?.name ?? 'Receita removida';
      if (e.kind === 'marmita') return `Marmita: ${get('recipes', get('marmitas', e.marmitaId)?.recipeId)?.name ?? 'Marmita'}`;
      if (e.kind === 'out') return e.text ? `Fora: ${e.text}` : 'Fora de casa';
      return e.kind === 'text' ? e.text || 'Refeição livre' : '';
    };
    return SLOTS.filter(([id]) => day[id]?.length).map(([slot, name]) => ({ slot, label: name, items: day[slot].map(label) }));
  }

  const rpc = {
    panelai_panel_token({ p_code }) {
      house(p_code);
      const token = `quadro-${Buffer.from(p_code).toString('hex').slice(0, 33)}`;
      panels.set(token, p_code);
      return token;
    },
    panelai_panel({ p_token, p_date }) {
      if (!panels.has(p_token)) throw new Error('quadro_invalido');
      const h = house(panels.get(p_token));
      const date = p_date ?? iso(new Date());
      const d = new Date(`${date}T12:00:00`);
      const next = new Date(d);
      next.setDate(d.getDate() + 1);
      const notes = [...h.values()]
        .filter((r) => r.collection === 'notes' && !r.deleted)
        .map((r) => r.data)
        .filter((n) => (!n.startDate || n.startDate <= date) && (!n.endDate || n.endDate >= date) && (!n.weekdays?.length || n.weekdays.includes(d.getDay())))
        .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned) || ((a.updatedAt ?? '') < (b.updatedAt ?? '') ? 1 : -1))
        .map((n) => ({ text: n.text, author: n.author ?? '', pinned: !!n.pinned }));
      const body = { date, weekday: d.getDay(), meals: dayMeals(h, date), tomorrow: dayMeals(h, iso(next)), notes };
      const updatedAt = [...h.values()].map((r) => r.changedAt).sort().pop() ?? null;
      return { ...body, version: createHash('md5').update(JSON.stringify(body)).digest('hex'), updatedAt };
    },
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
