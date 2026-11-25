// Montessori: guia de atividades de 0 a 3 anos, personalizado pela idade da
// criança. Sugestões do dia, biblioteca com filtros e busca, registro simples
// e histórico. Sem notas, metas ou comparações: as sugestões são convites.

import { useEffect, useMemo, useState } from 'preact/hooks';
import { Baby, Check, CheckCircle2, CircleHelp, History, Library, MoreHorizontal, Pencil, Plus, RefreshCw, Search, Sprout, X } from 'lucide-preact';
import { useStore } from '../storage/store.js';
import { clearDayPlan, setDayPlan } from '../storage/montessoriActions.js';
import { LIBRARY, sortedChildren } from '../data/montessoriLibrary.js';
import {
  AGE_BANDS,
  MAX_PER_DAY,
  MONTESSORI_CATEGORIES,
  STATUS_FILTERS,
  activityStats,
  addToPlan,
  autonomyLabel,
  bandOf,
  childAge,
  childLogs,
  dayPlan,
  doneOn,
  formatAge,
  groupLogsByDate,
  interestLabel,
  matchesStatus,
  montessoriCategory,
  regeneratePlan,
  removeFromPlan,
  swapInPlan,
} from '../models/montessori.js';
import { Chip, EmptyState, Menu, Modal, Segmented, toast } from '../components/ui.jsx';
import { useNow, usePref } from '../utils/hooks.js';
import { navigate } from '../utils/router.js';
import { formatDayMonth, todayISO, weekdayName } from '../utils/dates.js';
import { normalizeText } from '../utils/id.js';
import { ActivityCard, CategoryIcon, statsText } from './montessori/common.jsx';
import { ActivityDetail } from './montessori/ActivityDetail.jsx';
import { ChildFields, ChildModal, LogModal, emptyChildForm, submitChild } from './montessori/forms.jsx';

export function MontessoriPage({ params = {} }) {
  const s = useStore();
  const now = useNow();
  const today = todayISO(now);
  const children = useMemo(() => sortedChildren(s.children), [s.children]);
  const [childPref, setChildPref] = usePref('montessoriChild', null);
  const child = children.find((c) => c.id === childPref) ?? children[0] ?? null;

  const childId = child?.id ?? null;
  const allLogs = useMemo(() => Object.values(s.montessoriLogs), [s.montessoriLogs]);
  const logs = useMemo(() => (childId ? childLogs(allLogs, childId) : []), [allLogs, childId]);
  const stats = useMemo(() => (childId ? activityStats(logs, childId) : null), [logs, childId]);
  const age = child ? childAge(child, today) : null;
  const band = age ? bandOf(Math.max(0, age.months)) : null;
  const plan = useMemo(
    () => (child ? dayPlan({ activities: LIBRARY.activities, byId: LIBRARY.byId, child, logs, date: today }) : { ids: [], custom: false }),
    [child, logs, today],
  );
  const doneToday = useMemo(() => (childId ? doneOn(logs, childId, today) : new Set()), [logs, childId, today]);

  const [tab, setTab] = usePref('montessoriTab', 'biblioteca');
  const [detailId, setDetailId] = useState(params.atividade ?? null);
  const [logForm, setLogForm] = useState(null); // { activityId, log? }
  const [childForm, setChildForm] = useState(null); // { child }
  const [about, setAbout] = useState(false);
  const [homeCard, setHomeCard] = usePref('montessoriHomeCard', true);

  // Link vindo do card do Cardápio: #/montessori?atividade=<id>
  useEffect(() => {
    if (params.atividade) setDetailId(params.atividade);
  }, [params.atividade]);

  const closeDetail = () => {
    setDetailId(null);
    if (params.atividade) navigate('/montessori', { replace: true });
  };

  const savePlan = (ids, round) => setDayPlan(child.id, today, ids, round);
  const actions = {
    regenerate: () => {
      const round = (child.plan?.date === today ? (child.plan.round ?? 0) : 0) + 1;
      // As já feitas hoje continuam na lista (e marcadas na tela e-ink); as outras são trocadas.
      const ids = regeneratePlan({ activities: LIBRARY.activities, child, logs, date: today, current: plan.ids, keep: [...doneToday], round });
      savePlan(ids, round);
      toast('Novas sugestões para hoje');
    },
    swap: (id) => {
      const ids = swapInPlan({ activities: LIBRARY.activities, child, logs, date: today, current: plan.ids, id });
      if (ids === plan.ids) return toast('Não há outra atividade indicada para trocar agora', { type: 'error' });
      savePlan(ids);
    },
    toggleToday: (id) => {
      if (plan.ids.includes(id)) {
        savePlan(removeFromPlan(plan.ids, id));
        toast('Tirada das atividades de hoje');
      } else {
        savePlan(addToPlan(plan.ids, id));
        toast('Incluída nas atividades de hoje');
      }
    },
    reset: () => {
      clearDayPlan(child.id);
      toast('Sugestões automáticas de volta');
    },
  };

  const detail = detailId ? LIBRARY.byId[detailId] : null;
  const logActivity = logForm ? LIBRARY.byId[logForm.activityId] : null;

  return (
    <div class="mt-page">
      <div class="page-head">
        <div class="grow">
          <h1>Montessori</h1>
          <p class="sub">Atividades para acompanhar e estimular o desenvolvimento, de 0 a 3 anos</p>
        </div>
        <div class="toolbar">
          <button type="button" class="btn btn-secondary" onClick={() => setAbout(true)}>
            <CircleHelp size={16} /> <span class="hide-mobile">Sobre o guia</span>
          </button>
          {child && (
            <Menu
              trigger={(p) => (
                <button type="button" class="btn btn-secondary" aria-label={p.label} aria-expanded={p.open} onClick={p.toggle}>
                  <MoreHorizontal size={16} /> <span class="hide-mobile">Mais</span>
                </button>
              )}
            >
              <button type="button" role="menuitem" onClick={() => setChildForm({ child })}>
                <Pencil size={16} /> Editar cadastro de {child.name}
              </button>
              <button type="button" role="menuitem" onClick={() => setChildForm({ child: null })}>
                <Plus size={16} /> Cadastrar outra criança
              </button>
              <button type="button" role="menuitem" onClick={() => setHomeCard(!homeCard)}>
                <Sprout size={16} /> {homeCard ? 'Esconder' : 'Mostrar'} o card no Cardápio
              </button>
            </Menu>
          )}
        </div>
      </div>

      {children.length > 1 && (
        <div class="chip-row scroll" role="group" aria-label="Criança" style="margin-bottom:12px">
          {children.map((c) => (
            <Chip key={c.id} pressed={c.id === child?.id} onClick={() => setChildPref(c.id)}>
              <Baby size={14} /> {c.name}
            </Chip>
          ))}
        </div>
      )}

      {child ? (
        <>
          <ChildHeader child={child} age={age} band={band} onEdit={() => setChildForm({ child })} />
          <TodaySection
            child={child}
            plan={plan}
            stats={stats}
            done={doneToday}
            today={today}
            onOpen={setDetailId}
            onRegister={(id) => setLogForm({ activityId: id })}
            actions={actions}
          />
        </>
      ) : (
        <Welcome />
      )}

      <div class="section mt-tabs">
        <Segmented
          options={[
            { id: 'biblioteca', label: 'Biblioteca', icon: Library, count: LIBRARY.activities.length },
            ...(child ? [{ id: 'historico', label: 'Histórico', icon: History, count: logs.length }] : []),
          ]}
          value={child ? tab : 'biblioteca'}
          onChange={setTab}
          label="Biblioteca ou histórico"
        />
      </div>

      {child && tab === 'historico' ? (
        <HistoryList child={child} logs={logs} today={today} onOpen={setDetailId} onEdit={(log) => setLogForm({ activityId: log.activityId, log })} />
      ) : (
        <LibraryList band={band} stats={stats} today={today} planIds={plan.ids} onOpen={setDetailId} />
      )}

      {detail && (
        <ActivityDetail
          activity={detail}
          child={child}
          age={age}
          logs={logs}
          today={today}
          inToday={plan.ids.includes(detail.id)}
          canAddToday={!!child && plan.ids.length < MAX_PER_DAY}
          onRegister={() => setLogForm({ activityId: detail.id })}
          onEditLog={(log) => setLogForm({ activityId: log.activityId, log })}
          onToggleToday={() => actions.toggleToday(detail.id)}
          onClose={closeDetail}
        />
      )}
      {logForm && child && <LogModal activity={logActivity ?? { id: logForm.activityId, nome: 'Atividade removida do catálogo' }} child={child} log={logForm.log} onClose={() => setLogForm(null)} />}
      {childForm && <ChildModal child={childForm.child} onClose={() => setChildForm(null)} onSaved={(c) => setChildPref(c.id)} />}
      {about && <AboutModal onClose={() => setAbout(false)} />}
    </div>
  );
}

// ---------- Criança ----------

function ChildHeader({ child, age, band, onEdit }) {
  return (
    <>
      <section class="card card-pad mt-child" aria-label={`Criança: ${child.name}`}>
        <span class="mt-avatar" aria-hidden="true">
          <Baby size={24} />
        </span>
        <div class="grow" style="min-width:0">
          <h2 class="mt-child-name">{child.name}</h2>
          <p class="mt-child-age">
            {formatAge(age)}
            {age?.corrected && <span class="small muted"> (idade corrigida · {formatAge(age.real)} de vida)</span>}
          </p>
        </div>
        {band && (
          <div class="mt-phase">
            <span class="card-title">Fase atual</span>
            <strong>{band.label}</strong>
          </div>
        )}
        <button type="button" class="icon-btn" onClick={onEdit} aria-label={`Editar cadastro de ${child.name}`} title="Editar cadastro">
          <Pencil size={18} />
        </button>
      </section>
      {age && age.months >= 36 && (
        <div class="notice info" style="margin-top:12px">
          <Sprout size={18} />
          <span>A biblioteca vai até os 3 anos. As sugestões continuam com as atividades de 2 a 3 anos, que seguem úteis no dia a dia.</span>
        </div>
      )}
    </>
  );
}

function Welcome() {
  const [form, setForm] = useState(() => emptyChildForm());
  const [errors, setErrors] = useState({});
  return (
    <section class="card card-pad form-section mt-welcome" aria-labelledby="mt-welcome">
      <h2 id="mt-welcome" class="section-title" style="margin:0">
        <Baby size={18} /> Comece cadastrando a criança
      </h2>
      <p class="small muted" style="margin:0">
        Com a data de nascimento, o PanelAI calcula a idade, mostra a fase de desenvolvimento e sugere três atividades por dia. A biblioteca abaixo pode ser consultada
        mesmo sem cadastro.
      </p>
      <form
        class="form-section"
        onSubmit={(e) => {
          e.preventDefault();
          if (submitChild(form, setErrors)) toast('Cadastro salvo');
        }}
      >
        <ChildFields form={form} setForm={setForm} errors={errors} />
        <div class="toolbar">
          <button type="submit" class="btn btn-primary">
            <Check size={16} /> Salvar cadastro
          </button>
        </div>
      </form>
    </section>
  );
}

// ---------- Hoje ----------

function TodaySection({ child, plan, stats, done, today, onOpen, onRegister, actions }) {
  const items = plan.ids.map((id) => LIBRARY.byId[id]).filter(Boolean);
  return (
    <section class="section mt-today" aria-labelledby="mt-hoje">
      <div class="mt-section-head">
        <h2 id="mt-hoje" class="section-title" style="margin:0">
          Sugestões para hoje
        </h2>
        <button type="button" class="btn btn-secondary btn-sm" onClick={actions.regenerate}>
          <RefreshCw size={15} /> Novas sugestões
        </button>
      </div>
      <p class="small muted mt-today-hint">
        Convites, não obrigações: siga o interesse e o ritmo de {child.name}.{' '}
        {plan.custom && (
          <button type="button" class="link-btn" onClick={actions.reset}>
            Voltar às sugestões automáticas
          </button>
        )}
      </p>
      {items.length ? (
        <div class="mt-today-grid">
          {items.map((a) => (
            <TodayItem key={a.id} activity={a} st={stats?.get(a.id)} done={done.has(a.id)} today={today} onOpen={onOpen} onRegister={onRegister} onSwap={actions.swap} />
          ))}
        </div>
      ) : (
        <div class="card">
          <EmptyState
            icon={Sprout}
            title="Nenhuma atividade escolhida para hoje"
            action={
              <button type="button" class="btn btn-soft" onClick={actions.regenerate}>
                <RefreshCw size={16} /> Sugerir atividades
              </button>
            }
          >
            Tudo bem ter dias livres. Se quiser, peça sugestões ou inclua uma atividade pela biblioteca.
          </EmptyState>
        </div>
      )}
    </section>
  );
}

function TodayItem({ activity: a, st, done, today, onOpen, onRegister, onSwap }) {
  const cat = montessoriCategory(a.categoria);
  return (
    <article class={`mt-today-item ${done ? 'done' : ''}`} style={{ '--cat': cat?.color }} aria-label={a.nome}>
      <button type="button" class="mt-today-main" onClick={() => onOpen(a.id)}>
        <CategoryIcon id={a.categoria} size={18} />
        <span class="mt-card-title">
          <span class="mt-card-name">{a.nome}</span>
          <span class="mt-card-meta">
            {cat?.short}
            {a.rotinaDaCasa ? ' · rotina da casa' : ''}
          </span>
          <span class="mt-card-desc">{a.descricao}</span>
        </span>
      </button>
      <div class="mt-today-foot">
        {done ? (
          <span class="badge badge-green">
            <Check size={12} strokeWidth={3} /> Feita hoje
          </span>
        ) : (
          <span class="xsmall muted">{statsText(st, today)}</span>
        )}
        <span class="grow" />
        {!done && (
          <button type="button" class="icon-btn sm" onClick={() => onSwap(a.id)} aria-label={`Trocar “${a.nome}” por outra atividade`} title="Trocar por outra">
            <RefreshCw size={16} />
          </button>
        )}
        <button type="button" class="btn btn-soft btn-sm" onClick={() => onRegister(a.id)} aria-label={`Registrar “${a.nome}”`}>
          <CheckCircle2 size={15} /> Registrar
        </button>
      </div>
    </article>
  );
}

// ---------- Biblioteca ----------

const toggleIn = (list, id) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

function LibraryList({ band, stats, today, planIds, onOpen }) {
  const [query, setQuery] = useState('');
  const [bandFilter, setBandFilter] = useState(null); // null: fase atual (com criança) ou todas
  const [cats, setCats] = useState([]);
  const [status, setStatus] = useState('todas');
  const effBand = bandFilter ?? band?.id ?? 'todas';

  const filtered = useMemo(() => {
    const q = normalizeText(query);
    return LIBRARY.activities
      .filter((a) => effBand === 'todas' || a.faixa === effBand)
      .filter((a) => !cats.length || cats.includes(a.categoria))
      .filter((a) => !stats || matchesStatus(stats, a.id, status))
      .filter((a) => !q || [a.nome, a.descricao, ...a.habilidades, ...a.materiais].some((t) => normalizeText(t).includes(q)));
  }, [query, effBand, cats, status, stats]);

  const groups = AGE_BANDS.map((b) => ({ band: b, list: filtered.filter((a) => a.faixa === b.id) })).filter((g) => g.list.length);
  const nActive = (query ? 1 : 0) + (bandFilter && bandFilter !== (band?.id ?? 'todas') ? 1 : 0) + cats.length + (status !== 'todas' ? 1 : 0);
  const clear = () => {
    setQuery('');
    setBandFilter(null);
    setCats([]);
    setStatus('todas');
  };

  return (
    <div class="mt-library">
      <div class="filters-bar">
        <div class="search-input">
          <Search size={18} />
          <input
            class="input"
            type="search"
            data-search
            value={query}
            placeholder="Buscar atividade, material ou habilidade"
            aria-label="Buscar atividades"
            onInput={(e) => setQuery(e.currentTarget.value)}
          />
        </div>
        {nActive > 0 && (
          <button type="button" class="btn btn-ghost" onClick={clear}>
            <X size={16} /> Limpar filtros
          </button>
        )}
      </div>
      <div class="mt-filters">
        <div class="chip-row scroll" role="group" aria-label="Faixa etária">
          <Chip pressed={effBand === 'todas'} onClick={() => setBandFilter('todas')}>
            Todas as idades
          </Chip>
          {AGE_BANDS.map((b) => (
            <Chip key={b.id} pressed={effBand === b.id} onClick={() => setBandFilter(b.id)}>
              {b.label}
              {band?.id === b.id ? ' · atual' : ''}
            </Chip>
          ))}
        </div>
        <div class="chip-row scroll" role="group" aria-label="Categoria">
          {MONTESSORI_CATEGORIES.map((c) => (
            <Chip key={c.id} pressed={cats.includes(c.id)} onClick={() => setCats((cur) => toggleIn(cur, c.id))} title={c.label}>
              <CategoryIcon id={c.id} size={12} /> {c.label}
            </Chip>
          ))}
        </div>
        {stats && (
          <div class="chip-row scroll" role="group" aria-label="Status">
            {STATUS_FILTERS.map((f) => (
              <Chip key={f.id} pressed={status === f.id} onClick={() => setStatus(f.id)}>
                {f.label}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <p class="small muted" style="margin:4px 0 10px">
        {filtered.length === 1 ? '1 atividade' : `${filtered.length} atividades`}
        {status === 'preferida' ? ' · preferidas = interesse alto na última vez' : ''}
      </p>

      {groups.length ? (
        groups.map((g) => (
          <section key={g.band.id} class="mt-group" aria-label={g.band.label}>
            <h3 class="mt-group-title">
              {g.band.label}
              {band?.id === g.band.id && <span class="badge badge-green">Fase atual</span>}
            </h3>
            <div class="mt-grid">
              {g.list.map((a) => (
                <ActivityCard key={a.id} activity={a} stats={stats} today={today} current={planIds.includes(a.id)} onOpen={onOpen} />
              ))}
            </div>
          </section>
        ))
      ) : (
        <div class="card">
          <EmptyState
            icon={Library}
            title="Nenhuma atividade encontrada"
            action={
              <button type="button" class="btn btn-soft" onClick={clear}>
                Limpar filtros
              </button>
            }
          >
            {effBand !== 'todas' ? 'Experimente procurar em todas as idades.' : 'Ajuste a busca ou os filtros.'}
          </EmptyState>
        </div>
      )}
    </div>
  );
}

// ---------- Histórico ----------

function HistoryList({ child, logs, today, onOpen, onEdit }) {
  const [limit, setLimit] = useState(40);
  if (!logs.length) {
    return (
      <div class="card">
        <EmptyState icon={History} title="Nenhum registro ainda">
          Quando você registrar uma atividade de {child.name}, ela aparece aqui, com a data, o interesse e a autonomia.
        </EmptyState>
      </div>
    );
  }
  const distinct = new Set(logs.map((l) => l.activityId)).size;
  const groups = groupLogsByDate(logs.slice(0, limit));
  return (
    <div class="mt-history">
      <p class="small muted" style="margin:0 0 10px">
        {logs.length === 1 ? '1 registro' : `${logs.length} registros`} · {distinct === 1 ? '1 atividade diferente' : `${distinct} atividades diferentes`}
      </p>
      {groups.map((g) => (
        <section key={g.date} class="card mt-history-day" aria-label={`${weekdayName(g.date)}, ${formatDayMonth(g.date)}`}>
          <h3 class="mt-history-date">
            {g.date === today ? 'Hoje' : weekdayName(g.date)}, {formatDayMonth(g.date)}
          </h3>
          <ul class="mt-log-list">
            {g.logs.map((l) => {
              const a = LIBRARY.byId[l.activityId];
              return (
                <li key={l.id}>
                  {a ? <CategoryIcon id={a.categoria} size={14} /> : <span class="mt-cat-icon" aria-hidden="true" />}
                  <div class="grow" style="min-width:0">
                    {a ? (
                      <button type="button" class="link-btn mt-log-name" onClick={() => onOpen(a.id)}>
                        {a.nome}
                      </button>
                    ) : (
                      <strong>Atividade que saiu do catálogo ({l.activityId})</strong>
                    )}
                    <div class="mt-log-badges">
                      <span class="badge badge-outline">Interesse {interestLabel(l.interest).toLowerCase()}</span>
                      <span class="badge badge-outline">{autonomyLabel(l.autonomy)}</span>
                      {l.createdBy && <span class="xsmall muted">por {l.createdBy}</span>}
                    </div>
                    {l.notes && <p class="small mt-log-notes">{l.notes}</p>}
                  </div>
                  <button type="button" class="icon-btn sm" aria-label={`Editar o registro de ${a?.nome ?? 'atividade'} em ${formatDayMonth(l.date)}`} onClick={() => onEdit(l)}>
                    <Pencil size={16} />
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
      {logs.length > limit && (
        <div class="toolbar" style="justify-content:center;margin-top:12px">
          <button type="button" class="btn btn-secondary" onClick={() => setLimit((n) => n + 40)}>
            Mostrar mais
          </button>
        </div>
      )}
    </div>
  );
}

// ---------- Sobre ----------

function AboutModal({ onClose }) {
  const book = LIBRARY.book;
  return (
    <Modal open onClose={onClose} title="Sobre o guia Montessori" size="lg">
      <div class="form-section mt-about">
        <p style="margin:0">
          A abordagem Montessori para os primeiros anos parte da observação: preparar um ambiente seguro e simples, oferecer atividades adequadas à fase da criança,
          mostrar devagar e deixar que ela explore e repita no próprio ritmo. As idades são aproximadas — cada criança tem o seu tempo.
        </p>

        <section>
          <h3 class="mt-h3">Como as sugestões do dia são escolhidas</h3>
          <ul class="mt-list">
            <li>Só atividades indicadas para a idade da criança (com idade corrigida para prematuros até os 2 anos).</li>
            <li>Primeiro as da fase atual; as de fases anteriores continuam aparecendo.</li>
            <li>Categorias variadas e, sempre que possível, uma atividade da rotina da casa.</li>
            <li>Atividades ainda não apresentadas e as feitas há mais tempo têm preferência; as de interesse alto voltam com mais frequência.</li>
            <li>Interesse baixo afasta a atividade por duas semanas — depois ela volta, porque o momento da criança muda.</li>
            <li>As sugestões são as mesmas em todos os aparelhos e na tela e-ink. “Novas sugestões”, “Trocar” e “Incluir” mudam a lista do dia para todos.</li>
          </ul>
        </section>

        {book && (
          <section>
            <h3 class="mt-h3">O livro de referência</h3>
            <p class="small" style="margin:0">
              <strong>{book.titulo}</strong> — {book.autora}. {book.editora}, {book.ano}. ISBN {book.isbn}.
            </p>
            <p class="small muted" style="margin:6px 0 0">{book.observacao}</p>
          </section>
        )}

        <section>
          <h3 class="mt-h3">Referências usadas nas atividades</h3>
          <ul class="mt-list small">
            {Object.entries(LIBRARY.references).map(([id, text]) => (
              <li key={id}>{text}</li>
            ))}
          </ul>
        </section>

        <section class="notice mt-safety">
          <div>
            <h3 class="mt-h3" style="margin-top:0">Cuidados gerais</h3>
            <ul class="mt-list">
              {LIBRARY.generalSafety.map((x) => (
                <li key={x}>{x}</li>
              ))}
            </ul>
          </div>
        </section>

        <section>
          <h3 class="mt-h3">Acrescentar atividades</h3>
          <p class="small muted" style="margin:0">
            A biblioteca fica no arquivo <code>src/data/montessori_activities.json</code>. {LIBRARY.howToAdd}
          </p>
        </section>
      </div>
    </Modal>
  );
}
