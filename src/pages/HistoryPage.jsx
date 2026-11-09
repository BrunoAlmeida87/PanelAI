// Histórico: compras concluídas, movimentações de estoque e semanas planejadas.

import { useMemo, useState } from 'preact/hooks';
import { ArrowLeft, CalendarDays, PackageCheck, Star, ArrowUpDown } from 'lucide-preact';
import { useStore } from '../storage/store.js';
import { setWeekId } from '../storage/ui.js';
import { MOVEMENT_TYPES } from '../models/constants.js';
import { formatQty, formatNumber, unitLabel } from '../models/units.js';
import { countEntries } from '../services/planning.js';
import { formatDateTime, formatWeekRange } from '../utils/dates.js';
import { navigate } from '../utils/router.js';
import { useIsDesktop } from '../utils/hooks.js';
import { Segmented, EmptyState, Chip } from '../components/ui.jsx';

export function HistoryPage() {
  const s = useStore();
  const isDesktop = useIsDesktop();
  const [tab, setTab] = useState('compras');
  const [type, setType] = useState('');
  const movements = useMemo(() => s.movements.filter((m) => !type || m.type === type).slice(0, 300), [s.movements, type]);
  const weeks = useMemo(
    () => Object.values(s.weeks).filter((w) => countEntries(w) > 0).sort((a, b) => (a.id < b.id ? 1 : -1)),
    [s.weeks],
  );
  const name = (id) => s.ingredients[id]?.name ?? id;

  return (
    <div style="max-width:980px">
      <div class="toolbar" style="margin-bottom:12px">
        <a class="btn btn-ghost" href="#/ajustes" style="padding-left:6px">
          <ArrowLeft size={18} /> Configurações
        </a>
      </div>
      <div class="page-head">
        <div class="grow">
          <h1>Histórico</h1>
          <p class="sub">Compras registradas, movimentações da despensa e semanas planejadas</p>
        </div>
      </div>
      <div style="margin-bottom:16px">
        <Segmented
          options={[
            { id: 'compras', label: 'Compras', count: s.purchases.length },
            { id: 'movimentos', label: 'Estoque', count: s.movements.length },
            { id: 'semanas', label: 'Semanas', count: weeks.length },
          ]}
          value={tab}
          onChange={setTab}
          label="Histórico"
          block={!isDesktop}
        />
      </div>

      {tab === 'compras' &&
        (s.purchases.length ? (
          <div style="display:grid;gap:10px">
            {s.purchases.map((p) => (
              <details class="cat-block" key={p.id}>
                <summary>
                  <PackageCheck size={16} />
                  <span style="text-transform:none;letter-spacing:0">
                    {p.type === 'mensal' ? 'Mercado do mês' : `Lista da semana${p.weekId ? ` ${formatWeekRange(p.weekId)}` : ''}`}
                  </span>
                  <span class="count">{formatDateTime(p.date)} · {p.items.length} itens</span>
                </summary>
                <ul class="mini-list">
                  {p.items.map((i, idx) => (
                    <li key={idx}>
                      <span>{i.name}</span>
                      <span class="num">{formatQty(i.qty, i.unit)}</span>
                    </li>
                  ))}
                </ul>
              </details>
            ))}
          </div>
        ) : (
          <div class="card">
            <EmptyState icon={PackageCheck} title="Nenhuma compra registrada">
              Use "Registrar compra" na lista da semana ou "Finalizar compra" no mercado do mês.
            </EmptyState>
          </div>
        ))}

      {tab === 'movimentos' && (
        <>
          <div class="chip-row scroll" style="margin-bottom:12px">
            <Chip pressed={!type} onClick={() => setType('')}>Todas</Chip>
            {Object.entries(MOVEMENT_TYPES).map(([id, label]) => (
              <Chip key={id} pressed={type === id} onClick={() => setType(id)}>{label}</Chip>
            ))}
          </div>
          {movements.length ? (
            isDesktop ? (
              <div class="card table-wrap">
                <table class="table">
                  <thead>
                    <tr>
                      <th>Data</th>
                      <th>Produto</th>
                      <th>Tipo</th>
                      <th>Variação</th>
                      <th>Saldo</th>
                      <th>Origem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {movements.map((m) => (
                      <tr key={m.id}>
                        <td class="nowrap muted">{formatDateTime(m.date)}</td>
                        <td>{name(m.ingredientId)}</td>
                        <td>{MOVEMENT_TYPES[m.type] ?? m.type}</td>
                        <td class="num" style={`color:${m.delta >= 0 ? 'var(--green-dark)' : 'var(--coral-dark)'}`}>
                          {m.delta > 0 ? '+' : ''}{formatNumber(m.delta, 3)} {unitLabel(m.unit)}
                        </td>
                        <td class="num">{formatNumber(m.after, 3)} {unitLabel(m.unit)}</td>
                        <td class="muted small">{m.note}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div class="card">
                <ul class="mini-list">
                  {movements.map((m) => (
                    <li key={m.id}>
                      <span>
                        <strong>{name(m.ingredientId)}</strong>
                        <span class="xsmall muted" style="display:block">
                          {MOVEMENT_TYPES[m.type]} · {formatDateTime(m.date)}
                        </span>
                      </span>
                      <span class="num" style={`text-align:right;color:${m.delta >= 0 ? 'var(--green-dark)' : 'var(--coral-dark)'}`}>
                        {m.delta > 0 ? '+' : ''}{formatNumber(m.delta, 3)} {unitLabel(m.unit)}
                        <span class="xsmall muted" style="display:block">saldo {formatNumber(m.after, 3)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          ) : (
            <div class="card">
              <EmptyState icon={ArrowUpDown} title="Nenhuma movimentação">Compras, consumos e contagens aparecem aqui.</EmptyState>
            </div>
          )}
        </>
      )}

      {tab === 'semanas' &&
        (weeks.length ? (
          <div class="card">
            <div class="action-list" style="padding:6px">
              {weeks.map((w) => (
                <button
                  key={w.id}
                  type="button"
                  onClick={() => {
                    setWeekId(w.id);
                    navigate('/cardapio');
                  }}
                >
                  {w.favorite ? <Star size={18} fill="#DCA49B" color="#DCA49B" /> : <CalendarDays size={18} />}
                  <span style="flex:1">
                    <strong>{formatWeekRange(w.id)}</strong>
                    {w.favoriteName && <span class="small muted"> · {w.favoriteName}</span>}
                    <span class="small muted" style="display:block">{countEntries(w)} refeições planejadas</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div class="card">
            <EmptyState icon={CalendarDays} title="Nenhuma semana planejada" />
          </div>
        ))}
    </div>
  );
}
