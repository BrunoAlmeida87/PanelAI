// Peças da aba Montessori usadas em mais de um lugar.

import { Check, Ear, Fingerprint, Hand, House, Puzzle, Shapes } from 'lucide-preact';
import { formatMinAge, montessoriCategory } from '../../models/montessori.js';
import { formatDayMonth } from '../../utils/dates.js';

const ICONS = {
  coordenacao: Hand,
  'formas-cores': Shapes,
  linguagem: Ear,
  tatil: Fingerprint,
  cognitivo: Puzzle,
  'vida-pratica': House,
};

/** Ícone da categoria num círculo com a cor (discreta) da categoria. */
export function CategoryIcon({ id, size = 16 }) {
  const Icon = ICONS[id] ?? Shapes;
  const color = montessoriCategory(id)?.color ?? '#747874';
  return (
    <span class="mt-cat-icon" style={{ '--cat': color }} aria-hidden="true">
      <Icon size={size} />
    </span>
  );
}

/** "Feita 3× · última em 12/11", "Feita hoje", "Ainda não apresentada". */
export function statsText(st, today) {
  if (!st) return 'Ainda não apresentada';
  const when = st.last === today ? 'hoje' : `em ${formatDayMonth(st.last)}`;
  return st.count === 1 ? `Feita 1× · ${when}` : `Feita ${st.count}× · última ${when}`;
}

/** Card compacto da biblioteca. */
export function ActivityCard({ activity: a, stats, today, current = false, onOpen }) {
  const cat = montessoriCategory(a.categoria);
  const st = stats?.get(a.id);
  return (
    <button type="button" class={`mt-card ${current ? 'current' : ''}`} style={{ '--cat': cat?.color }} onClick={() => onOpen(a.id)}>
      <span class="mt-card-head">
        <CategoryIcon id={a.categoria} />
        <span class="mt-card-title">
          <span class="mt-card-name">{a.nome}</span>
          <span class="mt-card-meta">
            {cat?.short} · {formatMinAge(a.idadeMinimaMeses)}
          </span>
        </span>
      </span>
      <span class="mt-card-desc">{a.descricao}</span>
      <span class="mt-card-foot">
        {stats && (
          <span class={`mt-card-status ${st ? 'done' : ''}`}>
            {st && <Check size={12} strokeWidth={3} />} {statsText(st, today)}
          </span>
        )}
        {a.rotinaDaCasa && <span class="badge badge-green">Rotina da casa</span>}
      </span>
    </button>
  );
}
