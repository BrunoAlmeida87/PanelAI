// Lista da semana: gerada a partir do cardápio, comparada com o estoque.
// No celular, cada linha é um alvo grande: tocar marca/desmarca; o botão "⋯" abre os detalhes.

import { useMemo, useState } from 'preact/hooks';
import {
  ChevronRight,
  Copy,
  MessageCircle,
  MoreHorizontal,
  MoreVertical,
  PackageCheck,
  Plus,
  Printer,
  ShoppingCart,
  Info,
  RotateCcw,
  Trash2,
  Home,
  Package,
  CircleCheck,
  CalendarDays,
} from 'lucide-preact';
import { useStore } from '../storage/store.js';
import { useWeekShopping } from './useWeekData.js';
import {
  setChecked,
  setOverride,
  setMissing,
  addExtra,
  updateExtra,
  removeExtra,
  clearChecked,
  registerPurchase,
  updateSettings,
} from '../storage/actions.js';
import { categoryColor, categoryLabel, slotLabel } from '../models/constants.js';
import { formatQty, unitLabel, factorToBase, roundForPurchase, convert } from '../models/units.js';
import { purchasableLines } from '../services/shopping.js';
import { shoppingToText, whatsappUrl, copyText } from '../services/share.js';
import { formatDayMonth, formatWeekRange, weekdayName, weekdayShort, WEEKDAY_SHORT, todayISO } from '../utils/dates.js';
import { normalizeText } from '../utils/id.js';
import { usePref } from '../utils/hooks.js';
import { Modal, Menu, Progress, Stepper, Chip, toast, confirmDialog, EmptyState } from '../components/ui.jsx';
import { navigate } from '../utils/router.js';

const EXTRA_UNITS = ['un', 'kg', 'g', 'l', 'ml', 'pacote', 'caixa', 'lata', 'maco', 'rolo'];
const MARKET_ORDER = [1, 2, 3, 4, 5, 6, 0];

function marketTitle(date, weekId) {
  if (!date) return 'Para a semana';
  const before = date < weekId;
  return `${weekdayName(date)} ${formatDayMonth(date)}${before ? ' (antes da semana)' : ''}`;
}

function sourcesSummary(sources) {
  const names = new Map();
  for (const src of sources) {
    const key = src.recipeName;
    if (!names.has(key)) names.set(key, new Set());
    names.get(key).add(weekdayShort(src.date));
  }
  return [...names.entries()].map(([n, days]) => `${n} (${[...days].join(', ')})`).join(' · ');
}

export function ShoppingPage({ weekId }) {
  const s = useStore();
  const { list, groups } = useWeekShopping(weekId);
  const [hideChecked, setHideChecked] = usePref('hideChecked', false);
  const [filter, setFilter] = useState('all');
  const [detail, setDetail] = useState(null); // item key
  const [extraEdit, setExtraEdit] = useState(null);
  const [registerOpen, setRegisterOpen] = useState(false);

  if (!list) return null;
  const { summary } = list;
  const purchasable = purchasableLines(list);
  const shownGroups = groups.filter((g) => filter === 'all' || (g.marketDate ?? 'none') === filter);

  const toggle = (entry) => {
    const next = !entry.checked;
    if (entry.type === 'extra') updateExtra(weekId, entry.id, { checked: next });
    else setChecked(weekId, entry.key, next);
  };

  const text = () => shoppingToText({ weekId, groups });
  const share = {
    copy: async () => {
      const ok = await copyText(text());
      toast(ok ? 'Lista copiada' : 'Não foi possível copiar', ok ? {} : { type: 'error' });
    },
    whatsapp: () => window.open(whatsappUrl(text()), '_blank', 'noopener'),
    print: () => window.print(),
    uncheckAll: async () => {
      const ok = await confirmDialog({ title: 'Desmarcar tudo', message: 'Desmarcar todos os itens da lista desta semana?', confirmLabel: 'Desmarcar' });
      if (ok) clearChecked(weekId);
    },
  };

  const detailItem = detail ? [...list.items, ...list.monthly].find((i) => i.key === detail) : null;

  return (
    <div>
      <div class="page-head">
        <div class="grow">
          <h1>Lista da semana</h1>
          <p class="sub">{formatWeekRange(weekId)} · gerada a partir do cardápio e do estoque</p>
        </div>
        <div class="toolbar">
          <button type="button" class="btn btn-secondary hide-mobile" onClick={share.copy}>
            <Copy size={16} /> Copiar
          </button>
          <button type="button" class="btn btn-secondary" onClick={share.whatsapp}>
            <MessageCircle size={16} /> <span class="hide-mobile">WhatsApp</span>
          </button>
          <Menu trigger={(p) => <button type="button" class="icon-btn bordered" aria-label={p.label} aria-expanded={p.open} onClick={p.toggle}><MoreHorizontal size={18} /></button>}>
            <button type="button" role="menuitem" onClick={share.copy}><Copy size={16} /> Copiar lista</button>
            <button type="button" role="menuitem" onClick={share.print}><Printer size={16} /> Imprimir</button>
            <hr />
            <button type="button" role="menuitem" onClick={share.uncheckAll}><RotateCcw size={16} /> Desmarcar tudo</button>
          </Menu>
        </div>
      </div>

      <div class="shop-sticky">
        <div class="card shop-progress">
          <div class="row">
            <strong>{summary.remaining}</strong>
            <span class="muted grow-text">
              {summary.remaining === 1 ? 'restante' : 'restantes'} · {summary.done}/{summary.total} no carrinho
            </span>
            <button type="button" class="btn btn-primary btn-sm" disabled={!purchasable.length} onClick={() => setRegisterOpen(true)} title="Lançar os itens marcados no estoque">
              <PackageCheck size={16} /> <span class="hide-mobile">Registrar compra</span>
              <span class="only-mobile">Registrar</span>
              {purchasable.length ? ` (${purchasable.length})` : ''}
            </button>
          </div>
          <Progress value={summary.total ? summary.done / summary.total : 0} label="Itens comprados" />
        </div>
      </div>

      <div class="shop-options">
        <label class="switch small">
          <input type="checkbox" checked={hideChecked} onChange={(e) => setHideChecked(e.currentTarget.checked)} />
          Ocultar comprados
        </label>
        <MarketDaysEditor settings={s.settings} />
      </div>

      {list.marketDates.length > 1 && (
        <div class="chip-row scroll" role="group" aria-label="Filtrar por dia de mercado" style="margin-top:12px">
          <Chip pressed={filter === 'all'} onClick={() => setFilter('all')}>Todos</Chip>
          {groups.map((g) => (
            <Chip key={g.marketDate ?? 'none'} pressed={filter === (g.marketDate ?? 'none')} onClick={() => setFilter(g.marketDate ?? 'none')}>
              {g.marketDate ? `${weekdayShort(g.marketDate)} ${formatDayMonth(g.marketDate)}` : 'Semana'}
            </Chip>
          ))}
        </div>
      )}

      {summary.total === 0 && (
        <div class="card" style="margin-top:16px">
          <EmptyState
            icon={ShoppingCart}
            title="Nada a comprar nesta semana"
            action={
              <button type="button" class="btn btn-soft" onClick={() => navigate('/cardapio')}>
                Ir para o cardápio
              </button>
            }
          >
            {list.covered.length ? 'O estoque já cobre todas as receitas planejadas.' : 'Planeje refeições no cardápio para gerar a lista automaticamente.'}
          </EmptyState>
        </div>
      )}

      {shownGroups.map((g) => {
        const entries = g.categories.flatMap((c) => c.entries);
        const remaining = entries.filter((e) => !e.checked).length;
        return (
          <section class="market-group" key={g.marketDate ?? 'none'} aria-label={marketTitle(g.marketDate, weekId)}>
            <h2>
              <ShoppingCart size={18} color="#52765D" /> {marketTitle(g.marketDate, weekId)}
              <span class="sub">{remaining} de {entries.length} a comprar</span>
            </h2>
            <div class="cat-columns">
              {g.categories.map((c) => {
                const visible = c.entries.filter((e) => !hideChecked || !e.checked);
                if (!visible.length) return null;
                const left = c.entries.filter((e) => !e.checked).length;
                return (
                  <details class="cat-block" open key={c.category}>
                    <summary>
                      <i class="dot" style={`background:${categoryColor(c.category)}`} />
                      {categoryLabel(c.category)}
                      <span class="count">{left ? `${left} ${left === 1 ? 'restante' : 'restantes'}` : 'completo'}</span>
                      <ChevronRight size={16} class="chev" />
                    </summary>
                    {visible.map((e) => (
                      <ShopRow
                        key={e.key}
                        entry={e}
                        onToggle={() => toggle(e)}
                        onMore={() => (e.type === 'extra' ? setExtraEdit(e.id) : e.type === 'item' ? setDetail(e.key) : setMissing(weekId, e.key, false))}
                      />
                    ))}
                  </details>
                );
              })}
            </div>
          </section>
        );
      })}

      <ExtraForm weekId={weekId} marketDates={list.marketDates} />

      {list.toCheck.length > 0 && (
        <section class="section">
          <details class="cat-block" open={list.toCheck.some((t) => !t.missing)}>
            <summary>
              <Home size={16} /> Confira na despensa
              <span class="count">{list.toCheck.length}</span>
              <ChevronRight size={16} class="chev" />
            </summary>
            <p class="small muted" style="padding:0 14px 10px">Temperos "a gosto" usados no cardápio e sem estoque registrado. Se faltar, marque para entrar na lista.</p>
            <ul class="mini-list">
              {list.toCheck.map((t) => (
                <li key={t.key}>
                  <span>
                    <strong>{t.name}</strong>
                    <span class="xsmall muted" style="display:block">{sourcesSummary(t.sources)}</span>
                  </span>
                  <button type="button" class={`btn btn-sm ${t.missing ? 'btn-soft' : 'btn-secondary'}`} aria-pressed={t.missing} onClick={() => setMissing(weekId, t.key, !t.missing)}>
                    {t.missing ? 'Na lista' : 'Faltando'}
                  </button>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}

      {list.monthly.length > 0 && (
        <section class="section">
          <details class="cat-block">
            <summary>
              <Package size={16} /> Do mercado do mês
              <span class="count">{list.monthly.length}</span>
              <ChevronRight size={16} class="chev" />
            </summary>
            <p class="small muted" style="padding:0 14px 10px">
              Itens de compra recorrente. A necessidade da semana já entra na reposição do Mercado do mês, para não comprar em dobro.
            </p>
            <ul class="mini-list">
              {list.monthly.map((i) => (
                <li key={i.key}>
                  <button type="button" class="btn btn-ghost btn-sm" style="justify-content:flex-start;padding-left:0" onClick={() => setDetail(i.key)}>
                    {i.name}
                  </button>
                  <span class="small num" style={i.shortage > 0 ? 'color:var(--coral-dark);font-weight:600' : 'color:var(--text-2)'}>
                    {i.shortage > 0 ? `falta ${formatQty(i.shortage, i.unit)}` : `usa ${formatQty(i.need, i.unit)} · ok`}
                  </span>
                </li>
              ))}
            </ul>
            <div style="padding:10px 14px">
              <a class="btn btn-soft btn-sm" href="#/despensa/mercado">Abrir Mercado do mês</a>
            </div>
          </details>
        </section>
      )}

      {list.covered.length > 0 && (
        <section class="section">
          <details class="cat-block">
            <summary>
              <CircleCheck size={16} /> Já coberto pelo estoque
              <span class="count">{list.covered.length}</span>
              <ChevronRight size={16} class="chev" />
            </summary>
            <ul class="mini-list">
              {list.covered.map((i) => (
                <li key={i.key}>
                  <button type="button" class="btn btn-ghost btn-sm" style="justify-content:flex-start;padding-left:0" onClick={() => setDetail(i.key)}>
                    {i.name}
                  </button>
                  <span class="small muted num">
                    usa {formatQty(i.need, i.unit)}{i.overridden ? ' · marcado "já tenho"' : ` · tem ${formatQty(i.stock ?? 0, i.unit)}`}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </section>
      )}

      <PrintableList weekId={weekId} groups={groups} />

      {detailItem && <ItemDetail weekId={weekId} item={detailItem} onClose={() => setDetail(null)} />}
      {extraEdit && <ExtraDetail weekId={weekId} extra={list.extras.find((e) => e.id === extraEdit)} onClose={() => setExtraEdit(null)} />}
      {registerOpen && <RegisterModal weekId={weekId} lines={purchasable} onClose={() => setRegisterOpen(false)} />}
    </div>
  );
}

function ShopRow({ entry: e, onToggle, onMore }) {
  const qty =
    e.type === 'item' ? formatQty(e.toBuy, e.unit) : e.type === 'extra' ? (e.qty ? formatQty(e.qty, e.unit) : '') : 'conferir';
  const from = e.type === 'item' ? sourcesSummary(e.sources) : e.type === 'extra' ? (e.registered ? 'Avulso · registrado no estoque' : 'Avulso') : 'Faltando na despensa';
  return (
    <div class={`shop-item ${e.checked ? 'checked' : ''}`}>
      <button type="button" class="toggle" role="checkbox" aria-checked={e.checked ? 'true' : 'false'} onClick={onToggle}>
        <input type="checkbox" class="check lg" checked={e.checked} tabIndex={-1} aria-hidden="true" />
        <span class="names">
          <span class="name">{e.name}</span>
          <span class="from">{from}</span>
        </span>
        <span class="qty">
          {qty}
          {e.type === 'item' && e.stock > 0 && <small>tem {formatQty(e.stock, e.unit)}</small>}
          {e.type === 'item' && e.overridden && <small>ajustado</small>}
        </span>
      </button>
      <button type="button" class="more" onClick={onMore} aria-label={`Detalhes de ${e.name}`}>
        {e.type === 'check' ? <Trash2 size={18} /> : <MoreVertical size={18} />}
      </button>
    </div>
  );
}

function MarketDaysEditor({ settings }) {
  const [open, setOpen] = useState(false);
  const toggle = (d) => {
    const set = new Set(settings.marketDays);
    if (set.has(d)) set.delete(d);
    else set.add(d);
    updateSettings({ marketDays: [...set].sort() });
  };
  const label = MARKET_ORDER.filter((d) => settings.marketDays.includes(d)).map((d) => WEEKDAY_SHORT[d]).join(', ') || 'nenhum';
  return (
    <div class="market-days">
      <button type="button" class="btn btn-ghost btn-sm" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <CalendarDays size={14} /> Dias de mercado: <strong>{label}</strong>
      </button>
      {open && (
        <div class="chip-row" role="group" aria-label="Dias de mercado" style="width:100%">
          {MARKET_ORDER.map((d) => (
            <Chip key={d} pressed={settings.marketDays.includes(d)} onClick={() => toggle(d)} aria-label={`Mercado ${WEEKDAY_SHORT[d]}`}>
              {WEEKDAY_SHORT[d]}
            </Chip>
          ))}
        </div>
      )}
    </div>
  );
}

function ExtraForm({ weekId, marketDates }) {
  const s = useStore();
  const [name, setName] = useState('');
  const [qty, setQty] = useState('1');
  const [unit, setUnit] = useState('un');
  const [market, setMarket] = useState('');
  const options = useMemo(() => Object.values(s.ingredients).map((i) => i.name).sort((a, b) => a.localeCompare(b, 'pt-BR')), [s.ingredients]);

  const submit = (e) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return toast('Informe o nome do item', { type: 'error' });
    const q = Number(String(qty).replace(',', '.'));
    if (qty !== '' && !(q > 0)) return toast('Quantidade inválida', { type: 'error' });
    const ing = Object.values(s.ingredients).find((i) => normalizeText(i.name) === normalizeText(n));
    const linked = ing && factorToBase(unit, ing) != null ? ing.id : null;
    addExtra(weekId, {
      name: ing?.name ?? n,
      qty: qty === '' ? null : q,
      unit,
      category: ing?.category ?? 'outros',
      ingredientId: linked,
      marketDate: market || marketDates[0] || null,
    });
    setName('');
    setQty('1');
    toast(`${ing?.name ?? n} adicionado`);
  };

  return (
    <section class="section card card-pad" aria-labelledby="avulso-title">
      <h2 class="section-title" id="avulso-title" style="margin-bottom:4px">
        <Plus size={18} /> Adicionar avulso
      </h2>
      <p class="small muted" style="margin-bottom:12px">Papel-toalha, frutas, iogurte… o que não vem das receitas.</p>
      <form class="extra-form" onSubmit={submit}>
        <label class="field name-field">
          <span class="label">Item</span>
          <input class="input" list="catalog-names" value={name} maxLength={80} placeholder="Ex.: Banana" onInput={(e) => setName(e.currentTarget.value)} />
          <datalist id="catalog-names">
            {options.map((o) => (
              <option key={o} value={o} />
            ))}
          </datalist>
        </label>
        <label class="field">
          <span class="label">Qtd.</span>
          <input class="input" inputMode="decimal" value={qty} onInput={(e) => setQty(e.currentTarget.value)} />
        </label>
        <label class="field">
          <span class="label">Unidade</span>
          <select class="select" value={unit} onChange={(e) => setUnit(e.currentTarget.value)}>
            {EXTRA_UNITS.map((u) => (
              <option key={u} value={u}>{unitLabel(u)}</option>
            ))}
          </select>
        </label>
        {marketDates.length > 0 && (
          <label class="field span-mobile">
            <span class="label">Comprar em</span>
            <select class="select" value={marketDates.includes(market) ? market : marketDates[0]} onChange={(e) => setMarket(e.currentTarget.value)}>
              {marketDates.map((d) => (
                <option key={d} value={d}>{weekdayShort(d)} {formatDayMonth(d)}{d < weekId ? ' (antes)' : ''}</option>
              ))}
            </select>
          </label>
        )}
        <button type="submit" class="btn btn-primary span-mobile">
          <Plus size={16} /> Pôr na lista
        </button>
      </form>
    </section>
  );
}

function ItemDetail({ weekId, item, onClose }) {
  const [qty, setQty] = useState(item.toBuy);
  return (
    <Modal
      open
      onClose={onClose}
      title={item.name}
      subtitle={`${categoryLabel(item.category)}${item.monthly ? ' · item do mercado do mês' : ''}`}
      footer={
        item.monthly ? (
          <button type="button" class="btn btn-secondary" onClick={onClose}>Fechar</button>
        ) : (
          <>
            {item.overridden && (
              <button type="button" class="btn btn-ghost keep" onClick={() => { setOverride(weekId, item.key, null); onClose(); toast('Quantidade sugerida restaurada'); }}>
                <RotateCcw size={16} /> <span class="hide-mobile">Restaurar sugestão</span>
              </button>
            )}
            <span class="spacer hide-mobile" />
            <button type="button" class="btn btn-secondary" onClick={() => { setOverride(weekId, item.key, 0); onClose(); toast(`${item.name}: marcado como "já tenho"`); }}>
              <Home size={16} /> Já tenho
            </button>
            <button type="button" class="btn btn-primary" onClick={() => { setOverride(weekId, item.key, qty); onClose(); toast('Quantidade ajustada'); }}>
              Salvar
            </button>
          </>
        )
      }
    >
      <div class="kv">
        <div>
          <span>Necessário</span>
          <strong>{formatQty(item.need, item.unit)}</strong>
        </div>
        <div>
          <span>Em estoque</span>
          <strong>{item.stock == null ? '—' : formatQty(item.stock, item.unit)}</strong>
        </div>
        <div>
          <span>{item.monthly ? 'Falta' : 'Sugestão'}</span>
          <strong>{formatQty(item.monthly ? roundForPurchase(item.shortage, item.unit) : item.suggested, item.unit)}</strong>
        </div>
      </div>
      {item.stock == null && <p class="small muted" style="margin-bottom:12px">Sem estoque registrado na despensa para este item.</p>}
      {!item.monthly && (
        <div class="field" style="margin-bottom:16px">
          <span class="label">Quantidade a comprar</span>
          <Stepper value={qty} min={0} step={item.unit === 'g' || item.unit === 'ml' ? 100 : 1} unit={unitLabel(item.unit)} label="Quantidade a comprar" decimals={item.unit === 'g' || item.unit === 'ml' ? 0 : 2} onChange={setQty} />
          <span class="hint">Ajuste manual. A sugestão volta a ser usada se você restaurar.</span>
        </div>
      )}
      <h3 class="label" style="display:flex;gap:6px;align-items:center;margin-bottom:6px">
        <Info size={14} /> De onde vem
      </h3>
      <ul class="trace" style="list-style:none;padding:0;margin:0">
        {item.sources.map((src, i) => (
          <li key={i}>
            <span>
              <strong>{weekdayName(src.date)}</strong>
              {src.slot ? ` · ${slotLabel(src.slot)}` : ' · preparo de marmita'}
              <span class="muted" style="display:block">{src.recipeName}</span>
            </span>
            <span class="num nowrap">{formatQty(src.qty, src.unit)}</span>
          </li>
        ))}
        <li>
          <strong>Total</strong>
          <strong class="num">{formatQty(item.need, item.unit)}</strong>
        </li>
      </ul>
    </Modal>
  );
}

function ExtraDetail({ weekId, extra, onClose }) {
  const [qty, setQty] = useState(extra?.qty ?? 1);
  if (!extra) return null;
  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title={extra.name}
      subtitle="Item avulso"
      footer={
        <>
          <button type="button" class="btn btn-danger-ghost keep" onClick={() => { removeExtra(weekId, extra.id); onClose(); toast('Item removido'); }}>
            <Trash2 size={16} /> Remover
          </button>
          <span class="spacer hide-mobile" />
          <button type="button" class="btn btn-primary" onClick={() => { updateExtra(weekId, extra.id, { qty }); onClose(); }}>
            Salvar
          </button>
        </>
      }
    >
      <div class="field">
        <span class="label">Quantidade</span>
        <Stepper value={qty} min={0} unit={unitLabel(extra.unit)} label="Quantidade" onChange={setQty} />
      </div>
      <p class="small muted" style="margin-top:12px">
        {extra.ingredientId
          ? 'Ligado a um produto do catálogo: ao registrar a compra, entra no estoque.'
          : 'Não está ligado ao catálogo: não altera o estoque.'}
      </p>
    </Modal>
  );
}

function RegisterModal({ weekId, lines, onClose }) {
  const s = useStore();
  const [qtys, setQtys] = useState(() => Object.fromEntries(lines.map((l) => [l.key, l.qty])));
  const [busy, setBusy] = useState(false);
  const confirm = () => {
    if (busy) return;
    setBusy(true);
    const final = lines.map((l) => ({ ...l, qty: qtys[l.key] }));
    const { purchase, errors } = registerPurchase({
      lines: final,
      type: 'semanal',
      weekId,
      extrasRegistered: final.filter((l) => l.source === 'extra').map((l) => l.key),
    });
    onClose();
    if (errors.length) toast(errors[0], { type: 'error' });
    toast(`Estoque atualizado com ${purchase.items.length} itens`);
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Registrar compra"
      subtitle="Confirme as quantidades compradas para atualizar a despensa"
      footer={
        <>
          <button type="button" class="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" class="btn btn-primary" disabled={busy} onClick={confirm}>
            <PackageCheck size={16} /> Atualizar estoque
          </button>
        </>
      }
    >
      <p class="small muted" style="margin-bottom:12px">
        Apenas itens marcados entram. Depois do registro eles passam a "coberto pelo estoque", então não há lançamento em dobro.
      </p>
      <ul class="mini-list" style="margin:0 -20px">
        {lines.map((l) => {
          const p = s.pantry[l.ingredientId];
          const ing = s.ingredients[l.ingredientId];
          const inPantry = p ? convert(qtys[l.key], l.unit, p.unit, ing) : null;
          return (
            <li key={l.key} style="padding-inline:20px;flex-wrap:wrap">
              <span style="flex:1;min-width:140px">
                <strong>{l.name}</strong>
                {p && inPantry != null && p.unit !== l.unit && (
                  <span class="xsmall muted" style="display:block">= {formatQty(inPantry, p.unit)} no estoque</span>
                )}
              </span>
              <Stepper
                size="sm"
                value={qtys[l.key]}
                min={0}
                step={l.unit === 'g' || l.unit === 'ml' ? 100 : 1}
                decimals={l.unit === 'g' || l.unit === 'ml' ? 0 : 2}
                unit={unitLabel(l.unit)}
                label={`Quantidade de ${l.name}`}
                onChange={(v) => setQtys((q) => ({ ...q, [l.key]: v }))}
              />
            </li>
          );
        })}
      </ul>
    </Modal>
  );
}

function PrintableList({ weekId, groups }) {
  return (
    <div class="print-only" aria-hidden="true">
      <h1>Lista de compras — {formatWeekRange(weekId)}</h1>
      {groups.map((g) => (
        <div key={g.marketDate ?? 'none'} class="print-group">
          <h2>{marketTitle(g.marketDate, weekId)}</h2>
          {g.categories.map((c) => (
            <div key={c.category} class="print-cat">
              <h3>{categoryLabel(c.category)}</h3>
              <ul>
                {c.entries.map((e) => (
                  <li key={e.key}>
                    ☐ {e.name} {e.type === 'item' ? `— ${formatQty(e.toBuy, e.unit)}` : e.qty ? `— ${formatQty(e.qty, e.unit)}` : ''}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ))}
      <p class="print-foot">Gerado pelo PanelAI em {formatDayMonth(todayISO())}</p>
    </div>
  );
}

