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
} from 'lucide-preact';
import { useStore } from '../storage/store.js';
import { createLayout, deleteLayout, duplicateLayout, saveLayout, setActiveLayout } from '../storage/displayActions.js';
import {
  BORDERS,
  CARD_TYPES,
  COLOR_MODES,
  DISPLAY_MODELS,
  FONT_SCALES,
  LAYOUT_PRESETS,
  cardType,
  clampCard,
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
  return useMemo(
    () => buildDisplayData(s, now),
    [s.weeks, s.tasks, s.taskTemplates, s.recipes, s.marmitas, s.pantry, s.ingredients, s.settings, at],
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
  const [adding, setAdding] = useState(false);
  const [presets, setPresets] = useState(false);
  const undo = useRef([]);
  const [undoCount, setUndoCount] = useState(0);
  const stageRef = useRef(null);
  const stageWidth = useWidth(stageRef);

  const layout = draft ?? stored;
  const { w, h } = screenSize(layout);
  const maxH = typeof window !== 'undefined' ? Math.max(240, window.innerHeight * 0.68) : 600;
  const scale = stageWidth ? Math.min(1, (stageWidth - 48) / w, maxH / h) : 0.5;
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
    else setDraft(null);
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

  const addCard = (type) => {
    const card = placeNewCard(layout.cards, layout.grid, type);
    commit({ ...layout, cards: [...layout.cards, card] });
    setSelectedId(card.id);
    setAdding(false);
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
        <Chip pressed={showGrid} onClick={() => setShowGrid((v) => !v)}>
          <Grid3x3 size={14} /> Grade
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
          <div class="display-stage" ref={stageRef} onPointerDown={(e) => e.target === e.currentTarget && setSelectedId(null)}>
            <DisplayRender
              layout={layout}
              data={data}
              scale={scale}
              overlay={
                <>
                  {guides}
                  {boxes}
                </>
              }
            />
          </div>
          <p class="small muted" style="margin-top:8px">
            {w} × {h} px · grade {g.cols} × {g.rows} · arraste para mover, puxe as bolinhas para mudar o tamanho (no teclado: setas e Shift+setas).
            {overlapping.size > 0 && <strong style="color:var(--danger)"> Há cards sobrepostos (em vermelho).</strong>}
            {stored.updatedBy && ` Última alteração: ${stored.updatedBy}, ${formatDateTime(stored.updatedAt)}.`}
          </p>
        </div>

        <aside class="display-inspector card card-pad form-section" aria-label="Propriedades">
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
            <ScreenInspector layout={layout} isActive={isActive} onChange={(next) => commit(next)} />
          )}
        </aside>
      </div>

      <Modal open={adding} onClose={() => setAdding(false)} title="Adicionar card" subtitle="Escolha o que mostrar. Depois ajuste posição, tamanho e opções.">
        <div class="card-type-list">
          {CARD_TYPES.map((t) => (
            <button key={t.id} type="button" onClick={() => addCard(t.id)}>
              <strong>{t.label}</strong>
              <span>{t.description}</span>
            </button>
          ))}
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

function OptionField({ def, value, onChange }) {
  switch (def.type) {
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
  const publish =
    params.publicar === '1'
      ? JSON.stringify({
          device: normalizeDisplayDevice(s.settings.displayDevice),
          layout: { id: layout.id, name: layout.name, width: w, height: h, colorMode: layout.colorMode },
          moment: data.now.getTime(),
        })
      : null;
  return (
    <div class={`display-fullscreen ${exact ? 'exact' : ''}`}>
      <DisplayRender layout={layout} data={data} scale={scale} />
      {!exact && <span class="fs-hint">{layout.name} · {w}×{h}</span>}
      {publish && <div hidden id="panelai-publicacao" data-json={publish} />}
    </div>
  );
}

export { newCard };
