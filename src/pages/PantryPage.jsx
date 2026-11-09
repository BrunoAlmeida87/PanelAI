// Despensa e Mercado do mês: ESTOQUE | CONTAGEM | NO MERCADO.

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  AlertTriangle,
  ChevronRight,
  ClipboardCheck,
  Copy,
  MessageCircle,
  Package,
  PackageCheck,
  Pencil,
  Plus,
  Search,
  ShoppingBasket,
  Trash2,
  Repeat,
} from 'lucide-preact';
import { useStore } from '../storage/store.js';
import {
  savePantryItem,
  deletePantryItem,
  saveIngredient,
  saveCountDraft,
  confirmCount,
  setMonthlyChecked,
  setMonthlyQty,
  finalizeMonthly,
  resetMonthly,
} from '../storage/actions.js';
import { CATEGORIES, categoryColor, categoryLabel } from '../models/constants.js';
import { compatibleUnits, convert, formatNumber, formatQty, parseQty, unitLabel, UNITS } from '../models/units.js';
import { isBelowMin, monthlyList, newPantryItem } from '../services/pantry.js';
import { monthlyToText, whatsappUrl, copyText } from '../services/share.js';
import { formatDateTime, formatWeekRange } from '../utils/dates.js';
import { normalizeText } from '../utils/id.js';
import { useIsDesktop } from '../utils/hooks.js';
import { navigate } from '../utils/router.js';
import { Modal, Stepper, Chip, Segmented, toast, confirmDialog, EmptyState } from '../components/ui.jsx';
import { useWeekShopping } from './useWeekData.js';

const TABS = [
  { id: 'estoque', label: 'Estoque', icon: Package },
  { id: 'contagem', label: 'Contagem', icon: ClipboardCheck },
  { id: 'mercado', label: 'No mercado', icon: ShoppingBasket },
];

export function stepFor(unit) {
  if (unit === 'g' || unit === 'ml') return 100;
  if (unit === 'kg' || unit === 'l') return 0.5;
  return 1;
}

export function PantryPage({ tab, weekId }) {
  const [editing, setEditing] = useState(null); // ingredientId | 'new' | 'new-monthly'
  return (
    <div>
      <div class="page-head">
        <div class="grow">
          <h1>Mercado do mês</h1>
          <p class="sub">Despensa, contagem e compras recorrentes</p>
        </div>
        <button type="button" class="btn btn-primary" onClick={() => setEditing(tab === 'mercado' ? 'new-monthly' : 'new')}>
          <Plus size={16} /> Produto
        </button>
      </div>
      <div class="pantry-tabs">
        <Segmented options={TABS} value={tab} onChange={(id) => navigate(`/despensa/${id}`, { replace: true })} label="Visualização da despensa" block />
      </div>
      {tab === 'estoque' && <StockView onEdit={setEditing} />}
      {tab === 'contagem' && <CountView />}
      {tab === 'mercado' && <MarketView weekId={weekId} onEdit={setEditing} />}
      {editing && (
        <ProductModal
          ingredientId={editing.startsWith('new') ? null : editing}
          monthlyDefault={editing === 'new-monthly'}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  );
}

// ---------- Estoque ----------

function StockView({ onEdit }) {
  const s = useStore();
  const isDesktop = useIsDesktop();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [filter, setFilter] = useState('all');

  const items = useMemo(() => {
    const nq = normalizeText(q);
    return Object.values(s.pantry)
      .map((p) => ({ p, ing: s.ingredients[p.ingredientId] }))
      .filter(({ ing }) => ing)
      .filter(({ ing }) => !nq || normalizeText(ing.name).includes(nq))
      .filter(({ ing }) => !cat || ing.category === cat)
      .filter(({ p }) =>
        filter === 'low' ? isBelowMin(p) : filter === 'monthly' ? p.monthly : filter === 'empty' ? Number(p.qty) === 0 : true,
      )
      .sort((a, b) => a.ing.name.localeCompare(b.ing.name, 'pt-BR'));
  }, [s.pantry, s.ingredients, q, cat, filter]);

  const lowCount = Object.values(s.pantry).filter(isBelowMin).length;

  return (
    <>
      {lowCount > 0 && filter !== 'low' && (
        <button type="button" class="notice" style="width:100%;border:0;text-align:left;margin-bottom:12px;cursor:pointer" onClick={() => setFilter('low')}>
          <AlertTriangle size={18} /> {lowCount} {lowCount === 1 ? 'produto está' : 'produtos estão'} abaixo do estoque mínimo. Ver
        </button>
      )}
      <div class="filters-bar">
        <div class="search-input">
          <Search size={18} />
          <input class="input" type="search" data-search placeholder="Buscar produto" value={q} onInput={(e) => setQ(e.currentTarget.value)} aria-label="Buscar produto" />
        </div>
        <select class="select" style="width:auto" value={cat} onChange={(e) => setCat(e.currentTarget.value)} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {CATEGORIES.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </div>
      <div class="chip-row scroll" role="group" aria-label="Filtros" style="margin-bottom:12px">
        <Chip pressed={filter === 'all'} onClick={() => setFilter('all')}>Todos ({Object.keys(s.pantry).length})</Chip>
        <Chip pressed={filter === 'low'} onClick={() => setFilter('low')}>Abaixo do mínimo ({lowCount})</Chip>
        <Chip pressed={filter === 'monthly'} onClick={() => setFilter('monthly')}>Mercado do mês</Chip>
        <Chip pressed={filter === 'empty'} onClick={() => setFilter('empty')}>Zerados</Chip>
      </div>

      {items.length === 0 ? (
        <div class="card">
          <EmptyState icon={Package} title="Nenhum produto encontrado">
            Cadastre produtos para acompanhar o estoque e calcular a lista de compras.
          </EmptyState>
        </div>
      ) : isDesktop ? (
        <div class="card table-wrap">
          <table class="table stock-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th>Categoria</th>
                <th>Quantidade</th>
                <th>Mínimo</th>
                <th>Desejado</th>
                <th>Atualizado</th>
                <th><span class="sr-only">Ações</span></th>
              </tr>
            </thead>
            <tbody>
              {items.map(({ p, ing }) => (
                <tr key={p.ingredientId}>
                  <td class="name-cell">
                    <strong>{ing.name}</strong>
                    <span>
                      {p.monthly && 'Mercado do mês'}
                      {isBelowMin(p) && <span class="badge badge-danger" style="margin-left:6px">abaixo do mínimo</span>}
                    </span>
                  </td>
                  <td>
                    <span style="display:inline-flex;gap:6px;align-items:center">
                      <i class="dot" style={`background:${categoryColor(ing.category)}`} /> {categoryLabel(ing.category)}
                    </span>
                  </td>
                  <td>
                    <QtyControl item={p} name={ing.name} />
                  </td>
                  <td class="num">{p.min ? formatQty(p.min, p.unit) : '—'}</td>
                  <td class="num">{p.desired ? formatQty(p.desired, p.unit) : '—'}</td>
                  <td class="muted xsmall nowrap">{formatDateTime(p.updatedAt)}</td>
                  <td>
                    <button type="button" class="icon-btn sm" aria-label={`Editar ${ing.name}`} onClick={() => onEdit(p.ingredientId)}>
                      <Pencil size={16} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div class="stock-cards">
          {items.map(({ p, ing }) => (
            <article key={p.ingredientId} class="card stock-card">
              <div>
                <div class="sc-name">{ing.name}</div>
                <div class="sc-meta">
                  <i class="dot" style={`background:${categoryColor(ing.category)}`} /> {categoryLabel(ing.category)}
                  {p.monthly && <span class="badge badge-green">mensal</span>}
                  {isBelowMin(p) && <span class="badge badge-danger">abaixo do mínimo</span>}
                </div>
              </div>
              <button type="button" class="icon-btn" aria-label={`Editar ${ing.name}`} onClick={() => onEdit(p.ingredientId)}>
                <Pencil size={18} />
              </button>
              <div class="sc-controls">
                <QtyControl item={p} name={ing.name} />
                <span class="xsmall muted" style="text-align:right">
                  {p.desired ? `desejado ${formatQty(p.desired, p.unit)}` : ''}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

/** Stepper de quantidade com gravação agrupada (evita uma movimentação por toque). */
function QtyControl({ item, name }) {
  const [value, setValue] = useState(item.qty);
  const timer = useRef(null);
  const pendingFlush = useRef(null);
  const latest = useRef(item);
  latest.current = item;
  useEffect(() => setValue(item.qty), [item.qty]);
  // Ao sair da tela, grava o valor pendente imediatamente.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      pendingFlush.current?.();
    },
    [],
  );
  const change = (v) => {
    setValue(v);
    clearTimeout(timer.current);
    pendingFlush.current = () => {
      pendingFlush.current = null;
      if (v !== latest.current.qty) savePantryItem({ ...latest.current, qty: v });
    };
    timer.current = setTimeout(() => pendingFlush.current?.(), 700);
  };
  return (
    <Stepper
      value={value}
      min={0}
      step={stepFor(item.unit)}
      size="sm"
      unit={unitLabel(item.unit)}
      label={`Quantidade de ${name}`}
      decimals={item.unit === 'g' || item.unit === 'ml' ? 0 : 2}
      onChange={change}
    />
  );
}

// ---------- Contagem ----------

function CountView() {
  const s = useStore();
  const [draft, setDraft] = useState(() => ({ ...s.countDraft }));
  const [q, setQ] = useState('');
  const saveTimer = useRef(null);

  const groups = useMemo(() => {
    const nq = normalizeText(q);
    const map = new Map();
    for (const p of Object.values(s.pantry)) {
      const ing = s.ingredients[p.ingredientId];
      if (!ing || (nq && !normalizeText(ing.name).includes(nq))) continue;
      if (!map.has(ing.category)) map.set(ing.category, []);
      map.get(ing.category).push({ p, ing });
    }
    return CATEGORIES.filter((c) => map.has(c.id)).map((c) => ({
      cat: c,
      items: map.get(c.id).sort((a, b) => a.ing.name.localeCompare(b.ing.name, 'pt-BR')),
    }));
  }, [s.pantry, s.ingredients, q]);

  const update = (id, text) => {
    const next = { ...draft };
    if (text === '') delete next[id];
    else next[id] = text;
    setDraft(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveCountDraft(next), 500);
  };

  const parsed = Object.fromEntries(
    Object.entries(draft)
      .map(([id, t]) => [id, parseQty(t)])
      .filter(([id, n]) => n != null && n >= 0 && s.pantry[id]),
  );
  const invalid = Object.entries(draft).filter(([, t]) => parseQty(t) == null || parseQty(t) < 0).length;
  const total = Object.keys(s.pantry).length;
  const counted = Object.keys(parsed).length;
  const changes = Object.entries(parsed).filter(([id, n]) => Number(s.pantry[id].qty) !== n);

  const confirm = async () => {
    if (invalid) return toast('Corrija os valores inválidos antes de confirmar', { type: 'error' });
    const ok = await confirmDialog({
      title: 'Confirmar contagem',
      message: `${counted} produtos contados, ${changes.length} com quantidade diferente do registrado. O estoque será atualizado e as diferenças ficarão no histórico.`,
      confirmLabel: 'Atualizar estoque',
    });
    if (!ok) return;
    clearTimeout(saveTimer.current);
    const r = confirmCount(parsed);
    setDraft({});
    toast(`Contagem registrada · ${r.changed} ajustes`);
  };

  const discard = async () => {
    const ok = await confirmDialog({ title: 'Descartar contagem', message: 'Apagar os valores digitados?', confirmLabel: 'Descartar', danger: true });
    if (!ok) return;
    setDraft({});
    saveCountDraft({});
  };

  return (
    <>
      <p class="small muted" style="margin-bottom:12px">
        Percorra a despensa e digite o que realmente existe em casa. Campos em branco não mudam o estoque. O rascunho fica salvo se você sair desta tela.
      </p>
      <div class="filters-bar">
        <div class="search-input">
          <Search size={18} />
          <input class="input" type="search" data-search placeholder="Buscar produto" value={q} onInput={(e) => setQ(e.currentTarget.value)} aria-label="Buscar produto" />
        </div>
      </div>
      {total === 0 ? (
        <div class="card">
          <EmptyState icon={ClipboardCheck} title="Nenhum produto na despensa">Cadastre produtos para fazer a contagem.</EmptyState>
        </div>
      ) : (
        <div class="count-list">
          {groups.map((g) => (
            <details class="cat-block" open key={g.cat.id}>
              <summary>
                <i class="dot" style={`background:${g.cat.color}`} /> {g.cat.label}
                <span class="count">{g.items.filter(({ p }) => draft[p.ingredientId] != null).length}/{g.items.length}</span>
                <ChevronRight size={16} class="chev" />
              </summary>
              {g.items.map(({ p, ing }) => {
                const val = draft[p.ingredientId] ?? '';
                const n = parseQty(val);
                const diff = n != null && n !== Number(p.qty);
                return (
                  <div key={p.ingredientId} class={`count-row ${val !== '' ? 'counted' : ''} ${diff ? 'diff' : ''}`}>
                    <div>
                      <div class="cr-name">{ing.name}</div>
                      <div class="cr-reg">
                        registrado: {formatNumber(Number(p.qty), 2)} {unitLabel(p.unit)}
                        {diff ? ` → ${n > p.qty ? '+' : ''}${formatNumber(n - p.qty, 2)}` : ''}
                      </div>
                    </div>
                    <div class="cr-input">
                      <button type="button" class="btn btn-ghost btn-sm" onClick={() => update(p.ingredientId, formatNumber(Number(p.qty), 3))} aria-label={`Manter ${ing.name} como registrado`}>
                        =
                      </button>
                      <input
                        class="input"
                        inputMode="decimal"
                        value={val}
                        placeholder="—"
                        aria-label={`Quantidade contada de ${ing.name} em ${UNITS[p.unit]?.name ?? p.unit}`}
                        aria-invalid={val !== '' && (n == null || n < 0) ? 'true' : 'false'}
                        onInput={(e) => update(p.ingredientId, e.currentTarget.value)}
                      />
                      <span class="unit">{unitLabel(p.unit)}</span>
                    </div>
                  </div>
                );
              })}
            </details>
          ))}
        </div>
      )}
      <div class="sticky-actions">
        <span class="small" style="flex:1">
          <strong>{counted}</strong> de {total} contados{invalid ? <span style="color:var(--danger)"> · {invalid} inválidos</span> : ''}
        </span>
        <button type="button" class="btn btn-ghost" disabled={!Object.keys(draft).length} onClick={discard}>
          Descartar
        </button>
        <button type="button" class="btn btn-primary" disabled={!counted} onClick={confirm}>
          <ClipboardCheck size={16} /> Confirmar
        </button>
      </div>
    </>
  );
}

// ---------- No mercado (compra mensal) ----------

function MarketView({ weekId, onEdit }) {
  const s = useStore();
  const { demand } = useWeekShopping(weekId);
  const [showAll, setShowAll] = useState(false);
  const [busy, setBusy] = useState(false);
  const items = useMemo(() => monthlyList({ pantry: s.pantry, ingredientsById: s.ingredients, demand }), [s.pantry, s.ingredients, demand]);
  const session = s.monthlySession;
  const needed = items.filter((i) => i.suggested > 0 || session.checked[i.ingredientId]);
  const others = items.filter((i) => !(i.suggested > 0 || session.checked[i.ingredientId]));
  const checkedLines = items
    .filter((i) => session.checked[i.ingredientId])
    .map((i) => ({ ingredientId: i.ingredientId, name: i.name, qty: session.qty[i.ingredientId] ?? i.suggested, unit: i.unit }))
    .filter((l) => l.qty > 0);

  const byCat = (list) => {
    const map = new Map();
    for (const i of list) {
      if (!map.has(i.category)) map.set(i.category, []);
      map.get(i.category).push(i);
    }
    return CATEGORIES.filter((c) => map.has(c.id)).map((c) => ({ cat: c, items: map.get(c.id) }));
  };

  const text = () => monthlyToText(needed.filter((i) => i.suggested > 0));
  const finalize = async () => {
    if (busy || !checkedLines.length) return;
    const ok = await confirmDialog({
      title: 'Finalizar compra do mês',
      message: (
        <div>
          <p style="margin-bottom:8px">Os itens abaixo entram no estoque:</p>
          <ul class="small" style="margin:0;padding-left:18px">
            {checkedLines.map((l) => (
              <li key={l.ingredientId}>
                {l.name} — {formatQty(l.qty, l.unit)}
              </li>
            ))}
          </ul>
        </div>
      ),
      confirmLabel: 'Atualizar estoque',
    });
    if (!ok) return;
    setBusy(true);
    const r = finalizeMonthly(checkedLines);
    setBusy(false);
    if (r.duplicate) return toast('Esta compra já foi registrada', { type: 'error' });
    toast(`Compra registrada · ${r.purchase.items.length} itens no estoque`);
  };

  const Row = ({ i }) => {
    const checked = !!session.checked[i.ingredientId];
    const qty = session.qty[i.ingredientId] ?? i.suggested;
    return (
      <div class={`monthly-row ${checked ? 'checked' : ''}`}>
        <label>
          <input
            type="checkbox"
            class="check lg"
            checked={checked}
            onChange={(e) => setMonthlyChecked(i.ingredientId, e.currentTarget.checked, i.suggested)}
            aria-label={`Comprado: ${i.name}`}
          />
          <span>
            <span class="mr-name">{i.name}</span>
            <span class="mr-meta" style="display:block">
              tem {formatQty(i.stock, i.unit)} · desejado {formatQty(i.desired, i.unit)}
              {i.weekNeed > 0 && ` · cardápio usa ${formatQty(i.weekNeed, i.unit)}`}
              {i.belowMin && <span class="badge badge-danger" style="margin-left:6px">abaixo do mínimo</span>}
            </span>
          </span>
        </label>
        <span class="mr-qty">{i.suggested > 0 ? formatQty(i.suggested, i.unit) : '—'}</span>
        {checked && (
          <div class="mr-edit">
            <span class="xsmall muted">Comprei:</span>
            <Stepper size="sm" value={qty} min={0} step={stepFor(i.unit)} unit={unitLabel(i.unit)} label={`Quantidade comprada de ${i.name}`} onChange={(v) => setMonthlyQty(i.ingredientId, v)} />
          </div>
        )}
      </div>
    );
  };

  return (
    <>
      <div class="notice info" style="margin-bottom:12px">
        <Repeat size={18} />
        <span>
          Reposição = máximo(0, desejado + uso do cardápio de {formatWeekRange(weekId)} − estoque). Itens do mês não aparecem na lista da semana, evitando compra em dobro.
        </span>
      </div>
      <div class="toolbar" style="margin-bottom:12px">
        <button type="button" class="btn btn-secondary" onClick={async () => toast((await copyText(text())) ? 'Lista copiada' : 'Não foi possível copiar')}>
          <Copy size={16} /> Copiar
        </button>
        <button type="button" class="btn btn-secondary" onClick={() => window.open(whatsappUrl(text()), '_blank', 'noopener')}>
          <MessageCircle size={16} /> WhatsApp
        </button>
        <button type="button" class="btn btn-ghost" onClick={() => onEdit('new-monthly')}>
          <Plus size={16} /> Item recorrente
        </button>
      </div>

      {items.length === 0 ? (
        <div class="card">
          <EmptyState icon={ShoppingBasket} title="Nenhum item recorrente">
            Marque produtos como "compra recorrente" para montar o mercado do mês.
          </EmptyState>
        </div>
      ) : (
        <div class="count-list">
          {needed.length === 0 && <div class="notice ok">Tudo abastecido: nenhum item precisa de reposição.</div>}
          {byCat(needed).map((g) => (
            <section class="cat-block" key={g.cat.id} aria-label={g.cat.label}>
              <div class="cat-head">
                <i class="dot" style={`background:${g.cat.color}`} /> {g.cat.label}
              </div>
              {g.items.map((i) => (
                <Row key={i.ingredientId} i={i} />
              ))}
            </section>
          ))}
          {others.length > 0 && (
            <details class="cat-block" open={showAll} onToggle={(e) => setShowAll(e.currentTarget.open)}>
              <summary>
                Sem necessidade de reposição <span class="count">{others.length}</span>
                <ChevronRight size={16} class="chev" />
              </summary>
              {others.map((i) => (
                <Row key={i.ingredientId} i={i} />
              ))}
            </details>
          )}
        </div>
      )}

      <div class="sticky-actions">
        <span class="small" style="flex:1">
          <strong>{checkedLines.length}</strong> no carrinho
        </span>
        {Object.keys(session.checked).length > 0 && (
          <button type="button" class="btn btn-ghost" onClick={resetMonthly}>
            Limpar
          </button>
        )}
        <button type="button" class="btn btn-primary" disabled={!checkedLines.length || busy} onClick={finalize}>
          <PackageCheck size={16} /> Finalizar compra
        </button>
      </div>
    </>
  );
}

// ---------- Cadastro / edição de produto ----------

function ProductModal({ ingredientId, monthlyDefault, onClose }) {
  const s = useStore();
  const existing = ingredientId ? s.pantry[ingredientId] : null;
  const [mode, setMode] = useState(ingredientId ? 'existing' : 'catalog');
  const [pick, setPick] = useState(ingredientId ?? '');
  const [newName, setNewName] = useState('');
  const [newCat, setNewCat] = useState('mercearia');
  const [newBase, setNewBase] = useState('un');
  const ing = mode === 'new' ? { id: '', name: newName, category: newCat, baseUnit: newBase } : s.ingredients[pick];
  const units = ing ? compatibleUnits(ing) : ['un'];
  const [unit, setUnit] = useState(existing?.unit ?? '');
  const effUnit = units.includes(unit) ? unit : ing?.baseUnit ?? 'un';
  const [qty, setQty] = useState(existing?.qty ?? 0);
  const [min, setMin] = useState(existing?.min ?? 0);
  const [desired, setDesired] = useState(existing?.desired ?? 0);
  const [monthly, setMonthly] = useState(existing?.monthly ?? monthlyDefault);
  const [error, setError] = useState('');

  const available = Object.values(s.ingredients)
    .filter((i) => !s.pantry[i.id] && !i.ignoreStock)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));

  const save = () => {
    setError('');
    let target = ing;
    if (mode === 'new') {
      if (!newName.trim()) return setError('Informe o nome do produto.');
      const dup = Object.values(s.ingredients).find((i) => normalizeText(i.name) === normalizeText(newName));
      if (dup) return setError(`"${dup.name}" já existe no catálogo. Escolha-o na lista.`);
      target = saveIngredient({ name: newName.trim(), category: newCat, baseUnit: newBase });
    }
    if (!target) return setError('Escolha um produto.');
    if (min > desired && desired > 0) return setError('O estoque mínimo não pode ser maior que o desejado.');
    const base = existing ?? newPantryItem(target);
    const unitChanged = existing && existing.unit !== effUnit;
    savePantryItem({ ...base, ingredientId: target.id, qty, unit: effUnit, min, desired, monthly }, { recordMovement: !unitChanged });
    toast(existing ? 'Produto atualizado' : `${target.name} adicionado à despensa`);
    onClose();
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: 'Remover da despensa',
      message: `Remover "${ing?.name}" do controle de estoque? O produto continua no catálogo e nas receitas.`,
      confirmLabel: 'Remover',
      danger: true,
    });
    if (!ok) return;
    deletePantryItem(ingredientId);
    toast('Produto removido da despensa');
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={existing ? ing?.name : 'Adicionar produto'}
      subtitle={existing ? categoryLabel(ing?.category) : 'Escolha do catálogo ou crie um novo'}
      footer={
        <>
          {existing && (
            <button type="button" class="btn btn-danger-ghost keep" onClick={remove} aria-label="Remover da despensa">
              <Trash2 size={16} /> <span class="hide-mobile">Remover</span>
            </button>
          )}
          <span class="spacer hide-mobile" />
          <button type="button" class="btn btn-secondary hide-mobile" onClick={onClose}>Cancelar</button>
          <button type="button" class="btn btn-primary" onClick={save}>Salvar</button>
        </>
      }
    >
      <div class="form-grid cols-2">
        {!existing && (
          <div class="span-all">
            <Segmented
              options={[
                { id: 'catalog', label: 'Do catálogo' },
                { id: 'new', label: 'Novo produto' },
              ]}
              value={mode}
              onChange={setMode}
              label="Origem"
              block
            />
          </div>
        )}
        {mode === 'catalog' && (
          <label class="field span-all">
            <span class="label">Produto</span>
            <select class="select" value={pick} onChange={(e) => setPick(e.currentTarget.value)}>
              <option value="">Escolha…</option>
              {CATEGORIES.map((c) => {
                const opts = available.filter((i) => i.category === c.id);
                if (!opts.length) return null;
                return (
                  <optgroup key={c.id} label={c.label}>
                    {opts.map((i) => (
                      <option key={i.id} value={i.id}>{i.name}</option>
                    ))}
                  </optgroup>
                );
              })}
            </select>
          </label>
        )}
        {mode === 'new' && (
          <>
            <label class="field span-all">
              <span class="label">Nome</span>
              <input class="input" value={newName} maxLength={80} onInput={(e) => setNewName(e.currentTarget.value)} placeholder="Ex.: Amaciante" />
            </label>
            <label class="field">
              <span class="label">Categoria</span>
              <select class="select" value={newCat} onChange={(e) => setNewCat(e.currentTarget.value)}>
                {CATEGORIES.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </label>
            <label class="field">
              <span class="label">Medido em</span>
              <select class="select" value={newBase} onChange={(e) => setNewBase(e.currentTarget.value)}>
                {['un', 'g', 'ml', 'pacote', 'caixa', 'lata', 'rolo', 'maco'].map((u) => (
                  <option key={u} value={u}>{UNITS[u].name}</option>
                ))}
              </select>
            </label>
          </>
        )}
        {(ing || mode === 'new') && (
          <>
            <label class="field">
              <span class="label">Unidade do estoque</span>
              <select
                class="select"
                value={effUnit}
                disabled={mode === 'new'}
                onChange={(e) => {
                  const nu = e.currentTarget.value;
                  // Converte os valores para a nova unidade quando possível.
                  const c = (v) => {
                    const r = convert(v, effUnit, nu, ing);
                    return r == null ? v : Math.round(r * 1000) / 1000;
                  };
                  setQty(c(qty));
                  setMin(c(min));
                  setDesired(c(desired));
                  setUnit(nu);
                }}
              >
                {(mode === 'new' ? [newBase] : units).map((u) => (
                  <option key={u} value={u}>{UNITS[u].name}</option>
                ))}
              </select>
            </label>
            <div class="field">
              <span class="label">Quantidade em casa</span>
              <Stepper value={qty} min={0} step={stepFor(effUnit)} unit={unitLabel(effUnit)} label="Quantidade em casa" onChange={setQty} />
            </div>
            <div class="field">
              <span class="label">Estoque mínimo</span>
              <Stepper value={min} min={0} step={stepFor(effUnit)} unit={unitLabel(effUnit)} label="Estoque mínimo" onChange={setMin} />
            </div>
            <div class="field">
              <span class="label">Estoque desejado</span>
              <Stepper value={desired} min={0} step={stepFor(effUnit)} unit={unitLabel(effUnit)} label="Estoque desejado" onChange={setDesired} />
            </div>
            <label class="switch span-all">
              <input type="checkbox" checked={monthly} onChange={(e) => setMonthly(e.currentTarget.checked)} />
              <span>
                Compra recorrente (Mercado do mês)
                <span class="xsmall muted" style="display:block">Repor até o estoque desejado, considerando o uso do cardápio.</span>
              </span>
            </label>
          </>
        )}
        {error && <p class="form-error span-all" role="alert">{error}</p>}
      </div>
    </Modal>
  );
}
