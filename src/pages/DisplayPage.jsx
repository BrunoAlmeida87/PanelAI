// Display e-ink: editor visual do layout (o que aparece, onde e como).

import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import {
  ArrowDownToLine,
  ArrowUpToLine,
  Copy,
  Grid3x3,
  LayoutTemplate,
  Maximize2,
  MonitorSmartphone,
  MoreHorizontal,
  Plus,
  Trash2,
  Undo2,
  CheckCircle2,
  MapPin,
  Search,
  LocateFixed,
  Type,
  Eye,
  TriangleAlert,
  Pencil,
  ListChecks,
  Loader2,
  RefreshCw,
} from 'lucide-preact';
import { useStore } from '../storage/store.js';
import { createLayout, deleteLayout, duplicateLayout, requestScreenUpdate, saveLayout, setActiveLayout } from '../storage/displayActions.js';
import { isValidGithubToken } from '../display/github.js';
import {
  BORDERS,
  CARD_TYPES,
  COLOR_MODES,
  DEFAULT_TYPOGRAPHY,
  DISPLAY_FONTS,
  DISPLAY_MODELS,
  FONT_SCALES,
  FONT_WEIGHTS,
  INK_LEVELS,
  LETTER_SPACINGS,
  TYPE_SIZES,
  displayFont,
  inkThreshold,
  normalizeTypography,
  typographyCheck,
  LAYOUT_PRESETS,
  cardType,
  changeCardType,
  clampCard,
  hasRoomFor,
  defaultGrid,
  newCard,
  newLayout,
  overlappingIds,
  placeNewCard,
  presetCards,
  rescaleCards,
  screenSize,
} from '../display/model.js';
import { buildDisplayData } from '../display/data.js';
import { formatTimes, normalizeDisplayDevice } from '../display/schedule.js';
import { DisplayRender, cardTitle } from '../display/DisplayRender.jsx';
import { searchPlaces, useForecastsReady } from '../display/useWeather.js';
import { Chip, Menu, Modal, Segmented, Stepper, confirmDialog, toast } from '../components/ui.jsx';
import { formatDateTime } from '../utils/dates.js';
import { uid } from '../utils/id.js';
import { useNow } from '../utils/hooks.js';

/** Dados dos cards. `fixedNow` (Date) congela o relógio: a imagem gerada "para" um horário. */
function useDisplayData(fixedNow = null) {
  const s = useStore();
  const ticking = useNow();
  const now = fixedNow ?? ticking;
  const at = now.getTime();
  const real = ticking.getTime();
  return useMemo(
    () => buildDisplayData(s, now, ticking),
    [s.weeks, s.tasks, s.taskTemplates, s.recipes, s.marmitas, s.pantry, s.ingredients, s.settings, s.children, s.montessoriLogs, at, real],
  );
}

function useWidth(ref) {
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return width;
}

export function DisplayPage() {
  const s = useStore();
  const layouts = useMemo(() => Object.values(s.displayLayouts).sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1)), [s.displayLayouts]);
  const [currentId, setCurrentId] = useState(null);
  const created = useRef(false);

  // Primeiro acesso: cria um layout a partir da sugestão "Cozinha".
  useEffect(() => {
    if (!layouts.length && !created.current) {
      created.current = true;
      const l = createLayout({ name: 'Cozinha' });
      setCurrentId(l.id);
    }
  }, [layouts.length]);

  const layout = s.displayLayouts[currentId] ?? s.displayLayouts[s.settings.displayLayoutId] ?? layouts[0];
  if (!layout) return <p class="muted">Preparando o editor…</p>;
  return <Editor key={layout.id} layout={layout} layouts={layouts} activeId={s.settings.displayLayoutId} onSwitch={setCurrentId} />;
}

function Editor({ layout: stored, layouts, activeId, onSwitch }) {
  const data = useDisplayData();
  const [draft, setDraft] = useState(null); // durante arrastar/redimensionar
  const [selectedId, setSelectedId] = useState(null);
  const [showGrid, setShowGrid] = useState(true);
  // Prévia fiel: tamanho real (1 px da tela = 1 px) e preto e branco com o mesmo limiar do gerador.
  const [faithful, setFaithful] = useState(false);
  const [adding, setAdding] = useState(false);
  // Tela cheia ao adicionar: tipo escolhido, esperando a pessoa dizer qual card substituir.
  const [replaceFor, setReplaceFor] = useState(null);
  const inspectorRef = useRef(null);
  /** Seleciona um card e, no celular (painel embaixo da tela), leva o painel até as opções dele. */
  const selectCard = (id) => {
    setSelectedId(id);
    if (id && window.innerWidth < 1100) requestAnimationFrame(() => inspectorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };
  const [presets, setPresets] = useState(false);
  const undo = useRef([]);
  const [undoCount, setUndoCount] = useState(0);
  const stageRef = useRef(null);
  const stageWidth = useWidth(stageRef);

  const layout = draft ?? stored;
  const { w, h } = screenSize(layout);
  const maxH = typeof window !== 'undefined' ? Math.max(240, window.innerHeight * 0.68) : 600;
  const fitScale = stageWidth ? Math.min(1, (stageWidth - 48) / w, maxH / h) : 0.5;
  const scale = faithful ? 1 : fitScale;
  const threshold = inkThreshold(normalizeTypography(layout.typography).ink);
  const selected = layout.cards.find((c) => c.id === selectedId) ?? null;
  const overlapping = useMemo(() => overlappingIds(layout.cards), [layout.cards]);
  const isActive = activeId === layout.id;

  const commit = (next, { track = true } = {}) => {
    if (track) {
      undo.current = [...undo.current.slice(-39), stored];
      setUndoCount(undo.current.length);
    }
    setDraft(null);
    saveLayout(next);
  };
  const updateCard = (id, patch, opts) => commit({ ...layout, cards: layout.cards.map((c) => (c.id === id ? clampCard({ ...c, ...patch }, layout.grid) : c)) }, opts);
  const doUndo = () => {
    const prev = undo.current.pop();
    setUndoCount(undo.current.length);
    if (prev) saveLayout(prev);
  };

  // Atalhos: Ctrl+Z desfaz.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) {
        e.preventDefault();
        doUndo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // ---------- Arrastar / redimensionar ----------
  const drag = useRef(null);
  const cellStep = () => {
    const g = layout.grid;
    const cw = (w - 2 * g.padding - (g.cols - 1) * g.gap) / g.cols;
    const ch = (h - 2 * g.padding - (g.rows - 1) * g.gap) / g.rows;
    return { x: (cw + g.gap) * scale, y: (ch + g.gap) * scale };
  };
  const startDrag = (e, card, mode) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setSelectedId(card.id);
    e.currentTarget.setPointerCapture?.(e.pointerId);
    drag.current = { mode, startX: e.clientX, startY: e.clientY, card, step: cellStep(), moved: false };
  };
  const onMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = Math.round((e.clientX - d.startX) / d.step.x);
    const dy = Math.round((e.clientY - d.startY) / d.step.y);
    if (!dx && !dy && !d.moved) return;
    d.moved = true;
    const c = d.card;
    let next = c;
    if (d.mode === 'move') next = { ...c, x: c.x + dx, y: c.y + dy };
    else next = { ...c, w: d.mode === 's' ? c.w : c.w + dx, h: d.mode === 'e' ? c.h : c.h + dy };
    next = clampCard(next, layout.grid);
    setDraft({ ...stored, cards: stored.cards.map((x) => (x.id === c.id ? next : x)) });
  };
  const endDrag = () => {
    const d = drag.current;
    drag.current = null;
    if (d?.moved && draft) commit(draft);
    else {
      setDraft(null);
      // Toque sem arrastar: abre as opções do card.
      if (d && !d.moved) selectCard(d.card.id);
    }
  };

  const onBoxKey = (e, card) => {
    const k = e.key;
    const delta = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[k];
    if (delta) {
      e.preventDefault();
      if (e.shiftKey) updateCard(card.id, { w: card.w + delta[0], h: card.h + delta[1] });
      else updateCard(card.id, { x: card.x + delta[0], y: card.y + delta[1] });
    } else if (k === 'Delete' || k === 'Backspace') {
      e.preventDefault();
      removeCard(card.id);
    }
  };

  const removeCard = (id) => {
    commit({ ...layout, cards: layout.cards.filter((c) => c.id !== id) });
    setSelectedId(null);
    toast('Card removido', { action: { label: 'Desfazer', onClick: doUndo } });
  };

  const addCard = (type, { force = false } = {}) => {
    // Tela cheia: em vez de jogar o card novo por cima, pergunta qual card ele substitui.
    if (!force && !hasRoomFor(layout.cards, layout.grid, type)) {
      setAdding(false);
      setReplaceFor(type);
      return;
    }
    const card = placeNewCard(layout.cards, layout.grid, type);
    commit({ ...layout, cards: [...layout.cards, card] });
    setSelectedId(card.id);
    setAdding(false);
    setReplaceFor(null);
  };

  const swapCard = (id, type) => {
    commit({ ...layout, cards: layout.cards.map((c) => (c.id === id ? changeCardType(c, type) : c)) });
    toast(`Trocado por "${cardType(type)?.label}"`, { action: { label: 'Desfazer', onClick: doUndo } });
  };

  const applyPreset = async (preset) => {
    const ok = await confirmDialog({
      title: `Usar o layout "${preset.name}"`,
      message: 'Os cards atuais deste layout serão substituídos. Dá para desfazer depois.',
      confirmLabel: 'Usar layout',
    });
    if (!ok) return;
    const orientation = preset.orientation ?? layout.orientation;
    const grid = orientation === layout.orientation ? layout.grid : defaultGrid(orientation);
    commit({ ...layout, orientation, grid, cards: presetCards(preset, grid) });
    setSelectedId(null);
    setPresets(false);
  };

  const g = layout.grid;
  const guides = showGrid
    ? Array.from({ length: g.cols * g.rows }, (_, i) => (
        <div key={`g${i}`} class="eink-cell" style={{ gridColumn: `${(i % g.cols) + 1}`, gridRow: `${Math.floor(i / g.cols) + 1}`, pointerEvents: 'none' }} />
      ))
    : null;
  const boxes = layout.cards.map((card) => (
    <div
      key={card.id}
      class={`edit-box ${card.id === selectedId ? 'selected' : ''} ${overlapping.has(card.id) ? 'overlap' : ''}`}
      style={{ gridColumn: `${card.x + 1} / span ${card.w}`, gridRow: `${card.y + 1} / span ${card.h}` }}
      tabIndex={0}
      role="button"
      aria-label={`${cardTitle(card)}: coluna ${card.x + 1}, linha ${card.y + 1}, ${card.w} por ${card.h}. Setas movem, Shift+setas redimensionam.`}
      aria-pressed={card.id === selectedId ? 'true' : 'false'}
      onPointerDown={(e) => startDrag(e, card, 'move')}
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onFocus={() => setSelectedId(card.id)}
      onKeyDown={(e) => onBoxKey(e, card)}
    >
      {card.id === selectedId && (
        <>
          <span class="tag" style={{ transform: `scale(${1 / scale})`, transformOrigin: '0 0' }}>
            {cardTitle(card)} · {card.w}×{card.h}
          </span>
          {['e', 's', 'se'].map((m) => (
            <span
              key={m}
              class={`handle ${m}`}
              style={{ transform: `scale(${1 / scale})` }}
              onPointerDown={(e) => startDrag(e, card, m)}
              onPointerMove={onMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              aria-hidden="true"
            />
          ))}
        </>
      )}
    </div>
  ));

  return (
    <div>
      <div class="page-head">
        <div class="grow">
          <h1>Display</h1>
          <p class="sub">Escolha o que aparece na tela e-ink, onde e de que tamanho</p>
        </div>
        <a class="btn btn-secondary" href={`#/display/tela?id=${layout.id}`} target="_blank" rel="noopener">
          <Maximize2 size={16} /> Tela cheia
        </a>
      </div>

      <div class="display-toolbar">
        <select class="input" aria-label="Layout" value={layout.id} onChange={(e) => onSwitch(e.currentTarget.value)}>
          {layouts.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
              {l.id === activeId ? ' (no display)' : ''}
            </option>
          ))}
        </select>
        <button type="button" class="btn btn-primary" onClick={() => setAdding(true)}>
          <Plus size={16} /> Adicionar card
        </button>
        <button type="button" class="btn btn-secondary" onClick={() => setPresets(true)}>
          <LayoutTemplate size={16} /> Layouts sugeridos
        </button>
        <button type="button" class="btn btn-ghost" onClick={doUndo} disabled={!undoCount} title="Desfazer (Ctrl+Z)">
          <Undo2 size={16} /> Desfazer
        </button>
        <SendToScreen layoutId={layout.id} isActive={isActive} />
        <Chip pressed={showGrid} onClick={() => setShowGrid((v) => !v)}>
          <Grid3x3 size={14} /> Grade
        </Chip>
        <Chip pressed={faithful} onClick={() => setFaithful((v) => !v)} title="Tamanho real e só preto e branco, como no aparelho">
          <Eye size={14} /> Prévia fiel
        </Chip>
        <Menu
          trigger={(p) => (
            <button type="button" class="icon-btn" aria-label="Mais opções do layout" aria-expanded={p['aria-expanded']} onClick={p.toggle}>
              <MoreHorizontal size={20} />
            </button>
          )}
        >
          <button type="button" role="menuitem" onClick={() => onSwitch(createLayout({ name: `Layout ${layouts.length + 1}` }).id)}>
            <Plus size={16} /> Novo layout
          </button>
          <button type="button" role="menuitem" onClick={() => onSwitch(duplicateLayout(layout.id).id)}>
            <Copy size={16} /> Duplicar layout
          </button>
          <button
            type="button"
            role="menuitem"
            class="danger"
            disabled={layouts.length < 2}
            onClick={async () => {
              const ok = await confirmDialog({ title: 'Excluir layout', message: `Excluir "${layout.name}"?`, confirmLabel: 'Excluir', danger: true });
              if (ok) {
                deleteLayout(layout.id);
                onSwitch(null);
              }
            }}
          >
            <Trash2 size={16} /> Excluir layout
          </button>
        </Menu>
      </div>

      <div class="display-editor">
        <div>
          <div class={`display-stage ${faithful ? 'faithful' : ''}`} ref={stageRef} onPointerDown={(e) => e.target === e.currentTarget && setSelectedId(null)}>
            {faithful && <OneBitFilter id={`eink-1bit-${threshold}`} threshold={threshold} />}
            <DisplayRender
              layout={layout}
              data={data}
              scale={scale}
              filter={faithful ? `url(#eink-1bit-${threshold})` : null}
              overlay={
                faithful ? null : (
                  <>
                    {guides}
                    {boxes}
                  </>
                )
              }
            />
          </div>
          {faithful && (
            <p class="small muted" style="margin-top:8px">
              <Eye size={14} style="vertical-align:-2px" /> Prévia fiel: tamanho real, só preto e branco. No computador é idêntica ao aparelho; no celular a tela tem mais pixels,
              então as letras aparecem um pouco mais lisas do que vão ficar. Para mover os cards, desligue a prévia.
            </p>
          )}
          <p class="small muted" style="margin-top:8px">
            {w} × {h} px · grade {g.cols} × {g.rows} · arraste para mover, puxe as bolinhas para mudar o tamanho (no teclado: setas e Shift+setas).
            {overlapping.size > 0 && <strong style="color:var(--danger)"> Há cards sobrepostos (em vermelho).</strong>}
            {stored.updatedBy && ` Última alteração: ${stored.updatedBy}, ${formatDateTime(stored.updatedAt)}.`}
          </p>
        </div>

        <aside class="display-inspector card card-pad form-section" aria-label="Propriedades" ref={inspectorRef}>
          {selected ? (
            <CardInspector
              key={selected.id}
              card={selected}
              grid={g}
              onChange={(patch) => updateCard(selected.id, patch)}
              onRemove={() => removeCard(selected.id)}
              onDuplicate={() => {
                const copy = { ...structuredClone(selected), id: uid('card') };
                const spot = placeNewCard(layout.cards, g, selected.type);
                const placed = clampCard({ ...copy, x: spot.x, y: spot.y }, g);
                commit({ ...layout, cards: [...layout.cards, placed] });
                setSelectedId(placed.id);
              }}
              onOrder={(dir) => {
                const others = layout.cards.filter((c) => c.id !== selected.id);
                commit({ ...layout, cards: dir === 'front' ? [...others, selected] : [selected, ...others] });
              }}
              onClose={() => setSelectedId(null)}
            />
          ) : (
            <>
              <CardList cards={layout.cards} overlapping={overlapping} onSelect={selectCard} onRemove={removeCard} onSwap={swapCard} onAdd={() => setAdding(true)} />
              <div class="divider" />
              <ScreenInspector layout={layout} isActive={isActive} onChange={(next) => commit(next)} />
            </>
          )}
        </aside>
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} title="Adicionar card" subtitle="Escolha o que mostrar. Depois ajuste posição, tamanho e opções.">
        <div class="card-type-list">
          {CARD_TYPES.map((t) => {
            const n = layout.cards.filter((c) => c.type === t.id).length;
            return (
              <button key={t.id} type="button" onClick={() => addCard(t.id)}>
                <strong>
                  {t.label}
                  {n > 0 && <span class="badge" style="margin-left:8px;text-transform:none">já na tela{n > 1 ? ` (${n})` : ''}</span>}
                </strong>
                <span>{t.description}</span>
              </button>
            );
          })}
        </div>
      </Modal>

      <Modal
        open={!!replaceFor}
        onClose={() => setReplaceFor(null)}
        title="A tela está cheia"
        subtitle={replaceFor ? `Onde colocar "${cardType(replaceFor)?.label}"? Ele fica no lugar e no tamanho do card escolhido.` : ''}
      >
        <div class="card-type-list">
          {layout.cards.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                swapCard(c.id, replaceFor);
                setReplaceFor(null);
                setSelectedId(c.id);
              }}
            >
              <strong>No lugar de: {cardTitle(c)}</strong>
              <span>
                {cardType(c.type)?.label} · coluna {c.x + 1}, linha {c.y + 1} · {c.w} × {c.h}
              </span>
            </button>
          ))}
          <button type="button" onClick={() => addCard(replaceFor, { force: true })}>
            <strong>Colocar por cima (eu ajusto depois)</strong>
            <span>O card novo fica em vermelho até você mudar o tamanho dos outros para abrir espaço.</span>
          </button>
        </div>
      </Modal>

      <Modal open={presets} onClose={() => setPresets(false)} title="Layouts sugeridos" subtitle="Ponto de partida — depois você ajusta tudo." size="lg">
        <div class="preset-grid">
          {LAYOUT_PRESETS.map((p) => {
            const orientation = p.orientation ?? layout.orientation;
            const grid = orientation === layout.orientation ? layout.grid : defaultGrid(orientation);
            const preview = { ...layout, orientation, grid, cards: presetCards(p, grid) };
            const size = screenSize(preview);
            return (
              <button key={p.id} type="button" onClick={() => applyPreset(p)}>
                <DisplayRender layout={preview} data={data} scale={Math.min(300 / size.w, 200 / size.h)} />
                <strong>{p.name}</strong>
                <span class="p-desc">{p.description}</span>
              </button>
            );
          })}
        </div>
      </Modal>
    </div>
  );
}

/**
 * Atalho do "Atualizar a tela agora" (Configurações → Tela e-ink) no editor: pede ao GitHub a
 * imagem nova com este layout. Se o layout aberto não é o do display, passa a ser antes de pedir.
 * Só aparece com a nuvem (sem ela não há imagem publicada).
 */
function SendToScreen({ layoutId, isActive }) {
  const s = useStore();
  const [busy, setBusy] = useState(false);
  const [sentAt, setSentAt] = useState(0);
  if (s.mode !== 'cloud' || s.cloud?.readOnly) return null;
  const ready = isValidGithubToken(s.githubToken);
  const send = async () => {
    if (!ready) {
      toast('Falta a chave do GitHub: salve uma vez em Ajustes → Tela e-ink.', { type: 'error', action: { label: 'Abrir', onClick: () => (location.hash = '#/ajustes') } });
      return;
    }
    if (Date.now() - sentAt < 60_000) return toast('Pedido já enviado há menos de 1 minuto. A imagem fica pronta em uns 3 minutos.');
    if (!isActive) {
      const ok = await confirmDialog({
        title: 'Mandar este layout para a tela?',
        message: 'Ele passa a ser o layout do display (no lugar do atual) e a imagem nova é gerada agora.',
        confirmLabel: 'Usar e atualizar',
      });
      if (!ok) return;
      setActiveLayout(layoutId);
    }
    setBusy(true);
    const r = await requestScreenUpdate();
    setBusy(false);
    if (!r.ok) return toast(r.message, { type: 'error' });
    setSentAt(Date.now());
    toast('Pedido enviado ao GitHub. A imagem nova fica pronta em uns 3 minutos; a tela mostra na próxima conferência.');
  };
  return (
    <button type="button" class="btn btn-secondary" onClick={send} disabled={busy} title="Pede ao GitHub a imagem nova da tela agora">
      {busy ? <Loader2 size={16} class="spin" /> : <RefreshCw size={16} />} Atualizar a tela agora
    </button>
  );
}

/** Lista dos cards da tela: editar, trocar por outro tipo e tirar. */
function CardList({ cards, overlapping, onSelect, onRemove, onSwap, onAdd }) {
  return (
    <>
      <h2 class="section-title" style="margin:0;display:flex;gap:8px;align-items:center">
        <ListChecks size={18} /> Cards nesta tela
      </h2>
      <p class="small muted" style="margin:0">
        Para tirar um card, toque na lixeira. Para pôr outro no mesmo lugar (ex.: Montessori no lugar das tarefas), use "Trocar por".
      </p>
      <ul class="card-list" aria-label="Cards nesta tela">
        {cards.map((c) => (
          <li key={c.id} class={overlapping.has(c.id) ? 'overlap' : ''}>
            <div class="cl-head">
              <button type="button" class="cl-name" onClick={() => onSelect(c.id)} aria-label={`Editar ${cardTitle(c)}`}>
                <Pencil size={14} aria-hidden="true" />
                <span>
                  <strong>{cardTitle(c)}</strong>
                  <span class="hint">
                    {cardType(c.type)?.label} · {c.w} × {c.h}
                    {overlapping.has(c.id) ? ' · por cima de outro' : ''}
                  </span>
                </span>
              </button>
              <button type="button" class="icon-btn" aria-label={`Tirar ${cardTitle(c)} da tela`} title="Tirar da tela" onClick={() => onRemove(c.id)}>
                <Trash2 size={18} />
              </button>
            </div>
            <label class="cl-swap">
              <span class="hint">Trocar por</span>
              <select
                class="input"
                aria-label={`Trocar ${cardTitle(c)} por`}
                value=""
                onChange={(e) => {
                  const v = e.currentTarget.value;
                  e.currentTarget.value = '';
                  if (v) onSwap(c.id, v);
                }}
              >
                <option value="">Escolher…</option>
                {CARD_TYPES.filter((t) => t.id !== c.type).map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>
            </label>
          </li>
        ))}
        {!cards.length && <li class="hint">Nenhum card. Toque em "Adicionar card".</li>}
      </ul>
      <button type="button" class="btn btn-secondary" style="justify-self:start" onClick={onAdd}>
        <Plus size={16} /> Adicionar card
      </button>
    </>
  );
}

function ScreenInspector({ layout, isActive, onChange }) {
  const s = useStore();
  const { times } = normalizeDisplayDevice(s.settings.displayDevice);
  const model = DISPLAY_MODELS.find((m) => m.id === layout.modelId) ?? DISPLAY_MODELS[0];
  const setGrid = (patch) => {
    const grid = { ...layout.grid, ...patch };
    onChange({ ...layout, grid, cards: rescaleCards(layout.cards, layout.grid, grid) });
  };
  return (
    <>
      <h2 class="section-title" style="margin:0;display:flex;gap:8px;align-items:center">
        <MonitorSmartphone size={18} /> Tela
      </h2>
      <p class="small muted" style="margin:0">Toque em um card na tela para editar o card.</p>
      <label class="field">
        <span class="label">Nome do layout</span>
        <input class="input" value={layout.name} maxLength={40} onChange={(e) => onChange({ ...layout, name: e.currentTarget.value.trim() || layout.name })} />
      </label>
      {isActive ? (
        <div class="notice info">
          <CheckCircle2 size={18} /> Este é o layout que o display vai mostrar.
        </div>
      ) : (
        <button type="button" class="btn btn-soft" onClick={() => setActiveLayout(layout.id)}>
          <MonitorSmartphone size={16} /> Usar este layout no display
        </button>
      )}
      <label class="field">
        <span class="label">Modelo da tela</span>
        <select
          class="input"
          value={layout.modelId}
          onChange={(e) => {
            const m = DISPLAY_MODELS.find((x) => x.id === e.currentTarget.value);
            onChange({ ...layout, modelId: m.id, screen: m.id === 'custom' ? layout.screen : { w: m.w, h: m.h } });
          }}
        >
          {DISPLAY_MODELS.map((m) => (
            <option key={m.id} value={m.id}>
              {m.label}
            </option>
          ))}
        </select>
      </label>
      {model.id === 'custom' && (
        <div class="inspector-grid">
          <div class="field">
            <span class="label">Largura (px)</span>
            <Stepper value={layout.screen.w} min={200} max={4000} step={10} decimals={0} label="Largura da tela" onChange={(v) => onChange({ ...layout, screen: { ...layout.screen, w: v } })} />
          </div>
          <div class="field">
            <span class="label">Altura (px)</span>
            <Stepper value={layout.screen.h} min={200} max={4000} step={10} decimals={0} label="Altura da tela" onChange={(v) => onChange({ ...layout, screen: { ...layout.screen, h: v } })} />
          </div>
        </div>
      )}
      <div class="field">
        <span class="label">Posição</span>
        <Segmented
          options={[
            { id: 'landscape', label: 'Deitada' },
            { id: 'portrait', label: 'Em pé' },
          ]}
          value={layout.orientation}
          label="Posição da tela"
          onChange={(o) => {
            if (o === layout.orientation) return;
            const grid = { ...layout.grid, cols: layout.grid.rows, rows: layout.grid.cols };
            onChange({ ...layout, orientation: o, grid, cards: rescaleCards(layout.cards, layout.grid, grid) });
          }}
        />
      </div>
      <label class="field">
        <span class="label">Cores da tela</span>
        <select class="input" value={layout.colorMode} onChange={(e) => onChange({ ...layout, colorMode: e.currentTarget.value })}>
          {COLOR_MODES.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <div class="inspector-grid">
        <div class="field">
          <span class="label">Colunas</span>
          <Stepper value={layout.grid.cols} min={2} max={24} decimals={0} label="Colunas da grade" onChange={(v) => setGrid({ cols: v })} />
        </div>
        <div class="field">
          <span class="label">Linhas</span>
          <Stepper value={layout.grid.rows} min={2} max={24} decimals={0} label="Linhas da grade" onChange={(v) => setGrid({ rows: v })} />
        </div>
        <div class="field">
          <span class="label">Espaço entre cards</span>
          <Stepper value={layout.grid.gap} min={0} max={40} decimals={0} unit="px" label="Espaço entre cards" onChange={(v) => setGrid({ gap: v })} />
        </div>
        <div class="field">
          <span class="label">Margem</span>
          <Stepper value={layout.grid.padding} min={0} max={60} decimals={0} unit="px" label="Margem da tela" onChange={(v) => setGrid({ padding: v })} />
        </div>
      </div>
      <div class="divider" />
      <TypographyFields layout={layout} onChange={onChange} />
      <div class="divider" />
      <div class="field">
        <span class="label">Horários de atualização da tela</span>
        <span>{times.length ? formatTimes(times) : 'Só pelo botão do aparelho'}</span>
        <span class="hint">
          Valem para o aparelho, com o layout marcado "no display". <a href="#/ajustes">Alterar em Configurações → Tela e-ink</a>.
        </span>
      </div>
    </>
  );
}

/**
 * Filtro SVG que imita a conversão do gerador (scripts/lib/png.mjs): claridade
 * (0,299 R + 0,587 G + 0,114 B) ≥ limiar → branco; senão preto.
 */
function OneBitFilter({ id, threshold }) {
  const steps = 255;
  const table = Array.from({ length: steps }, (_, i) => ((i / steps) * 255 >= threshold - 0.5 ? 1 : 0)).join(' ');
  return (
    <svg width="0" height="0" style="position:absolute" aria-hidden="true">
      <filter id={id} color-interpolation-filters="sRGB">
        <feColorMatrix type="matrix" values="0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0 0 0 1 0" />
        <feComponentTransfer>
          <feFuncR type="discrete" tableValues={table} />
          <feFuncG type="discrete" tableValues={table} />
          <feFuncB type="discrete" tableValues={table} />
        </feComponentTransfer>
      </filter>
    </svg>
  );
}

/** Letras do layout: fonte, peso, tamanho e espaçamento de títulos e textos. */
function TypographyFields({ layout, onChange }) {
  const t = normalizeTypography(layout.typography);
  const check = typographyCheck(layout);
  const set = (group, patch) => onChange({ ...layout, typography: { ...t, [group]: { ...t[group], ...patch } } });
  const changed = JSON.stringify(t) !== JSON.stringify(normalizeTypography(DEFAULT_TYPOGRAPHY));
  const group = (key, title) => {
    const g = t[key];
    const font = displayFont(g.font);
    const weights = FONT_WEIGHTS.filter((x) => x.id >= font.min && x.id <= font.max);
    return (
      <fieldset class="type-group">
        <legend class="label">{title}</legend>
        <label class="field">
          <span class="hint">Fonte</span>
          <select class="input" value={g.font} aria-label={`Fonte dos ${title.toLowerCase()}`} style={{ fontFamily: font.css }} onChange={(e) => set(key, { font: e.currentTarget.value })}>
            {DISPLAY_FONTS.map((f) => (
              <option key={f.id} value={f.id} style={{ fontFamily: f.css }}>
                {f.label}
              </option>
            ))}
          </select>
          <span class="hint">{font.hint}</span>
        </label>
        <label class="field">
          <span class="hint">Peso (grossura)</span>
          <select class="input" value={String(g.weight)} aria-label={`Peso dos ${title.toLowerCase()}`} onChange={(e) => set(key, { weight: Number(e.currentTarget.value) })}>
            {weights.map((x) => (
              <option key={x.id} value={String(x.id)}>
                {x.label}
                {x.id === DEFAULT_TYPOGRAPHY[key].weight ? ' (padrão)' : ''}
              </option>
            ))}
          </select>
        </label>
        <div class="field">
          <span class="hint">Tamanho</span>
          <Segmented options={TYPE_SIZES} value={g.size} label={`Tamanho dos ${title.toLowerCase()}`} onChange={(v) => set(key, { size: v })} />
        </div>
        <div class="field">
          <span class="hint">Espaço entre letras</span>
          <Segmented options={LETTER_SPACINGS} value={g.spacing} label={`Espaço entre letras dos ${title.toLowerCase()}`} onChange={(v) => set(key, { spacing: v })} />
        </div>
        {key === 'title' && (
          <label class="switch">
            <input type="checkbox" checked={g.upper} onChange={(e) => set('title', { upper: e.currentTarget.checked })} />
            <span>Títulos em MAIÚSCULAS</span>
          </label>
        )}
      </fieldset>
    );
  };
  const ink = INK_LEVELS.find((l) => l.id === t.ink);
  return (
    <>
      <h3 class="section-title" style="margin:0;display:flex;gap:8px;align-items:center;font-size:1rem">
        <Type size={18} /> Letras
      </h3>
      <p class="small muted" style="margin:0">
        Títulos = nome do card, data, nome da refeição e do dia. Textos = o conteúdo. O tamanho de cada card continua no próprio card.
      </p>
      {group('title', 'Títulos')}
      {group('text', 'Textos')}
      <div class="field">
        <span class="label">Espessura no aparelho</span>
        <Segmented options={INK_LEVELS} value={t.ink} label="Espessura das letras no aparelho" onChange={(v) => onChange({ ...layout, typography: { ...t, ink: v } })} />
        <span class="hint">
          A tela só tem preto e branco: a imagem é convertida ponto a ponto. {ink?.hint || 'Equilíbrio entre letras finas e negrito.'}
        </span>
      </div>
      <div class={`type-check ${check.warnings.length ? 'warn' : ''}`} role="status">
        <span>
          Menores letras na tela ({screenSize(layout).w} × {screenSize(layout).h}): títulos ≈ {check.titlePx} px, textos ≈ {check.textPx} px.
        </span>
        {check.warnings.map((w) => (
          <span key={w} class="type-warn">
            <TriangleAlert size={14} aria-hidden="true" /> {w}
          </span>
        ))}
        <span class="hint">Use a “Prévia fiel” acima da tela para conferir antes de mandar para o aparelho.</span>
      </div>
      {changed && (
        <button type="button" class="btn btn-ghost btn-sm" style="justify-self:start" onClick={() => onChange({ ...layout, typography: structuredClone(DEFAULT_TYPOGRAPHY) })}>
          Voltar às letras padrão
        </button>
      )}
    </>
  );
}

function CardInspector({ card, grid, onChange, onRemove, onDuplicate, onOrder, onClose }) {
  const type = cardType(card.type);
  const setOpt = (key, value) => onChange({ options: { ...card.options, [key]: value } });
  return (
    <>
      <div style="display:flex;gap:8px;align-items:center">
        <h2 class="section-title grow" style="margin:0">
          {type?.label}
        </h2>
        <button type="button" class="btn btn-ghost" onClick={onClose}>
          Tela
        </button>
      </div>
      <p class="small muted" style="margin:0">{type?.description}</p>
      <label class="field">
        <span class="label">Título</span>
        <input class="input" value={card.title} placeholder={cardTitle({ ...card, title: '' })} maxLength={40} onChange={(e) => onChange({ title: e.currentTarget.value })} />
      </label>
      <label class="switch">
        <input type="checkbox" checked={card.showTitle} onChange={(e) => onChange({ showTitle: e.currentTarget.checked })} />
        <span>Mostrar título</span>
      </label>
      <div class="field">
        <span class="label">Tamanho do texto</span>
        <Segmented options={FONT_SCALES.map((f) => ({ id: f.id, label: f.label }))} value={card.fontScale ?? 1} label="Tamanho do texto" onChange={(v) => onChange({ fontScale: v })} />
      </div>
      <div class="field">
        <span class="label">Borda</span>
        <Segmented options={BORDERS} value={card.border ?? 'line'} label="Borda" onChange={(v) => onChange({ border: v })} />
      </div>
      <label class="switch">
        <input type="checkbox" checked={!!card.invert} onChange={(e) => onChange({ invert: e.currentTarget.checked })} />
        <span>Fundo preto (destaque)</span>
      </label>

      <div class="divider" />
      <span class="label">Posição e tamanho (em células da grade)</span>
      <div class="inspector-grid">
        <div class="field">
          <span class="hint">Coluna</span>
          <Stepper value={card.x + 1} min={1} max={grid.cols} decimals={0} label="Coluna" onChange={(v) => onChange({ x: v - 1 })} />
        </div>
        <div class="field">
          <span class="hint">Linha</span>
          <Stepper value={card.y + 1} min={1} max={grid.rows} decimals={0} label="Linha" onChange={(v) => onChange({ y: v - 1 })} />
        </div>
        <div class="field">
          <span class="hint">Largura</span>
          <Stepper value={card.w} min={1} max={grid.cols} decimals={0} label="Largura" onChange={(v) => onChange({ w: v })} />
        </div>
        <div class="field">
          <span class="hint">Altura</span>
          <Stepper value={card.h} min={1} max={grid.rows} decimals={0} label="Altura" onChange={(v) => onChange({ h: v })} />
        </div>
      </div>

      {type?.options?.length > 0 && <div class="divider" />}
      {type?.options?.map((o) => (
        <OptionField key={o.key} def={o} value={card.options?.[o.key] ?? o.default} onChange={(v) => setOpt(o.key, v)} />
      ))}

      <div class="divider" />
      <div class="toolbar">
        <button type="button" class="btn btn-secondary" onClick={onDuplicate}>
          <Copy size={16} /> Duplicar
        </button>
        <button type="button" class="btn btn-ghost" onClick={() => onOrder('front')} title="Trazer para frente">
          <ArrowUpToLine size={16} /> Frente
        </button>
        <button type="button" class="btn btn-ghost" onClick={() => onOrder('back')} title="Enviar para trás">
          <ArrowDownToLine size={16} /> Trás
        </button>
        <button type="button" class="btn btn-danger-ghost" onClick={onRemove}>
          <Trash2 size={16} /> Remover
        </button>
      </div>
    </>
  );
}

/** Cidade do card de clima: busca pelo nome (Open-Meteo) ou usa a localização do aparelho. */
function PlaceField({ def, value, onChange }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(!value);

  const search = async (e) => {
    e?.preventDefault();
    if (!query.trim()) return;
    setBusy(true);
    try {
      setResults(await searchPlaces(query));
    } catch {
      toast('Não foi possível buscar agora. Confira a internet.', { type: 'error' });
    } finally {
      setBusy(false);
    }
  };
  const pick = (place) => {
    onChange(place);
    setResults(null);
    setQuery('');
    setEditing(false);
  };
  const locate = () => {
    if (!navigator.geolocation) return toast('Este aparelho não informa a localização', { type: 'error' });
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setBusy(false);
        const lat = Math.round(pos.coords.latitude * 10000) / 10000;
        const lon = Math.round(pos.coords.longitude * 10000) / 10000;
        pick({ name: 'Minha localização', label: `Minha localização (${lat.toFixed(2)}, ${lon.toFixed(2)})`, lat, lon });
      },
      () => {
        setBusy(false);
        toast('Localização não permitida. Busque a cidade pelo nome.', { type: 'error' });
      },
      { timeout: 15000 },
    );
  };

  if (value && !editing) {
    return (
      <div class="field">
        <span class="label">{def.label}</span>
        <div class="place-current">
          <MapPin size={16} aria-hidden="true" />
          <span class="grow">{value.label ?? value.name}</span>
          <button type="button" class="btn btn-ghost btn-sm" onClick={() => setEditing(true)}>
            Trocar
          </button>
        </div>
      </div>
    );
  }
  return (
    <div class="field">
      <span class="label">{def.label}</span>
      <div class="input-group">
        <input
          class="input"
          type="search"
          value={query}
          placeholder="Ex.: Campinas"
          aria-label="Buscar cidade"
          onInput={(e) => setQuery(e.currentTarget.value)}
          onKeyDown={(e) => e.key === 'Enter' && search(e)}
        />
        <button type="button" class="icon-btn bordered" aria-label="Buscar cidade" disabled={busy} onClick={search}>
          <Search size={18} />
        </button>
        <button type="button" class="icon-btn bordered" aria-label="Usar minha localização" title="Usar minha localização" disabled={busy} onClick={locate}>
          <LocateFixed size={18} />
        </button>
      </div>
      {results && !results.length && <span class="hint">Nenhuma cidade encontrada.</span>}
      {results?.length > 0 && (
        <div class="place-results" role="listbox" aria-label="Cidades encontradas">
          {results.map((r) => (
            <button key={`${r.lat},${r.lon}`} type="button" role="option" aria-selected="false" class="btn btn-ghost btn-sm" onClick={() => pick(r)}>
              <MapPin size={14} aria-hidden="true" /> {r.label}
            </button>
          ))}
        </div>
      )}
      {value && (
        <button type="button" class="btn btn-ghost btn-sm" style="justify-self:start" onClick={() => setEditing(false)}>
          Manter {value.name}
        </button>
      )}
      <span class="hint">Previsão do Open-Meteo (gratuita, sem cadastro).</span>
    </div>
  );
}

function OptionField({ def, value, onChange }) {
  switch (def.type) {
    case 'place':
      return <PlaceField def={def} value={value} onChange={onChange} />;
    case 'toggle':
      return (
        <label class="switch">
          <input type="checkbox" checked={!!value} onChange={(e) => onChange(e.currentTarget.checked)} />
          <span>{def.label}</span>
        </label>
      );
    case 'select':
      return (
        <label class="field">
          <span class="label">{def.label}</span>
          <select class="input" value={value} onChange={(e) => onChange(e.currentTarget.value)}>
            {def.choices.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
      );
    case 'multi':
      return (
        <div class="field">
          <span class="label">{def.label}</span>
          <div class="chip-row" role="group" aria-label={def.label}>
            {def.choices.map((c) => {
              const on = (value ?? []).includes(c.id);
              return (
                <Chip key={c.id} pressed={on} onClick={() => onChange(on ? value.filter((x) => x !== c.id) : [...(value ?? []), c.id])}>
                  {c.label}
                </Chip>
              );
            })}
          </div>
        </div>
      );
    case 'number':
      return (
        <div class="field">
          <span class="label">{def.label}</span>
          <Stepper value={value} min={def.min ?? 0} max={def.max ?? 100} decimals={0} label={def.label} onChange={onChange} />
        </div>
      );
    case 'textarea':
      return (
        <label class="field">
          <span class="label">{def.label}</span>
          <textarea class="input" rows={3} maxLength={300} value={value} onChange={(e) => onChange(e.currentTarget.value)} />
        </label>
      );
    default:
      return (
        <label class="field">
          <span class="label">{def.label}</span>
          <input class="input" value={value} onChange={(e) => onChange(e.currentTarget.value)} />
        </label>
      );
  }
}

/** `momento` na rota: segundos UTC (epoch). Inválido ou ausente → relógio normal. */
function parseMoment(value) {
  const sec = Number(value);
  return value && Number.isFinite(sec) && sec > 0 ? new Date(sec * 1000) : null;
}

/**
 * #/display/tela — a tela pronta, para o aparelho (ou para conferir em tela cheia).
 *
 * Parâmetros (usados por scripts/display-png.mjs, que gera a imagem):
 *  - id=<layout>     layout a mostrar (padrão: o escolhido para o display);
 *  - exato=1         tamanho real em pixels, sem escala nem legenda;
 *  - momento=<epoch> mostra os dados "como estarão" nesse instante (segundos UTC);
 *  - publicar=1      expõe, num elemento oculto, o que o script precisa para publicar
 *                    (agenda, código do endereço e tamanho da tela).
 */
export function DisplayScreen({ params }) {
  const s = useStore();
  const fixedNow = useMemo(() => parseMoment(params.momento), [params.momento]);
  const data = useDisplayData(fixedNow);
  // Sem nenhum layout salvo (ninguém abriu a aba Display ainda): mostra o sugerido
  // "Cozinha" em 800 × 480, sem gravar nada (a conta da tela é só leitura).
  const fallback = useMemo(() => newLayout({ name: 'Cozinha' }), []);
  const layout = s.displayLayouts[params.id] ?? s.displayLayouts[s.settings.displayLayoutId] ?? Object.values(s.displayLayouts)[0] ?? fallback;
  const exact = params.exato === '1';
  const [win, setWin] = useState({ w: window.innerWidth, h: window.innerHeight });
  useEffect(() => {
    const on = () => setWin({ w: window.innerWidth, h: window.innerHeight });
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  const { w, h } = screenSize(layout);
  const scale = exact ? 1 : Math.min(win.w / w, win.h / h);
  // Para a foto: só se declara pronta depois que a previsão do tempo chegou (ou desistiu).
  const places = layout.cards.filter((c) => c.type === 'weather' && c.options?.place).map((c) => c.options.place);
  const weatherReady = useForecastsReady(places);
  const publish =
    params.publicar === '1' && weatherReady
      ? JSON.stringify({
          device: normalizeDisplayDevice(s.settings.displayDevice),
          // threshold: espessura escolhida em Letras (limiar do preto e branco no gerador).
          layout: { id: layout.id, name: layout.name, width: w, height: h, colorMode: layout.colorMode, threshold: inkThreshold(normalizeTypography(layout.typography).ink) },
          moment: data.now.getTime(),
        })
      : null;
  return (
    <div class={`display-fullscreen ${exact ? 'exact' : ''}`} data-pronto={weatherReady ? '1' : '0'}>
      <DisplayRender layout={layout} data={data} scale={scale} />
      {!exact && <span class="fs-hint">{layout.name} · {w}×{h}</span>}
      {publish && <div hidden id="panelai-publicacao" data-json={publish} />}
    </div>
  );
}

export { newCard };
