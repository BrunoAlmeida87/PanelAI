// Detalhe da receita, adaptado para leitura durante o preparo no celular.

import { useState } from 'preact/hooks';
import {
  ArrowLeft,
  Box,
  CalendarPlus,
  CheckCircle2,
  CircleAlert,
  Copy,
  MoreHorizontal,
  Pencil,
  Snowflake,
  Star,
  Trash2,
  ListChecks,
  Tag,
} from 'lucide-preact';
import { useStore } from '../storage/store.js';
import { deleteRecipe, duplicateRecipe, recipeUsage, toggleRecipeFavorite, addMeals } from '../storage/actions.js';
import { useWeekId } from '../storage/ui.js';
import { difficultyLabel, proteinLabel, compositionLabel, restrictionLabel, MEAL_SLOTS } from '../models/constants.js';
import { recipeRestrictions, scaleIngredients } from '../models/recipe.js';
import { formatQty, toBase } from '../models/units.js';
import { stockInBase } from '../services/pantry.js';
import { formatDayMonth, weekDates, weekdayName, weekdayShort, todayISO } from '../utils/dates.js';
import { navigate } from '../utils/router.js';
import { Menu, Modal, Stepper, Chip, Segmented, toast, confirmDialog, EmptyState } from '../components/ui.jsx';
import { RecipeCover } from './recipes/RecipeCard.jsx';
import { speedBadge } from './menu/common.js';

export function RecipeDetailPage({ id }) {
  const s = useStore();
  const recipe = s.recipes[id];
  const [servings, setServings] = useState(recipe?.servings ?? 4);
  const [addOpen, setAddOpen] = useState(false);

  if (!recipe) {
    return (
      <div class="card">
        <EmptyState icon={CircleAlert} title="Receita não encontrada" action={<a class="btn btn-soft" href="#/receitas">Voltar para receitas</a>}>
          Ela pode ter sido excluída.
        </EmptyState>
      </div>
    );
  }

  const sb = speedBadge(recipe);
  const restrictions = recipeRestrictions(recipe, s.ingredients);
  const lines = scaleIngredients(recipe, servings);

  const remove = async () => {
    const usage = recipeUsage(recipe.id);
    const extra = usage.meals || usage.marmitas ? ` Ela aparece em ${usage.meals} refeições e ${usage.marmitas} marmitas, que ficarão como "Receita removida".` : '';
    const ok = await confirmDialog({ title: 'Excluir receita', message: `Excluir "${recipe.name}"?${extra}`, confirmLabel: 'Excluir', danger: true });
    if (!ok) return;
    deleteRecipe(recipe.id);
    toast('Receita excluída');
    navigate('/receitas');
  };
  const duplicate = () => {
    const copy = duplicateRecipe(recipe.id);
    toast('Receita duplicada');
    navigate(`/receitas/${copy.id}/editar`);
  };

  return (
    <article>
      <div class="toolbar" style="margin-bottom:12px">
        <a class="btn btn-ghost" href="#/receitas" style="padding-left:6px">
          <ArrowLeft size={18} /> Receitas
        </a>
        <span style="flex:1" />
        <button
          type="button"
          class="icon-btn bordered"
          aria-pressed={recipe.favorite ? 'true' : 'false'}
          aria-label={recipe.favorite ? 'Remover das favoritas' : 'Favoritar'}
          onClick={() => toggleRecipeFavorite(recipe.id)}
          style={recipe.favorite ? 'color:var(--coral)' : ''}
        >
          <Star size={18} fill={recipe.favorite ? 'currentColor' : 'none'} />
        </button>
        <a class="btn btn-secondary hide-mobile" href={`#/receitas/${recipe.id}/editar`}>
          <Pencil size={16} /> Editar
        </a>
        <Menu trigger={(p) => <button type="button" class="icon-btn bordered" aria-label={p.label} aria-expanded={p.open} onClick={p.toggle}><MoreHorizontal size={18} /></button>}>
          <button type="button" role="menuitem" onClick={() => navigate(`/receitas/${recipe.id}/editar`)}><Pencil size={16} /> Editar</button>
          <button type="button" role="menuitem" onClick={duplicate}><Copy size={16} /> Duplicar</button>
          <hr />
          <button type="button" role="menuitem" class="danger" onClick={remove}><Trash2 size={16} /> Excluir</button>
        </Menu>
      </div>

      <header class="recipe-hero">
        <div>
          <div class="rc-badges" style="margin-bottom:8px">
            <span class={`badge ${sb.cls}`}>{sb.label}</span>
            <span class="badge">{recipe.category === 'lanche' ? 'Lanche' : 'Prato'}</span>
            {recipe.marmita && <span class="badge badge-coral"><Box size={11} /> Boa para marmita</span>}
          </div>
          <h1>{recipe.name}</h1>
          {recipe.description && <p class="desc">{recipe.description}</p>}
          <div class="meta-grid">
            <div><span>Tempo</span><strong>{recipe.time} min</strong></div>
            <div><span>Rende</span><strong>{recipe.servings} porções</strong></div>
            <div><span>Dificuldade</span><strong>{difficultyLabel(recipe.difficulty)}</strong></div>
            <div><span>Proteína</span><strong>{proteinLabel(recipe.protein)}</strong></div>
          </div>
          <div class="toolbar" style="margin-top:14px">
            <button type="button" class="btn btn-primary" onClick={() => setAddOpen(true)}>
              <CalendarPlus size={16} /> Adicionar ao cardápio
            </button>
          </div>
        </div>
        <div class="cover hide-mobile">
          <RecipeCover recipe={recipe} size={72} />
        </div>
      </header>

      <div class="recipe-columns">
        <section class="card card-pad ingredients-card" aria-labelledby="ing-title">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
            <h2 id="ing-title" style="font-size:var(--fs-lg);flex:1">Ingredientes</h2>
            <Stepper value={servings} min={1} max={60} size="sm" unit="porções" label="Porções" onChange={setServings} />
          </div>
          {servings !== recipe.servings && (
            <p class="xsmall muted" style="margin-top:6px">
              Quantidades recalculadas de {recipe.servings} para {servings} porções.{' '}
              <button type="button" class="btn btn-ghost btn-sm" onClick={() => setServings(recipe.servings)}>Voltar ao original</button>
            </p>
          )}
          <ul class="ing-list">
            {lines.map((l, i) => {
              const ing = s.ingredients[l.ingredientId];
              const p = s.pantry[l.ingredientId];
              const b = toBase(l.qty, l.unit, ing);
              const stock = p ? stockInBase(p, ing) : null;
              const have = ing?.ignoreStock || (b.qty == null ? !!p && p.qty > 0 : stock != null && b.compatible && stock >= b.qty);
              return (
                <li key={i}>
                  {have ? (
                    <CheckCircle2 size={18} class="have" aria-label="Tem na despensa" />
                  ) : (
                    <CircleAlert size={18} class="lack" aria-label="Falta na despensa" />
                  )}
                  <span>
                    {ing?.name ?? l.ingredientId}
                    {(l.optional || l.note) && <span class="xsmall muted"> {l.note || 'opcional'}</span>}
                  </span>
                  <span class="q">{formatQty(l.qty, l.unit)}</span>
                </li>
              );
            })}
          </ul>
          <p class="xsmall muted" style="margin-top:8px">
            <CheckCircle2 size={12} style="display:inline;vertical-align:-2px" color="#52765D" /> tem na despensa ·{' '}
            <CircleAlert size={12} style="display:inline;vertical-align:-2px" color="#DCA49B" /> falta ou sem registro
          </p>
        </section>

        <div>
          <section class="card card-pad" aria-labelledby="steps-title">
            <h2 id="steps-title" style="font-size:var(--fs-lg)">Modo de preparo</h2>
            {recipe.steps.length ? (
              <ol class="steps">
                {recipe.steps.map((st, i) => (
                  <li key={i}>
                    <span>{st}</span>
                  </li>
                ))}
              </ol>
            ) : (
              <p class="muted small" style="margin-top:8px">Sem modo de preparo cadastrado.</p>
            )}
          </section>

          <div class="info-grid">
            {(recipe.marmita || recipe.freezing?.freezable) && (
              <section class="card card-pad">
                <h3 class="card-title"><Snowflake size={14} /> Marmita e congelamento</h3>
                <p class="small" style="margin-top:8px">
                  {recipe.marmita ? 'Boa para marmita. ' : 'Não indicada para marmita. '}
                  {recipe.freezing?.freezable ? `Congela por até ${recipe.freezing.days} dias.` : 'Não recomendada para congelar.'}
                </p>
                {recipe.freezing?.notes && <p class="small muted" style="margin-top:4px">{recipe.freezing.notes}</p>}
              </section>
            )}
            {recipe.advancePrep?.length > 0 && (
              <section class="card card-pad">
                <h3 class="card-title"><ListChecks size={14} /> Preparo antecipado</h3>
                <ul class="small" style="margin:8px 0 0;padding-left:18px">
                  {recipe.advancePrep.map((p, i) => (
                    <li key={i}>
                      {p.text} — {Number(p.daysBefore) === 0 ? 'no dia' : `${p.daysBefore} dia(s) antes`}
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section class="card card-pad">
              <h3 class="card-title"><Tag size={14} /> Composição e restrições</h3>
              <div class="chip-row" style="margin-top:8px;gap:6px">
                {recipe.composition.map((c) => (
                  <span key={c} class="badge badge-green">{compositionLabel(c)}</span>
                ))}
                {restrictions.map((r) => (
                  <span key={r} class="badge badge-blue">{restrictionLabel(r)}</span>
                ))}
                {(recipe.tags ?? []).map((t) => (
                  <span key={t} class="badge badge-outline">{t}</span>
                ))}
              </div>
            </section>
            {recipe.notes && (
              <section class="card card-pad">
                <h3 class="card-title">Observações</h3>
                <p class="small" style="margin-top:8px;white-space:pre-line">{recipe.notes}</p>
              </section>
            )}
          </div>
        </div>
      </div>

      {addOpen && <AddToMenuModal recipe={recipe} servings={servings} onClose={() => setAddOpen(false)} />}
    </article>
  );
}

function AddToMenuModal({ recipe, servings: initial, onClose }) {
  const s = useStore();
  const weekId = useWeekId();
  const today = todayISO();
  const dates = weekDates(weekId);
  const [days, setDays] = useState(dates.includes(today) ? [today] : [dates[0]]);
  const [slot, setSlot] = useState(recipe.category === 'lanche' ? 'lanche_tarde' : 'almoco');
  const [servings, setServings] = useState(initial === recipe.servings ? s.settings.people : initial);
  const save = () => {
    if (!days.length) return toast('Escolha pelo menos um dia', { type: 'error' });
    addMeals(weekId, days.map((d) => ({ date: d, slot })), { kind: 'recipe', recipeId: recipe.id, servings, note: '' });
    toast(`${recipe.name} adicionada em ${days.length} ${days.length === 1 ? 'dia' : 'dias'}`, {
      action: { label: 'Ver', onClick: () => navigate('/cardapio') },
    });
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Adicionar ao cardápio"
      subtitle={recipe.name}
      footer={
        <>
          <button type="button" class="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" class="btn btn-primary" onClick={save}><CalendarPlus size={16} /> Adicionar</button>
        </>
      }
    >
      <div class="form-grid">
        <div class="field">
          <span class="label">Dias ({formatDayMonth(dates[0])} – {formatDayMonth(dates[6])})</span>
          <div class="repeat-days">
            {dates.map((d) => (
              <Chip key={d} pressed={days.includes(d)} aria-label={weekdayName(d)} onClick={() => setDays((l) => (l.includes(d) ? l.filter((x) => x !== d) : [...l, d]))}>
                {weekdayShort(d)} {formatDayMonth(d).slice(0, 2)}
              </Chip>
            ))}
          </div>
        </div>
        <div class="field">
          <span class="label">Refeição</span>
          <Segmented options={MEAL_SLOTS.map((m) => ({ id: m.id, label: m.short }))} value={slot} onChange={setSlot} label="Refeição" block />
        </div>
        <div class="field">
          <span class="label">Porções</span>
          <Stepper value={servings} min={1} max={60} unit="porções" label="Porções" onChange={setServings} />
        </div>
      </div>
    </Modal>
  );
}
