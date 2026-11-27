// Categorias opcionais de uma comida escrita à mão (as mesmas das receitas):
// Proteína (e o tipo), Legumes e verduras, Frutas, Carboidrato, Leguminosa, Massa. Entram no equilíbrio da semana.

import { Chip } from '../../components/ui.jsx';
import { COMPOSITION, PROTEINS } from '../../models/constants.js';
import { cleanMealTags } from '../../services/mealTexts.js';

export function MealTags({ value, onChange, hint = true }) {
  const t = cleanMealTags(value);
  const toggleComp = (id) => {
    const on = t.composition.includes(id);
    const composition = on ? t.composition.filter((x) => x !== id) : [...t.composition, id];
    // Tirar "Proteína" tira também o tipo.
    onChange(cleanMealTags({ composition, protein: id === 'proteina' && on ? null : t.protein }));
  };
  const setProtein = (id) => onChange(cleanMealTags({ composition: t.composition, protein: t.protein === id ? null : id }));
  return (
    <div class="field meal-tags">
      <span class="label">
        Tem o quê? <span class="muted" style="font-weight:400">(opcional)</span>
      </span>
      <div class="chip-row" role="group" aria-label="Categorias da comida">
        {COMPOSITION.map((c) => (
          <Chip key={c.id} pressed={t.composition.includes(c.id)} onClick={() => toggleComp(c.id)}>
            {c.label}
          </Chip>
        ))}
      </div>
      {t.composition.includes('proteina') && (
        <div class="chip-row" role="group" aria-label="Tipo de proteína">
          {PROTEINS.map((p) => (
            <Chip key={p.id} pressed={t.protein === p.id} onClick={() => setProtein(p.id)}>
              {p.label}
            </Chip>
          ))}
        </div>
      )}
      {hint && <span class="hint">Ajuda no equilíbrio da semana. Fica guardado: da próxima vez que escrever esta comida, já vem marcado.</span>}
    </div>
  );
}
