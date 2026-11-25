// Card "Montessori hoje" na página inicial (Cardápio). Baixado só quando há
// criança cadastrada; tocar numa atividade abre o detalhe na aba Montessori.

import { useMemo } from 'preact/hooks';
import { Check, Sprout } from 'lucide-preact';
import { useStore } from '../../storage/store.js';
import { montessoriToday } from '../../data/montessoriLibrary.js';
import { formatAge } from '../../models/montessori.js';
import { useNow } from '../../utils/hooks.js';
import { todayISO } from '../../utils/dates.js';
import { CategoryIcon } from './common.jsx';

export function TodayCard() {
  const s = useStore();
  const today = todayISO(useNow());
  const children = s.children;
  const logs = s.montessoriLogs;
  const list = useMemo(() => montessoriToday({ children, montessoriLogs: logs }, today), [children, logs, today]);
  if (!list.length) return null;
  return (
    <section class="card card-pad mt-home" aria-labelledby="mt-home-title">
      <div class="mt-home-head">
        <h2 id="mt-home-title" class="card-title">
          <Sprout size={14} /> Montessori hoje
        </h2>
        <a class="link-btn small" href="#/montessori">
          Ver tudo
        </a>
      </div>
      {list.map(({ child, age, items }) => (
        <div key={child.id} class="mt-home-kid">
          <span class="mt-home-name">
            {child.name}
            {age ? <span class="muted"> · {formatAge(age)}</span> : null}
          </span>
          {items.length ? (
            <ul class="mt-home-items">
              {items.map(({ activity: a, done }) => (
                <li key={a.id}>
                  <a href={`#/montessori?atividade=${a.id}&crianca=${child.id}`} class={done ? 'done' : ''} aria-label={`${a.nome}${done ? ' (feita hoje)' : ''}`}>
                    <CategoryIcon id={a.categoria} size={13} />
                    <span class="txt">{a.nome}</span>
                    {done && <Check size={14} strokeWidth={3} class="mt-ok" />}
                  </a>
                </li>
              ))}
            </ul>
          ) : (
            <p class="small muted" style="margin:0">Nenhuma atividade escolhida para hoje.</p>
          )}
        </div>
      ))}
    </section>
  );
}
