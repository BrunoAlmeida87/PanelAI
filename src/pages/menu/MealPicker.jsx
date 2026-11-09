// Seletor de refeição: Receita | Marmita | Fora / Texto.
// Desktop: modal centralizado. Celular: tela cheia (bottom sheet alto), com rodapé fixo.

import { useMemo, useState } from 'preact/hooks';
import { Search, Star, Check, ChevronDown, ChevronUp, Box, Utensils, MapPin, SlidersHorizontal } from 'lucide-preact';
import { Modal, Stepper, Chip, Segmented, toast } from '../../components/ui.jsx';
import { useStore } from '../../storage/store.js';
import { addMeals, replaceMeal, createMarmita, marmitaUsage } from '../../storage/actions.js';
import { MEAL_SLOTS, PROTEINS, SPEEDS, slotLabel } from '../../models/constants.js';
import { scaleIngredients, recipeSpeed } from '../../models/recipe.js';
import { formatQty } from '../../models/units.js';
import { addDays, formatDayMonth, weekDates, weekdayName, weekdayShort } from '../../utils/dates.js';
import { normalizeText } from '../../utils/id.js';
import { useIsPhone } from '../../utils/hooks.js';
import { recipeSubtitle, speedBadge } from './common.js';

const TABS = [
  { id: 'recipe', label: 'Receita', icon: Utensils },
  { id: 'marmita', label: 'Marmita', icon: Box },
  { id: 'text', label: 'Fora / Texto', icon: MapPin },
];

export function MealPicker({ weekId, date, slot, replaceEntryId = null, onClose }) {
  const s = useStore();
  const isPhone = useIsPhone();
  const people = s.settings.people;
  const slotInfo = MEAL_SLOTS.find((x) => x.id === slot);
  const [tab, setTab] = useState('recipe');
  const [repeat, setRepeat] = useState([]); // outras datas

  // --- Receita
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState(slotInfo?.snack ? 'lanche' : 'prato');
  const [favOnly, setFavOnly] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [speed, setSpeed] = useState(null);
  const [protein, setProtein] = useState(null);
  const [selected, setSelected] = useState([]); // [{recipeId, servings}]
  const [expanded, setExpanded] = useState(null);

  // --- Marmita
  const [marmitaMode, setMarmitaMode] = useState('existing');
  const [pickedBatch, setPickedBatch] = useState(null);
  const [batchServings, setBatchServings] = useState(people);
  const [newRecipe, setNewRecipe] = useState('');
  const [newPortions, setNewPortions] = useState(people * 2);
  const [newPrep, setNewPrep] = useState(addDays(date, -1) < weekId ? date : addDays(date, -1));
  const [newStorage, setNewStorage] = useState('geladeira');

  // --- Texto
  const [textKind, setTextKind] = useState('out');
  const [text, setText] = useState('');
  const [note, setNote] = useState('');

  const recipes = useMemo(() => {
    const q = normalizeText(query);
    return Object.values(s.recipes)
      .filter((r) => (cat === 'todas' ? true : r.category === cat))
      .filter((r) => !favOnly || r.favorite)
      .filter((r) => !speed || recipeSpeed(r) === speed)
      .filter((r) => !protein || r.protein === protein)
      .filter((r) => {
        if (!q) return true;
        if (normalizeText(r.name).includes(q)) return true;
        return r.ingredients.some((l) => normalizeText(s.ingredients[l.ingredientId]?.name).includes(q));
      })
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name, 'pt-BR'));
  }, [s.recipes, s.ingredients, query, cat, favOnly, speed, protein]);

  const batches = useMemo(
    () =>
      Object.values(s.marmitas)
        .filter((m) => m.status !== 'consumida' && s.recipes[m.recipeId])
        .map((m) => {
          const { used } = marmitaUsage(m.id);
          return { ...m, used, remaining: Math.max(0, m.portions - used), recipe: s.recipes[m.recipeId] };
        })
        .sort((a, b) => (a.prepDate < b.prepDate ? 1 : -1)),
    [s.marmitas, s.recipes, s.weeks],
  );

  const toggleRecipe = (id) => {
    setSelected((list) => {
      if (list.some((x) => x.recipeId === id)) return list.filter((x) => x.recipeId !== id);
      return [...list, { recipeId: id, servings: people }];
    });
  };

  const targets = [{ date, slot }, ...repeat.filter((d) => d !== date).map((d) => ({ date: d, slot }))];
  const where = replaceEntryId ? `${slotLabel(slot)} · ${weekdayName(date)} ${formatDayMonth(date)}` : `${weekdayName(date)} ${formatDayMonth(date)}`;

  function save(dataList) {
    if (replaceEntryId) {
      replaceMeal(weekId, date, slot, replaceEntryId, dataList);
      toast('Refeição substituída');
    } else {
      for (const data of dataList) addMeals(weekId, targets, data);
      const n = dataList.length * targets.length;
      toast(n === 1 ? 'Refeição adicionada' : `${n} refeições adicionadas`);
    }
    onClose();
  }

  function confirm() {
    if (tab === 'recipe') {
      if (!selected.length) return toast('Selecione pelo menos uma receita', { type: 'error' });
      save(selected.map((x) => ({ kind: 'recipe', recipeId: x.recipeId, servings: x.servings, note: '' })));
    } else if (tab === 'marmita') {
      if (marmitaMode === 'existing') {
        if (!pickedBatch) return toast('Escolha uma marmita', { type: 'error' });
        save([{ kind: 'marmita', marmitaId: pickedBatch, servings: batchServings, note: '' }]);
      } else {
        if (!newRecipe) return toast('Escolha a receita da marmita', { type: 'error' });
        if (newPrep > date) return toast('O preparo deve ser antes ou no dia da refeição', { type: 'error' });
        const m = createMarmita({ recipeId: newRecipe, portions: newPortions, prepDate: newPrep, storage: newStorage });
        const each = Math.min(people, newPortions);
        save([{ kind: 'marmita', marmitaId: m.id, servings: each, note: '' }]);
      }
    } else {
      if (textKind === 'text' && !text.trim()) return toast('Descreva a refeição', { type: 'error' });
      save([{ kind: textKind, text: text.trim(), note: note.trim() }]);
    }
  }

  const dates = weekDates(weekId);
  const confirmLabel = replaceEntryId
    ? 'Substituir'
    : tab === 'recipe' && selected.length > 1
      ? `Adicionar ${selected.length} receitas`
      : 'Adicionar';

  return (
    <Modal
      open
      onClose={onClose}
      full
      size="lg"
      title={replaceEntryId ? 'Substituir refeição' : slotLabel(slot)}
      subtitle={where}
      footer={
        <>
          {!replaceEntryId && (
            <div class="repeat-days" style="width:100%;margin-bottom:4px">
              <span class="small muted" id="repeat-label">Repetir em:</span>
              {dates.map((d) => (
                <Chip
                  key={d}
                  pressed={d === date || repeat.includes(d)}
                  disabled={d === date}
                  aria-label={`Repetir na ${weekdayName(d)}`}
                  onClick={() => setRepeat((r) => (r.includes(d) ? r.filter((x) => x !== d) : [...r, d]))}
                >
                  {weekdayShort(d)}
                </Chip>
              ))}
            </div>
          )}
          <button type="button" class="btn btn-secondary keep hide-mobile" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" class="btn btn-primary" onClick={confirm}>
            <Check size={18} /> {confirmLabel}
          </button>
        </>
      }
    >
      <div class="picker-sticky">
        <Segmented options={TABS} value={tab} onChange={setTab} label="Tipo de refeição" block />
        {tab === 'recipe' && (
          <div style="margin-top:10px">
            <div class="input-group">
              <div class="search-input">
                <Search size={18} />
                <input
                  class="input"
                  type="search"
                  placeholder="Buscar por nome ou ingrediente"
                  value={query}
                  autoFocus={!isPhone}
                  aria-label="Buscar receita"
                  onInput={(e) => setQuery(e.currentTarget.value)}
                />
              </div>
              <button
                type="button"
                class={`icon-btn bordered ${speed || protein ? 'active' : ''}`}
                aria-expanded={showFilters}
                aria-label="Filtros"
                onClick={() => setShowFilters((v) => !v)}
              >
                <SlidersHorizontal size={18} />
              </button>
            </div>
            <div class="chip-row" style="margin-top:8px">
              <Chip pressed={cat === 'prato'} onClick={() => setCat('prato')}>Pratos</Chip>
              <Chip pressed={cat === 'lanche'} onClick={() => setCat('lanche')}>Lanches</Chip>
              <Chip pressed={cat === 'todas'} onClick={() => setCat('todas')}>Todas</Chip>
              <Chip pressed={favOnly} onClick={() => setFavOnly((v) => !v)}>
                <Star size={14} /> Favoritas
              </Chip>
            </div>
            {showFilters && (
              <div style="display:grid;gap:8px;margin-top:8px">
                <div class="chip-row" role="group" aria-label="Velocidade">
                  {SPEEDS.map((sp) => (
                    <Chip key={sp.id} pressed={speed === sp.id} onClick={() => setSpeed(speed === sp.id ? null : sp.id)}>
                      {sp.label}
                    </Chip>
                  ))}
                </div>
                <div class="chip-row" role="group" aria-label="Proteína">
                  {PROTEINS.map((p) => (
                    <Chip key={p.id} pressed={protein === p.id} onClick={() => setProtein(protein === p.id ? null : p.id)}>
                      {p.label}
                    </Chip>
                  ))}
                </div>
              </div>
            )}
            {selected.length > 0 && (
              <div class="selected-tray" style="margin-top:8px" aria-label="Selecionadas">
                {selected.map((x) => (
                  <span key={x.recipeId} class="badge badge-green" style="text-transform:none;height:26px">
                    {s.recipes[x.recipeId]?.name} · {x.servings} porç.
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {tab === 'recipe' && (
        <>
          <div class="picker-list" role="listbox" aria-label="Receitas" aria-multiselectable="true">
            {recipes.map((r) => {
              const sel = selected.find((x) => x.recipeId === r.id);
              const sb = speedBadge(r);
              return (
                <div key={r.id} class={`picker-row ${sel ? 'selected' : ''}`}>
                  <button type="button" role="option" aria-selected={!!sel} onClick={() => toggleRecipe(r.id)}>
                    <input type="checkbox" class="check" checked={!!sel} tabIndex={-1} aria-hidden="true" />
                    <span class="p-main">
                      <span class="p-name">
                        {r.name} {r.favorite && <Star size={12} style="display:inline;vertical-align:-1px" fill="currentColor" color="#DCA49B" />}
                      </span>
                      <span class="p-sub">{recipeSubtitle(r)} · {r.time} min</span>
                    </span>
                    <span class={`badge ${sb.cls}`}>{sb.label}</span>
                  </button>
                  {sel && (
                    <div class="p-extra">
                      <Stepper
                        value={sel.servings}
                        min={1}
                        max={50}
                        size="sm"
                        unit="porções"
                        label="Porções"
                        onChange={(v) => setSelected((l) => l.map((x) => (x.recipeId === r.id ? { ...x, servings: v } : x)))}
                      />
                      <button type="button" class="btn btn-ghost btn-sm" onClick={() => setExpanded(expanded === r.id ? null : r.id)} aria-expanded={expanded === r.id}>
                        {expanded === r.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />} Ingredientes
                      </button>
                      {expanded === r.id && <IngredientPreview recipe={r} servings={sel.servings} />}
                    </div>
                  )}
                </div>
              );
            })}
            {!recipes.length && <p class="muted small" style="padding:16px;text-align:center">Nenhuma receita encontrada.</p>}
          </div>
        </>
      )}

      {tab === 'marmita' && (
        <div style="display:grid;gap:14px;margin-top:4px">
          <Segmented
            options={[
              { id: 'existing', label: 'Usar marmita pronta' },
              { id: 'new', label: 'Planejar nova' },
            ]}
            value={marmitaMode}
            onChange={setMarmitaMode}
            label="Marmita"
            block
          />
          {marmitaMode === 'existing' ? (
            batches.length ? (
              <div class="picker-list" role="listbox" aria-label="Marmitas disponíveis">
                {batches.map((m) => (
                  <div key={m.id} class={`picker-row ${pickedBatch === m.id ? 'selected' : ''}`}>
                    <button
                      type="button"
                      role="option"
                      aria-selected={pickedBatch === m.id}
                      onClick={() => {
                        setPickedBatch(m.id);
                        setBatchServings(Math.max(1, Math.min(people, m.remaining || people)));
                      }}
                    >
                      <input type="radio" class="check" checked={pickedBatch === m.id} tabIndex={-1} aria-hidden="true" style="border-radius:50%" />
                      <span class="p-main">
                        <span class="p-name">{m.recipe.name}</span>
                        <span class="p-sub">
                          Preparo {formatDayMonth(m.prepDate)} · {m.storage === 'freezer' ? 'freezer' : 'geladeira'} · {m.remaining} de {m.portions} porções livres
                        </span>
                      </span>
                      <span class={`badge ${m.remaining ? 'badge-coral' : 'badge-outline'}`}>{m.status}</span>
                    </button>
                    {pickedBatch === m.id && (
                      <div class="p-extra">
                        <Stepper value={batchServings} min={1} max={50} size="sm" unit="porções" label="Porções desta refeição" onChange={setBatchServings} />
                        {batchServings > m.remaining && <span class="small" style="color:var(--coral-dark)">Mais porções do que o lote tem livre.</span>}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p class="muted small">Nenhuma marmita planejada ou armazenada. Use "Planejar nova".</p>
            )
          ) : (
            <div class="form-grid cols-2">
              <label class="field span-all">
                <span class="label">Receita</span>
                <select class="select" value={newRecipe} onChange={(e) => setNewRecipe(e.currentTarget.value)}>
                  <option value="">Escolha…</option>
                  <optgroup label="Boas para marmita">
                    {Object.values(s.recipes)
                      .filter((r) => r.marmita)
                      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
                      .map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                  </optgroup>
                  <optgroup label="Outras receitas">
                    {Object.values(s.recipes)
                      .filter((r) => !r.marmita)
                      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
                      .map((r) => (
                        <option key={r.id} value={r.id}>{r.name}</option>
                      ))}
                  </optgroup>
                </select>
              </label>
              <div class="field">
                <span class="label">Porções no lote</span>
                <Stepper value={newPortions} min={1} max={60} unit="porções" label="Porções no lote" onChange={setNewPortions} />
              </div>
              <label class="field">
                <span class="label">Dia do preparo</span>
                <input class="input" type="date" value={newPrep} max={date} onChange={(e) => setNewPrep(e.currentTarget.value)} />
              </label>
              <div class="field span-all">
                <span class="label">Guardar em</span>
                <Segmented
                  options={[
                    { id: 'geladeira', label: 'Geladeira' },
                    { id: 'freezer', label: 'Freezer' },
                  ]}
                  value={newStorage}
                  onChange={setNewStorage}
                  label="Armazenamento"
                />
              </div>
              <p class="small muted span-all">
                Os ingredientes do lote entram na lista de compras uma única vez, na semana do preparo. Use "Repetir em" para servir as porções em outros dias.
              </p>
            </div>
          )}
        </div>
      )}

      {tab === 'text' && (
        <div class="form-grid" style="margin-top:4px">
          <Segmented
            options={[
              { id: 'out', label: 'Fora de casa' },
              { id: 'text', label: 'Texto livre' },
            ]}
            value={textKind}
            onChange={setTextKind}
            label="Tipo"
            block
          />
          <label class="field">
            <span class="label">{textKind === 'out' ? 'Onde? (opcional)' : 'Refeição'}</span>
            <input
              class="input"
              value={text}
              maxLength={120}
              placeholder={textKind === 'out' ? 'Ex.: restaurante, casa da vó' : 'Ex.: sobras do almoço, frutas'}
              onInput={(e) => setText(e.currentTarget.value)}
            />
          </label>
          <label class="field">
            <span class="label">Observação</span>
            <input class="input" value={note} maxLength={200} onInput={(e) => setNote(e.currentTarget.value)} />
          </label>
          <p class="small muted">Refeições fora de casa e em texto livre não geram itens na lista de compras.</p>
        </div>
      )}
    </Modal>
  );
}

export function IngredientPreview({ recipe, servings }) {
  const s = useStore();
  return (
    <ul class="small" style="margin:0;padding-left:18px;width:100%;color:var(--text-2)">
      {scaleIngredients(recipe, servings).map((l, i) => {
        const ing = s.ingredients[l.ingredientId];
        return (
          <li key={i}>
            {ing?.name ?? l.ingredientId} — {formatQty(l.qty, l.unit)}
            {l.optional ? ' (opcional)' : ''}
          </li>
        );
      })}
    </ul>
  );
}
