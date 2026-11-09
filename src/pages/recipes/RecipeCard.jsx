import { Beef, Box, Clock, Drumstick, Egg, Fish, Ham, Leaf, Sandwich, Shell, Star, Users } from 'lucide-preact';
import { toggleRecipeFavorite } from '../../storage/actions.js';
import { recipeSubtitle, speedBadge } from '../menu/common.js';

const COVER = {
  frango: { bg: '#F6EEDA', fg: '#B8893A', icon: Drumstick },
  bovina: { bg: '#F6E5E1', fg: '#A8645A', icon: Beef },
  suina: { bg: '#F9E9E5', fg: '#C98B80', icon: Ham },
  peixe: { bg: '#E8EFF4', fg: '#5F7F96', icon: Fish },
  'frutos-do-mar': { bg: '#E6F0F2', fg: '#4F8794', icon: Shell },
  ovos: { bg: '#FBF3DD', fg: '#B8893A', icon: Egg },
  'sem-carne': { bg: '#E7EFE8', fg: '#52765D', icon: Leaf },
};

export function RecipeCover({ recipe, size = 40 }) {
  if (recipe.image) return <img src={recipe.image} alt="" loading="lazy" />;
  const c = COVER[recipe.protein] ?? COVER['sem-carne'];
  const Icon = recipe.category === 'lanche' && recipe.protein !== 'sem-carne' ? Sandwich : c.icon;
  return (
    <div style={`width:100%;height:100%;display:grid;place-items:center;background:${c.bg};color:${c.fg}`} aria-hidden="true">
      <Icon size={size} strokeWidth={1.5} />
    </div>
  );
}

export function RecipeCard({ recipe, footer }) {
  const sb = speedBadge(recipe);
  return (
    <article class="recipe-card">
      <a class="rc-link" href={`#/receitas/${recipe.id}`}>
        <div class="rc-cover">
          <RecipeCover recipe={recipe} />
        </div>
        <div class="rc-body">
          <div class="rc-badges">
            <span class={`badge ${sb.cls}`}>{sb.label}</span>
            {recipe.marmita && (
              <span class="badge badge-coral">
                <Box size={11} /> Marmita
              </span>
            )}
          </div>
          <h3 class="rc-name">{recipe.name}</h3>
          <p class="rc-sub">{recipeSubtitle(recipe)}</p>
          <div class="rc-meta">
            <span>
              <Clock size={13} /> {recipe.time} min
            </span>
            <span>
              <Users size={13} /> {recipe.servings} porç.
            </span>
          </div>
          {footer}
        </div>
      </a>
      <button
        type="button"
        class="rc-fav"
        aria-pressed={recipe.favorite ? 'true' : 'false'}
        aria-label={recipe.favorite ? `Remover ${recipe.name} das favoritas` : `Favoritar ${recipe.name}`}
        onClick={() => toggleRecipeFavorite(recipe.id)}
      >
        <Star size={18} fill={recipe.favorite ? 'currentColor' : 'none'} />
      </button>
    </article>
  );
}
