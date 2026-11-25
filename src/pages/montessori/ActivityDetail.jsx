// Detalhe de uma atividade: tudo o que é preciso para preparar e apresentar,
// os cuidados de segurança, as referências e o histórico da criança nela.

import { useState } from 'preact/hooks';
import { BookOpen, CalendarMinus, CalendarPlus, CheckCircle2, Clock, Info, Pencil, ShieldAlert } from 'lucide-preact';
import { LIBRARY } from '../../data/montessoriLibrary.js';
import { autonomyLabel, bandById, formatAge, formatMinAge, interestLabel, montessoriCategory } from '../../models/montessori.js';
import { Modal } from '../../components/ui.jsx';
import { diffDays, formatDayMonth, formatLongDate } from '../../utils/dates.js';
import { CategoryIcon } from './common.jsx';

export function ActivityDetail({ activity: a, child, age, logs, today, inToday, canAddToday, onRegister, onEditLog, onToggleToday, onClose }) {
  const [showGeneral, setShowGeneral] = useState(false);
  const cat = montessoriCategory(a.categoria);
  const band = bandById(a.faixa);
  const mine = logs.filter((l) => l.activityId === a.id);
  const last = mine[0];
  const months = age ? Math.max(0, age.months) : null;
  const tooYoung = months != null && months < a.idadeMinimaMeses;
  const pastAge = months != null && a.idadeMaximaMeses != null && months >= a.idadeMaximaMeses;
  const refs = a.referencias.map((id) => LIBRARY.references[id]).filter(Boolean);

  return (
    <Modal open onClose={onClose} title={a.nome} subtitle={`${cat?.label} · ${formatMinAge(a.idadeMinimaMeses)}`} size="lg">
      <div class="form-section mt-detail">
        <div class="chip-row">
          <span class="mt-cat-pill" style={{ '--cat': cat?.color }}>
            <CategoryIcon id={a.categoria} size={14} /> {cat?.short}
          </span>
          <span class="badge badge-outline">Faixa {band?.label}</span>
          {a.rotinaDaCasa && <span class="badge badge-green">Rotina da casa</span>}
          <span class="badge badge-blue" title={a.origem === 'livro' ? 'Atividade conferida no livro' : 'Não atribuída ao livro: baseada na metodologia Montessori'}>
            {a.origem === 'livro' ? `Do livro${a.pagina ? `, p. ${a.pagina}` : ''}` : 'Complementar (método Montessori)'}
          </span>
        </div>

        {child && (
          <div class="sub-panel mt-detail-child">
            <p style="margin:0">
              {last ? (
                <>
                  <CheckCircle2 size={16} class="mt-ok" /> {child.name} fez esta atividade <strong>{mine.length === 1 ? '1 vez' : `${mine.length} vezes`}</strong>. Última:{' '}
                  <strong>{last.date === today ? 'hoje' : `${formatLongDate(last.date)} (há ${diffDays(last.date, today)} dias)`}</strong>.
                </>
              ) : (
                <>Ainda não apresentada para {child.name}.</>
              )}
            </p>
            {tooYoung && (
              <p class="small" style="margin:6px 0 0">
                <Info size={14} /> Costuma ser oferecida {formatMinAge(a.idadeMinimaMeses)}; {child.name} está com {formatAge(age)}. Cada criança tem o seu ritmo — observe se há interesse e prontidão.
              </p>
            )}
            {pastAge && (
              <p class="small" style="margin:6px 0 0">
                <Info size={14} /> Costuma ser usada até {a.idadeMaximaMeses} meses. Se ainda houver interesse, pode continuar.
              </p>
            )}
            <div class="toolbar" style="margin-top:10px">
              <button type="button" class="btn btn-primary" onClick={onRegister}>
                <CheckCircle2 size={16} /> Registrar realização
              </button>
              {(inToday || canAddToday) && (
                <button type="button" class="btn btn-secondary" onClick={onToggleToday}>
                  {inToday ? <CalendarMinus size={16} /> : <CalendarPlus size={16} />} {inToday ? 'Tirar das atividades de hoje' : 'Incluir nas atividades de hoje'}
                </button>
              )}
            </div>
          </div>
        )}

        <p style="margin:0">{a.descricao}</p>

        {a.habilidades.length > 0 && (
          <section aria-labelledby="mt-hab">
            <h3 id="mt-hab" class="mt-h3">Habilidades estimuladas</h3>
            <div class="chip-row">
              {a.habilidades.map((h) => (
                <span key={h} class="badge badge-outline mt-skill">
                  {h}
                </span>
              ))}
            </div>
          </section>
        )}

        <section aria-labelledby="mt-mat">
          <h3 id="mt-mat" class="mt-h3">Materiais</h3>
          <ul class="mt-list">
            {a.materiais.map((m) => (
              <li key={m}>{m}</li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="mt-passos">
          <h3 id="mt-passos" class="mt-h3">Como fazer</h3>
          <ol class="mt-list mt-steps">
            {a.passos.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ol>
        </section>

        {a.duracao && (
          <p class="small" style="margin:0;display:flex;gap:6px;align-items:flex-start">
            <Clock size={16} style="flex:none;margin-top:2px" /> <span><strong>Duração:</strong> {a.duracao}</span>
          </p>
        )}

        <section class="notice mt-safety" aria-labelledby="mt-seg">
          <ShieldAlert size={18} />
          <div class="grow">
            <h3 id="mt-seg" class="mt-h3" style="margin-top:0">Cuidados de segurança</h3>
            <ul class="mt-list">
              {a.seguranca.map((x) => (
                <li key={x}>{x}</li>
              ))}
              <li>Sempre com um adulto por perto. Se a criança não quiser, tudo bem: tente outro dia.</li>
            </ul>
            <button type="button" class="link-btn small" onClick={() => setShowGeneral((v) => !v)} aria-expanded={showGeneral}>
              {showGeneral ? 'Esconder cuidados gerais' : 'Ver cuidados gerais (todas as atividades)'}
            </button>
            {showGeneral && (
              <ul class="mt-list" style="margin-top:6px">
                {LIBRARY.generalSafety.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <section aria-labelledby="mt-ref">
          <h3 id="mt-ref" class="mt-h3">
            <BookOpen size={15} /> Referências
          </h3>
          {refs.length ? (
            <ul class="mt-list small muted">
              {refs.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          ) : (
            <p class="small muted" style="margin:0">Atividade complementar baseada na metodologia Montessori, sem referência específica.</p>
          )}
          {a.origem !== 'livro' && (
            <p class="xsmall muted" style="margin:6px 0 0">
              Não atribuída ao livro de Maria Stampfer: as idades são orientações aproximadas das fontes acima.
            </p>
          )}
        </section>

        {child && mine.length > 0 && (
          <section aria-labelledby="mt-hist">
            <h3 id="mt-hist" class="mt-h3">Registros de {child.name}</h3>
            <ul class="mt-log-list">
              {mine.slice(0, 8).map((l) => (
                <li key={l.id}>
                  <div class="grow">
                    <strong>{l.date === today ? 'Hoje' : formatDayMonth(l.date)}</strong>
                    <span class="small muted"> · interesse {interestLabel(l.interest).toLowerCase()} · {autonomyLabel(l.autonomy).toLowerCase()}</span>
                    {l.notes && <p class="small" style="margin:2px 0 0;white-space:pre-wrap">{l.notes}</p>}
                  </div>
                  <button type="button" class="icon-btn sm" aria-label={`Editar o registro de ${formatDayMonth(l.date)}`} onClick={() => onEditLog(l)}>
                    <Pencil size={16} />
                  </button>
                </li>
              ))}
            </ul>
            {mine.length > 8 && <p class="xsmall muted">Mais {mine.length - 8} registros no histórico.</p>}
          </section>
        )}
      </div>
    </Modal>
  );
}
