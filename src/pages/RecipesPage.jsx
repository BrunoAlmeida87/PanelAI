// Biblioteca de receitas: Pratos | Lanches | Com o que tenho.

import { useMemo, useState } from 'preact/hooks';
import { BookOpen, Plus, Search, SlidersHorizontal, Sparkles, X } from 'lucide-preact';
import { useStore } from '../storage/store.js';
import { COMPOSITION, DIFFICULTIES, PROTEINS, RESTRICTIONS, SPEEDS } from '../models/constants.js';
import { recipeRestrictions, recipeSpeed } from '../models/recipe.js';
import { SUGGESTION_LEVELS, evaluateRecipe, suggestRecipes } from '../services/suggestions.js';
import { normalizeText } from '../utils/id.js';
import { useIsDesktop, usePref } from '../utils/hooks.js';
import { navigate } from '../utils/router.js';
import { Chip, Modal, Segmented, EmptyState } from '../components/ui.jsx';
import { RecipeCard } from './recipes/RecipeCard.jsx';

const EMPTY_FILTERS = {
  speed: [],
  protein: [],
  composition: [],
  difficulty: [],
  restrictions: [],
  maxTime: 0,
  marmita: false,
  favorites: false,
  available: '',
};

const toggleIn = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

function activeCount(f) {
  return (
    f.speed.length +
    f.protein.length +
    f.composition.length +
    f.difficulty.length +
    f.restrictions.length +
    (f.maxTime ? 1 : 0) +
    (f.marmita ? 1 : 0) +
    (f.favorites ? 1 : 0) +
    (f.available ? 1 : 0)
  );
}

export function RecipesPage() {
  const s = useStore();
  const isDesktop = useIsDesktop();
  const [tab, setTab] = usePref('recipesTab', 'prato');
  const [query, setQuery] = useState('');
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const ctx = { pantry: s.pantry, ingredientsById: s.ingredients };
  const all = useMemo(() => Object.values(s.recipes), [s.recipes]);

  const filtered = useMemo(() => {
    const q = normalizeText(query);
    return all
      .filter((r) => tab === 'sugestoes' || r.category === tab)
      .filter((r) => {
        if (!q) return true;
        if (normalizeText(r.name).includes(q) || (r.tags ?? []).some((t) => normalizeText(t).includes(q))) return true;
        return r.ingredients.some((l) => normalizeText(s.ingredients[l.ingredientId]?.name).includes(q));
      })
      .filter((r) => !filters.speed.length || filters.speed.includes(recipeSpeed(r)))
      .filter((r) => !filters.protein.length || filters.protein.includes(r.protein))
      .filter((r) => !filters.composition.length || filters.composition.every((c) => r.composition?.includes(c)))
      .filter((r) => !filters.difficulty.length || filters.difficulty.includes(r.difficulty))
      .filter((r) => {
        if (!filters.restrictions.length) return true;
        const rs = recipeRestrictions(r, s.ingredients);
        return filters.restrictions.every((x) => rs.includes(x));
      })
      .filter((r) => !filters.maxTime || r.time <= filters.maxTime)
      .filter((r) => !filters.marmita || r.marmita)
      .filter((r) => !filters.favorites || r.favorite)
      .filter((r) => {
        if (!filters.available) return true;
        const lvl = evaluateRecipe(r, ctx).level;
        return filters.available === 'todos' ? lvl === 'todos' : lvl !== 'muitos';
      })
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || a.name.localeCompare(b.name, 'pt-BR'));
  }, [all, tab, query, filters, s.ingredients, s.pantry]);

  const counts = useMemo(
    () => ({ prato: all.filter((r) => r.category === 'prato').length, lanche: all.filter((r) => r.category === 'lanche').length }),
    [all],
  );
  const nActive = activeCount(filters);

  const filterPanel = <FilterPanel filters={filters} setFilters={setFilters} />;

  return (
    <div>
      <div class="page-head">
        <div class="grow">
          <h1>Receitas</h1>
          <p class="sub">{all.length} receitas na biblioteca</p>
        </div>
        <button type="button" class="btn btn-primary" onClick={() => navigate('/receitas/nova')} title="Nova receita (N)">
          <Plus size={16} /> Nova receita
        </button>
      </div>

      <div style="margin-bottom:12px">
        <Segmented
          options={[
            { id: 'prato', label: 'Pratos', count: counts.prato },
            { id: 'lanche', label: 'Lanches', count: counts.lanche },
            { id: 'sugestoes', label: isDesktop ? 'Com o que tenho' : 'Tenho em casa', icon: Sparkles },
          ]}
          value={tab}
          onChange={setTab}
          label="Tipo de receita"
          block={!isDesktop}
        />
      </div>

      <div class="filters-bar">
        <div class="search-input">
          <Search size={18} />
          <input
            class="input"
            type="search"
            data-search
            value={query}
            placeholder="Buscar por nome, ingrediente ou etiqueta"
            aria-label="Buscar receitas"
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
        </div>
        {!isDesktop && (
          <button type="button" class="btn btn-secondary" onClick={() => setFiltersOpen(true)} aria-label={`Filtros${nActive ? `, ${nActive} ativos` : ''}`}>
            <SlidersHorizontal size={16} /> Filtros{nActive ? ` (${nActive})` : ''}
          </button>
        )}
        {nActive > 0 && (
          <button type="button" class="btn btn-ghost" onClick={() => setFilters(EMPTY_FILTERS)}>
            <X size={16} /> Limpar
          </button>
        )}
      </div>

      <div class={isDesktop ? 'recipes-layout' : ''}>
        {isDesktop && (
          <aside class="card card-pad filters-panel" aria-label="Filtros">
            {filterPanel}
          </aside>
        )}
        <div>
          {tab === 'sugestoes' ? (
            <Suggestions recipes={filtered} ctx={ctx} />
          ) : filtered.length ? (
            <>
              <p class="small muted" style="margin-bottom:10px">{filtered.length} receitas</p>
              <div class="recipe-grid">
                {filtered.map((r) => (
                  <RecipeCard key={r.id} recipe={r} />
                ))}
              </div>
            </>
          ) : (
            <div class="card">
              <EmptyState icon={BookOpen} title="Nenhuma receita encontrada" action={nActive ? <button type="button" class="btn btn-soft" onClick={() => setFilters(EMPTY_FILTERS)}>Limpar filtros</button> : null}>
                Ajuste a busca ou os filtros, ou crie uma nova receita.
              </EmptyState>
            </div>
          )}
        </div>
      </div>

      {!isDesktop && filtersOpen && (
        <Modal
          open
          full
          onClose={() => setFiltersOpen(false)}
          title="Filtros"
          footer={
            <>
              <button type="button" class="btn btn-secondary" onClick={() => setFilters(EMPTY_FILTERS)}>Limpar</button>
              <button type="button" class="btn btn-primary" onClick={() => setFiltersOpen(false)}>
                Ver {filtered.length} receitas
              </button>
            </>
          }
        >
          {filterPanel}
        </Modal>
      )}
    </div>
  );
}

function FilterPanel({ filters: f, setFilters }) {
  const set = (patch) => setFilters({ ...f, ...patch });
  const group = (title, key, options) => (
    <div class="filter-group" role="group" aria-label={title}>
      <h3>{title}</h3>
      <div class="chip-row">
        {options.map((o) => (
          <Chip key={o.id} pressed={f[key].includes(o.id)} onClick={() => set({ [key]: toggleIn(f[key], o.id) })}>
            {o.label}
          </Chip>
        ))}
      </div>
    </div>
  );
  return (
    <div class="filters-panel" style="position:static;max-height:none">
      <div class="filter-group" role="group" aria-label="Atalhos">
        <div class="chip-row">
          <Chip pressed={f.favorites} onClick={() => set({ favorites: !f.favorites })}>Favoritas</Chip>
          <Chip pressed={f.marmita} onClick={() => set({ marmita: !f.marmita })}>Boa para marmita</Chip>
        </div>
      </div>
      {group('Velocidade', 'speed', SPEEDS)}
      {group('Proteína', 'protein', PROTEINS)}
      {group('Composição', 'composition', COMPOSITION)}
      {group('Dificuldade', 'difficulty', DIFFICULTIES)}
      {group('Restrições', 'restrictions', RESTRICTIONS)}
      <div class="filter-group">
        <h3>Tempo máximo</h3>
        <select class="select" value={f.maxTime} onChange={(e) => set({ maxTime: Number(e.currentTarget.value) })} aria-label="Tempo máximo">
          <option value={0}>Qualquer</option>
          {[15, 20, 30, 45, 60, 90].map((m) => (
            <option key={m} value={m}>até {m} min</option>
          ))}
        </select>
      </div>
      <div class="filter-group" role="group" aria-label="Ingredientes disponíveis">
        <h3>Ingredientes disponíveis</h3>
        <div class="chip-row">
          <Chip pressed={f.available === 'todos'} onClick={() => set({ available: f.available === 'todos' ? '' : 'todos' })}>Tenho tudo</Chip>
          <Chip pressed={f.available === 'poucos'} onClick={() => set({ available: f.available === 'poucos' ? '' : 'poucos' })}>Faltam até 2</Chip>
        </div>
      </div>
    </div>
  );
}

function Suggestions({ recipes, ctx }) {
  const results = useMemo(() => suggestRecipes(recipes, ctx), [recipes, ctx.pantry, ctx.ingredientsById]);
  return (
    <div>
      <p class="small muted" style="margin-bottom:12px">
        Comparação com o estoque registrado na despensa, para o número de porções de cada receita. Regras locais, sem envio de dados.
      </p>
      {SUGGESTION_LEVELS.map((lvl) => {
        const list = results.filter((r) => r.level === lvl.id);
        return (
          <section key={lvl.id} class="section" style="margin-top:12px" aria-label={lvl.label}>
            <h2 class="section-title">
              {lvl.label} <span class="small muted" style="font-weight:500">{list.length} · {lvl.description.toLowerCase()}</span>
            </h2>
            {list.length ? (
              <div class="recipe-grid">
                {list.slice(0, lvl.id === 'muitos' ? 8 : 100).map((r) => (
                  <RecipeCard
                    key={r.recipe.id}
                    recipe={r.recipe}
                    footer={
                      r.missing.length > 0 && (
                        <p class="rc-missing">
                          Falta: {r.missing.slice(0, 4).map((m) => m.name.toLowerCase()).join(', ')}
                          {r.missing.length > 4 ? '…' : ''}
                        </p>
                      )
                    }
                  />
                ))}
              </div>
            ) : (
              <p class="small muted">Nenhuma receita neste grupo.</p>
            )}
          </section>
        );
      })}
    </div>
  );
}
