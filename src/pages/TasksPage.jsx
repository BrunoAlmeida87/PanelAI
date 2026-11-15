// Tarefas da semana: o que fazer em cada dia, quem fez, pendências, recados,
// adiamentos (com a data de origem) e tarefas salvas/fixas para repetir.

import { useEffect, useMemo, useState } from 'preact/hooks';
import {
  AlertTriangle,
  Bookmark,
  CalendarClock,
  Check,
  CheckCircle2,
  Copy,
  CornerDownRight,
  History,
  ListChecks,
  MessageCircle,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Repeat,
  Search,
  Trash2,
  User,
} from 'lucide-preact';
import { useStore } from '../storage/store.js';
import { useWeekId, setWeekId } from '../storage/ui.js';
import {
  addTaskComment,
  copyTasksFromWeek,
  createTasks,
  deleteTask,
  deleteTemplate,
  ensureRecurringForWeek,
  postpone,
  resolveTaskPending,
  restoreTask,
  saveTemplate,
  setTaskDone,
  setTaskPending,
  updateTask,
} from '../storage/taskActions.js';
import { currentActor } from '../storage/actor.js';
import {
  EVENT_LABELS,
  REPEAT_KINDS,
  TASK_CATEGORIES,
  TASK_STATUS,
  describeRepeat,
  overdueTasks,
  taskCategoryLabel,
  tasksOn,
  validateTaskInput,
  weekSummary,
} from '../models/tasks.js';
import { Chip, EmptyState, Menu, Modal, Progress, Segmented, confirmDialog, toast } from '../components/ui.jsx';
import { useIsPhone } from '../utils/hooks.js';
import { addDays, formatDateTime, formatDayMonth, formatWeekRange, parseISODate, todayISO, weekDates, weekStartOf, weekdayIndex, weekdayName, weekdayShort, WEEKDAY_SHORT } from '../utils/dates.js';
import { normalizeText } from '../utils/id.js';
import { copyText, whatsappUrl } from '../services/share.js';

const FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'open', label: 'A fazer' },
  { id: 'pending', label: 'Pendências' },
  { id: 'done', label: 'Feitas' },
];
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const dayLabel = (iso) => `${weekdayShort(iso)} ${formatDayMonth(iso)}`;

function matches(t, filter, person) {
  if (person && normalizeText(t.assignee) !== normalizeText(person)) return false;
  if (filter === 'open') return t.status === 'todo' || t.status === 'pending';
  if (filter === 'pending') return t.status === 'pending';
  if (filter === 'done') return t.status === 'done';
  return true;
}

export function TasksPage() {
  const s = useStore();
  const weekId = useWeekId();
  const isPhone = useIsPhone();
  const today = todayISO();
  const dates = useMemo(() => weekDates(weekId), [weekId]);
  const tasks = useMemo(() => Object.values(s.tasks), [s.tasks]);
  const [filter, setFilter] = useState('all');
  const [person, setPerson] = useState('');
  const [day, setDay] = useState(() => (dates.includes(today) ? today : dates[0]));
  const [form, setForm] = useState(null); // { dates?, task?, template? }
  const [detailId, setDetailId] = useState(null);
  const [library, setLibrary] = useState(false);

  // Tarefas fixas (repetição) aparecem sozinhas nas semanas atuais e futuras.
  useEffect(() => {
    ensureRecurringForWeek(weekId);
  }, [weekId, s.taskTemplates]);
  useEffect(() => {
    if (!dates.includes(day)) setDay(dates.includes(today) ? today : dates[0]);
  }, [weekId]);

  const summary = weekSummary(tasks, dates);
  const overdueBefore = overdueTasks(tasks, today).filter((t) => t.date < weekId);
  const people = useMemo(() => {
    const set = new Map();
    for (const t of tasks) if (t.assignee) set.set(normalizeText(t.assignee), t.assignee);
    return [...set.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [tasks]);

  const listFor = (date) => tasksOn(tasks, date).filter((t) => matches(t, filter, person));

  const shareText = () => {
    const lines = [`*Tarefas da semana* — ${formatWeekRange(weekId)}`];
    for (const d of dates) {
      const list = tasksOn(tasks, d).filter((t) => t.status !== 'postponed');
      if (!list.length) continue;
      lines.push('', `*${weekdayName(d)} (${formatDayMonth(d)})*`);
      for (const t of list) lines.push(`${t.status === 'done' ? '☑' : t.status === 'pending' ? '⚠' : '☐'} ${t.title}${t.assignee ? ` — ${t.assignee}` : ''}`);
    }
    return lines.join('\n');
  };

  const menuItems = (
    <>
      <button type="button" role="menuitem" onClick={() => setLibrary(true)}>
        <Bookmark size={16} /> Tarefas salvas e fixas
      </button>
      <button
        type="button"
        role="menuitem"
        onClick={() => {
          const n = copyTasksFromWeek(addDays(weekId, -7), weekId);
          toast(n ? `${n} tarefas copiadas da semana anterior` : 'Nenhuma tarefa avulsa na semana anterior');
        }}
      >
        <Copy size={16} /> Copiar da semana anterior
      </button>
      <button type="button" role="menuitem" onClick={() => window.open(whatsappUrl(shareText()), '_blank', 'noopener')}>
        <MessageCircle size={16} /> Enviar no WhatsApp
      </button>
      <button type="button" role="menuitem" onClick={async () => toast((await copyText(shareText())) ? 'Tarefas copiadas' : 'Não foi possível copiar', {})}>
        <Copy size={16} /> Copiar texto
      </button>
    </>
  );

  return (
    <div>
      <div class="page-head">
        <div class="grow">
          <h1>Tarefas da semana</h1>
          <p class="sub">
            {summary.total ? `${summary.done} de ${summary.total} feitas` : 'Nenhuma tarefa ainda'}
            {summary.pending ? ` · ${summary.pending} com pendência` : ''}
            {summary.postponed ? ` · ${summary.postponed} adiadas` : ''}
          </p>
        </div>
        <div class="toolbar">
          <button type="button" class="btn btn-primary" onClick={() => setForm({ dates: [isPhone ? day : dates.includes(today) ? today : dates[0]] })}>
            <Plus size={16} /> Nova tarefa
          </button>
          <Menu
            trigger={(p) => (
              <button type="button" class="btn btn-secondary" aria-label={p.label} aria-expanded={p.open} onClick={p.toggle}>
                <MoreHorizontal size={16} /> <span class="hide-mobile">Mais</span>
              </button>
            )}
          >
            {menuItems}
          </Menu>
        </div>
      </div>

      {summary.total > 0 && (
        <div style="margin-bottom:12px">
          <Progress value={summary.done / summary.total} label="Tarefas feitas na semana" />
        </div>
      )}

      {overdueBefore.length > 0 && weekId === weekStartOf(today) && (
        <div class="notice" style="background:var(--amber-light);color:var(--amber);margin-bottom:12px">
          <AlertTriangle size={18} />
          <span class="grow">
            {overdueBefore.length === 1 ? '1 tarefa atrasada' : `${overdueBefore.length} tarefas atrasadas`} de semanas anteriores:{' '}
            {overdueBefore.slice(0, 3).map((t, i) => (
              <span key={t.id}>
                {i ? ', ' : ''}
                <button type="button" class="link-btn" onClick={() => setDetailId(t.id)}>
                  {t.title} ({formatDayMonth(t.date)})
                </button>
              </span>
            ))}
            {overdueBefore.length > 3 ? '…' : ''}
          </span>
        </div>
      )}

      <div class="tasks-filters">
        <Segmented options={FILTERS} value={filter} onChange={setFilter} label="Filtrar tarefas" />
        {people.length > 0 && (
          <div class="chip-row scroll" role="group" aria-label="Filtrar por pessoa">
            <Chip pressed={!person} onClick={() => setPerson('')}>
              Todos
            </Chip>
            {people.map((p) => (
              <Chip key={p} pressed={person === p} onClick={() => setPerson(person === p ? '' : p)}>
                <User size={13} /> {p}
              </Chip>
            ))}
          </div>
        )}
      </div>

      {isPhone ? (
        <>
          <div class="day-strip" role="tablist" aria-label="Dias da semana">
            {dates.map((d) => {
              const list = tasksOn(tasks, d).filter((t) => t.status !== 'postponed');
              const done = list.filter((t) => t.status === 'done').length;
              return (
                <button
                  key={d}
                  type="button"
                  role="tab"
                  class={d === today ? 'today' : ''}
                  aria-selected={d === day ? 'true' : 'false'}
                  aria-label={`${weekdayName(d)} ${formatDayMonth(d)}, ${done} de ${list.length} tarefas feitas`}
                  onClick={() => setDay(d)}
                >
                  <span class="dw">{weekdayShort(d)}</span>
                  <span class="dn">{parseISODate(d).getDate()}</span>
                  <span class="dots" aria-hidden="true">
                    {list.slice(0, 4).map((t) => (
                      <i key={t.id} class={t.status === 'done' ? 'on' : ''} />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
          <DayColumn date={day} today={today} list={listFor(day)} onAdd={() => setForm({ dates: [day] })} onOpen={setDetailId} single />
        </>
      ) : (
        <div class="week-grid tasks-grid">
          {dates.map((d) => (
            <DayColumn key={d} date={d} today={today} list={listFor(d)} onAdd={() => setForm({ dates: [d] })} onOpen={setDetailId} />
          ))}
        </div>
      )}

      {form && <TaskForm {...form} weekId={weekId} people={people} onClose={() => setForm(null)} />}
      {detailId && s.tasks[detailId] && (
        <TaskDetail task={s.tasks[detailId]} onClose={() => setDetailId(null)} onEdit={(task) => setForm({ task })} onOpen={setDetailId} />
      )}
      {library && (
        <TemplatesModal
          onClose={() => setLibrary(false)}
          onUse={(template) => {
            setLibrary(false);
            setForm({ template, dates: [isPhone ? day : dates.includes(today) ? today : dates[0]] });
          }}
        />
      )}
    </div>
  );
}

function DayColumn({ date, today, list, onAdd, onOpen, single = false }) {
  const active = list.filter((t) => t.status !== 'postponed');
  const done = active.filter((t) => t.status === 'done').length;
  return (
    <section class={`day-card ${date === today ? 'today' : ''} ${date < today ? 'past' : ''}`} aria-label={`${weekdayName(date)} ${formatDayMonth(date)}`}>
      <div class="day-head">
        <h3>{single ? weekdayName(date) : weekdayShort(date)}</h3>
        <span class="date">
          {formatDayMonth(date)}
          {active.length ? ` · ${done}/${active.length}` : ''}
        </span>
        <button type="button" class="icon-btn" onClick={onAdd} aria-label={`Nova tarefa em ${weekdayName(date)}`} title="Nova tarefa">
          <Plus size={18} />
        </button>
      </div>
      <div class="task-list">
        {list.length ? (
          list.map((t) => <TaskRow key={t.id} task={t} onOpen={onOpen} />)
        ) : (
          <p class="small muted task-empty">
            <button type="button" class="link-btn" onClick={onAdd}>
              + Adicionar tarefa
            </button>
          </p>
        )}
      </div>
    </section>
  );
}

function TaskRow({ task: t, onOpen }) {
  const done = t.status === 'done';
  const moved = t.movedFrom?.length ? t.movedFrom[t.movedFrom.length - 1] : null;
  return (
    <div class={`task-row ${t.status}`}>
      {t.status === 'postponed' ? (
        <span class="task-check postponed" aria-hidden="true">
          <CalendarClock size={16} />
        </span>
      ) : (
        <button
          type="button"
          class="task-check"
          aria-pressed={done ? 'true' : 'false'}
          aria-label={done ? `Desmarcar "${t.title}"` : `Marcar "${t.title}" como feita`}
          onClick={() => setTaskDone(t.id, !done)}
        >
          {done && <Check size={16} strokeWidth={3} />}
        </button>
      )}
      <button type="button" class="task-main" onClick={() => onOpen(t.id)}>
        <span class="task-title">{t.title}</span>
        <span class="task-meta">
          {t.status === 'postponed' && <span class="badge badge-outline">Adiada → {dayLabel(t.postponedTo)}</span>}
          {moved && (
            <span class="badge badge-blue" title={`Datas anteriores: ${t.movedFrom.map(formatDayMonth).join(', ')}`}>
              <CornerDownRight size={11} /> Veio de {dayLabel(moved)}
              {t.movedFrom.length > 1 ? ` (${t.movedFrom.length}×)` : ''}
            </span>
          )}
          {t.status === 'pending' && <span class="badge badge-coral">Pendência</span>}
          {t.assignee && (
            <span class="task-who">
              <User size={11} /> {t.assignee}
            </span>
          )}
          {t.templateId && t.id.startsWith('fixa_') && <Repeat size={12} aria-label="Tarefa fixa" />}
          {t.comments?.length > 0 && (
            <span class="task-who">
              <MessageSquare size={11} /> {t.comments.length}
            </span>
          )}
          {done && t.doneBy && <span class="task-who">feita por {t.doneBy}</span>}
        </span>
        {t.status === 'pending' && t.pendingNote && <span class="task-note">{t.pendingNote}</span>}
      </button>
    </div>
  );
}

// ---------- Nova tarefa / editar ----------

function TaskForm({ task = null, template = null, dates: initialDates = [], weekId, people, onClose }) {
  const s = useStore();
  const editing = !!task;
  const base = task ?? template ?? {};
  const [title, setTitle] = useState(base.title ?? '');
  const [category, setCategory] = useState(base.category ?? 'casa');
  const [assignee, setAssignee] = useState(base.assignee ?? '');
  const [notes, setNotes] = useState(base.notes ?? '');
  const [dates, setDates] = useState(initialDates);
  const [repeatKind, setRepeatKind] = useState(template?.repeat?.kind ?? 'none');
  const [weekdays, setWeekdays] = useState(template?.repeat?.weekdays ?? [...new Set(initialDates.map(weekdayIndex))]);
  const [dayOfMonth, setDayOfMonth] = useState(template?.repeat?.dayOfMonth ?? (initialDates[0] ? parseISODate(initialDates[0]).getDate() : 1));
  const [errors, setErrors] = useState({});
  const [templateId, setTemplateId] = useState(template?.id ?? null);
  const templates = useMemo(() => Object.values(s.taskTemplates).sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0)), [s.taskTemplates]);
  const weekDays = weekDates(weekId);

  const pickTemplate = (value) => {
    setTitle(value);
    const tpl = templates.find((t) => normalizeText(t.title) === normalizeText(value));
    if (tpl && !editing) {
      setCategory(tpl.category ?? 'casa');
      setAssignee(tpl.assignee ?? '');
      setNotes(tpl.notes ?? '');
      setTemplateId(tpl.id);
    } else setTemplateId(null);
  };

  const submit = (e) => {
    e.preventDefault();
    if (editing) {
      const errs = validateTaskInput({ title, date: task.date });
      setErrors(errs);
      if (Object.keys(errs).length) return;
      updateTask(task.id, { title, category, assignee, notes });
      toast('Tarefa atualizada');
      onClose();
      return;
    }
    const errs = validateTaskInput({ title, date: dates[0] });
    if (!dates.length) errs.date = 'Escolha pelo menos um dia.';
    if (repeatKind !== 'none' && repeatKind !== 'monthly' && !weekdays.length) errs.repeat = 'Escolha os dias da repetição.';
    setErrors(errs);
    if (Object.keys(errs).length) return;
    const repeat = repeatKind === 'none' ? null : repeatKind === 'monthly' ? { kind: 'monthly', dayOfMonth } : { kind: repeatKind, weekdays };
    const created = createTasks({ title, dates, category, assignee, notes, repeat, templateId });
    toast(created.length > 1 ? `${created.length} tarefas criadas` : repeat ? 'Tarefa fixa criada' : 'Tarefa criada');
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={editing ? 'Editar tarefa' : 'Nova tarefa'}
      subtitle={editing ? `${weekdayName(task.date)}, ${formatDayMonth(task.date)} — para mudar a data, use "Adiar".` : 'Fica salva para usar de novo depois.'}
      footer={
        <>
          <button type="button" class="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="task-form" class="btn btn-primary">
            {editing ? 'Salvar' : 'Criar tarefa'}
          </button>
        </>
      }
    >
      <form id="task-form" class="form-section" onSubmit={submit}>
        <label class="field">
          <span class="label">Tarefa</span>
          <input
            class="input"
            list="task-titles"
            value={title}
            maxLength={120}
            placeholder="Ex.: Tirar o lixo, Lavar roupa, Pagar conta de luz"
            aria-invalid={errors.title ? 'true' : undefined}
            onInput={(e) => pickTemplate(e.currentTarget.value)}
            autoFocus
          />
          <datalist id="task-titles">
            {templates.map((t) => (
              <option key={t.id} value={t.title} />
            ))}
          </datalist>
          {errors.title && <span class="error">{errors.title}</span>}
          {!editing && templateId && <span class="hint">Usando a tarefa salva "{s.taskTemplates[templateId]?.title}".</span>}
        </label>

        {!editing && (
          <div class="field">
            <span class="label">Dias desta semana</span>
            <div class="chip-row" role="group" aria-label="Dias da tarefa">
              {weekDays.map((d) => (
                <Chip key={d} pressed={dates.includes(d)} onClick={() => setDates((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort()))}>
                  {dayLabel(d)}
                </Chip>
              ))}
            </div>
            {errors.date && <span class="error">{errors.date}</span>}
          </div>
        )}

        <div class="inspector-grid">
          <label class="field">
            <span class="label">Quem faz</span>
            <input class="input" list="task-people" value={assignee} maxLength={40} placeholder="Opcional" onInput={(e) => setAssignee(e.currentTarget.value)} />
            <datalist id="task-people">
              {[...new Set([...people, currentActor().name])].map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </label>
          <label class="field">
            <span class="label">Categoria</span>
            <select class="input" value={category} onChange={(e) => setCategory(e.currentTarget.value)}>
              {TASK_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label class="field">
          <span class="label">Observações</span>
          <textarea class="input" rows={2} maxLength={500} value={notes} onInput={(e) => setNotes(e.currentTarget.value)} placeholder="Opcional" />
        </label>

        {!editing && (
          <div class="field">
            <span class="label">Repetir</span>
            <select class="input" value={repeatKind} onChange={(e) => setRepeatKind(e.currentTarget.value)}>
              {REPEAT_KINDS.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.label}
                </option>
              ))}
            </select>
            {(repeatKind === 'weekly' || repeatKind === 'biweekly') && (
              <div class="chip-row" role="group" aria-label="Dias da repetição" style="margin-top:6px">
                {WEEK_ORDER.map((d) => (
                  <Chip key={d} pressed={weekdays.includes(d)} onClick={() => setWeekdays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))}>
                    {WEEKDAY_SHORT[d]}
                  </Chip>
                ))}
              </div>
            )}
            {repeatKind === 'monthly' && (
              <label class="field" style="margin-top:6px">
                <span class="hint">Dia do mês</span>
                <input class="input" type="number" min={1} max={31} value={dayOfMonth} onInput={(e) => setDayOfMonth(Number(e.currentTarget.value))} style="max-width:120px" />
              </label>
            )}
            {errors.repeat && <span class="error">{errors.repeat}</span>}
            <span class="hint">Tarefas fixas aparecem sozinhas nas próximas semanas. Dá para pausar em "Tarefas salvas e fixas".</span>
          </div>
        )}
      </form>
    </Modal>
  );
}

// ---------- Detalhe ----------

function TaskDetail({ task: t, onClose, onEdit, onOpen }) {
  const s = useStore();
  const [mode, setMode] = useState(null); // 'pending' | 'postpone'
  const [text, setText] = useState('');
  const [comment, setComment] = useState('');
  // Tarefa atrasada: as sugestões contam a partir de hoje.
  const base = t.date < todayISO() ? todayISO() : t.date;
  const [newDate, setNewDate] = useState(addDays(base, 1));
  const done = t.status === 'done';
  const closed = t.status === 'postponed';
  const quick = [
    [base === todayISO() ? 'Amanhã' : 'Dia seguinte', addDays(base, 1)],
    ['Em 2 dias', addDays(base, 2)],
    ['Em 1 semana', addDays(base, 7)],
  ];
  const nextTask = closed ? Object.values(s.tasks).find((x) => x.previousId === t.id) : null;
  const prevTask = t.previousId ? s.tasks[t.previousId] : null;
  const template = t.templateId ? s.taskTemplates[t.templateId] : null;

  const doPostpone = () => {
    try {
      const moved = postpone(t.id, newDate, text);
      toast(`Adiada para ${dayLabel(newDate)}`, {
        action: {
          label: 'Ver',
          onClick: () => {
            setWeekId(newDate);
            onOpen(moved.id);
          },
        },
      });
      onClose();
    } catch (err) {
      toast(err.message, { type: 'error' });
    }
  };

  const remove = async () => {
    const ok = await confirmDialog({ title: 'Excluir tarefa', message: `Excluir "${t.title}" de ${dayLabel(t.date)}?`, confirmLabel: 'Excluir', danger: true });
    if (!ok) return;
    const before = t;
    deleteTask(t.id);
    onClose();
    toast('Tarefa excluída', { action: { label: 'Desfazer', onClick: () => restoreTask(before) } });
  };

  return (
    <Modal open onClose={onClose} title={t.title} subtitle={`${weekdayName(t.date)}, ${formatDayMonth(t.date)} · ${taskCategoryLabel(t.category)}${t.assignee ? ` · ${t.assignee}` : ''}`}>
      <div class="form-section">
        <div class="chip-row">
          <span class={`badge ${t.status === 'done' ? 'badge-green' : t.status === 'pending' ? 'badge-coral' : t.status === 'postponed' ? 'badge-outline' : 'badge-amber'}`}>
            {TASK_STATUS[t.status]}
            {done && t.doneBy ? ` por ${t.doneBy}` : ''}
          </span>
          {template?.repeat && (
            <span class="badge badge-outline">
              <Repeat size={11} /> {describeRepeat(template.repeat)}
            </span>
          )}
        </div>

        {t.movedFrom?.length > 0 && (
          <div class="notice info">
            <CornerDownRight size={18} />
            <span>
              Veio de {t.movedFrom.map(dayLabel).join(' → ')}.
              {prevTask && (
                <>
                  {' '}
                  <button type="button" class="link-btn" onClick={() => onOpen(prevTask.id)}>
                    Ver a original
                  </button>
                </>
              )}
            </span>
          </div>
        )}
        {closed && (
          <div class="notice info">
            <CalendarClock size={18} />
            <span>
              Adiada para {dayLabel(t.postponedTo)}.{' '}
              {nextTask && (
                <button
                  type="button"
                  class="link-btn"
                  onClick={() => {
                    setWeekId(t.postponedTo);
                    onOpen(nextTask.id);
                  }}
                >
                  Abrir na nova data
                </button>
              )}
            </span>
          </div>
        )}
        {t.notes && <p style="margin:0;white-space:pre-wrap">{t.notes}</p>}

        {!closed && (
          <div class="toolbar">
            <button type="button" class={`btn ${done ? 'btn-secondary' : 'btn-primary'}`} onClick={() => setTaskDone(t.id, !done)}>
              <CheckCircle2 size={16} /> {done ? 'Desmarcar' : 'Marcar como feita'}
            </button>
            {t.status === 'pending' ? (
              <button type="button" class="btn btn-secondary" onClick={() => resolveTaskPending(t.id)}>
                <Check size={16} /> Resolver pendência
              </button>
            ) : (
              <button type="button" class="btn btn-secondary" onClick={() => setMode(mode === 'pending' ? null : 'pending')} aria-expanded={mode === 'pending'}>
                <AlertTriangle size={16} /> Pendência
              </button>
            )}
            <button type="button" class="btn btn-secondary" onClick={() => setMode(mode === 'postpone' ? null : 'postpone')} aria-expanded={mode === 'postpone'}>
              <CalendarClock size={16} /> Adiar
            </button>
          </div>
        )}

        {mode === 'pending' && (
          <form
            class="form-section sub-panel"
            onSubmit={(e) => {
              e.preventDefault();
              setTaskPending(t.id, text);
              setText('');
              setMode(null);
              toast('Pendência registrada');
            }}
          >
            <label class="field">
              <span class="label">O que ficou pendente? (recado)</span>
              <textarea class="input" rows={2} maxLength={500} value={text} onInput={(e) => setText(e.currentTarget.value)} placeholder="Ex.: faltou sabão, termino amanhã" autoFocus />
            </label>
            <div class="toolbar">
              <button type="submit" class="btn btn-primary">
                Registrar pendência
              </button>
            </div>
          </form>
        )}

        {mode === 'postpone' && (
          <div class="form-section sub-panel">
            <span class="label">Adiar para</span>
            <div class="chip-row">
              {quick.map(([label, d]) => (
                <Chip key={label} pressed={newDate === d} onClick={() => setNewDate(d)}>
                  {label} ({formatDayMonth(d)})
                </Chip>
              ))}
            </div>
            <label class="field">
              <span class="hint">Ou escolha a data</span>
              <input class="input" type="date" value={newDate} onInput={(e) => setNewDate(e.currentTarget.value)} style="max-width:200px" />
            </label>
            <label class="field">
              <span class="hint">Motivo (vira um recado)</span>
              <input class="input" value={text} maxLength={200} onInput={(e) => setText(e.currentTarget.value)} placeholder="Opcional" />
            </label>
            <div class="toolbar">
              <button type="button" class="btn btn-primary" onClick={doPostpone} disabled={!newDate || newDate === t.date}>
                <CalendarClock size={16} /> Adiar para {newDate ? dayLabel(newDate) : '…'}
              </button>
            </div>
          </div>
        )}

        <div class="divider" />
        <h3 class="section-title" style="margin:0;display:flex;gap:6px;align-items:center">
          <MessageSquare size={16} /> Recados
        </h3>
        {t.comments?.length ? (
          <ul class="task-comments">
            {t.comments.map((c) => (
              <li key={c.id}>
                <span class="who">
                  {c.by} · {formatDateTime(c.at)}
                  {c.kind === 'pending' ? ' · pendência' : c.kind === 'postponed' ? ' · adiamento' : ''}
                </span>
                <span>{c.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p class="small muted" style="margin:0">
            Nenhum recado.
          </p>
        )}
        <form
          class="input-group"
          style="display:flex;gap:8px"
          onSubmit={(e) => {
            e.preventDefault();
            if (!comment.trim()) return;
            addTaskComment(t.id, comment);
            setComment('');
          }}
        >
          <input class="input" style="flex:1;min-width:0" value={comment} maxLength={500} placeholder="Deixar um recado" aria-label="Novo recado" onInput={(e) => setComment(e.currentTarget.value)} />
          <button type="submit" class="btn btn-secondary" disabled={!comment.trim()}>
            Enviar
          </button>
        </form>

        <div class="divider" />
        <details class="task-history">
          <summary>
            <History size={16} /> Histórico de alterações ({t.history?.length ?? 0})
          </summary>
          <ol>
            {[...(t.history ?? [])].reverse().map((h, i) => (
              <li key={i}>
                <strong>{h.by}</strong> {EVENT_LABELS[h.type] ?? (h.type === 'deleted' ? 'excluiu' : h.type)}
                {h.type === 'postponed' && h.to ? ` para ${dayLabel(h.to)}` : ''}
                {h.type === 'moved' && h.from ? ` (de ${dayLabel(h.from)})` : ''}
                {h.fields?.length ? ` (${h.fields.map((f) => ({ title: 'nome', category: 'categoria', assignee: 'responsável', notes: 'observações' })[f] ?? f).join(', ')})` : ''}
                <span class="when"> · {formatDateTime(h.at)}</span>
                {h.text && h.type !== 'comment' ? <span class="txt"> — “{h.text}”</span> : null}
              </li>
            ))}
          </ol>
        </details>

        <div class="toolbar">
          <button type="button" class="btn btn-ghost" onClick={() => onEdit(t)}>
            <Pencil size={16} /> Editar
          </button>
          <button type="button" class="btn btn-danger-ghost" onClick={remove}>
            <Trash2 size={16} /> Excluir
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ---------- Tarefas salvas (modelos) ----------

function TemplatesModal({ onClose, onUse }) {
  const s = useStore();
  const [q, setQ] = useState('');
  const [editing, setEditing] = useState(null);
  const list = useMemo(
    () =>
      Object.values(s.taskTemplates)
        .filter((t) => !q || normalizeText(t.title).includes(normalizeText(q)))
        .sort((a, b) => (!!b.repeat - !!a.repeat) || (b.uses ?? 0) - (a.uses ?? 0) || a.title.localeCompare(b.title, 'pt-BR')),
    [s.taskTemplates, q],
  );
  return (
    <Modal open onClose={onClose} title="Tarefas salvas e fixas" subtitle="Toda tarefa criada fica salva aqui para usar de novo. As fixas se repetem sozinhas." size="lg">
      <div class="form-section">
        <label class="input-group" style="display:flex;gap:8px;align-items:center">
          <Search size={16} />
          <input class="input" value={q} placeholder="Buscar tarefa salva" aria-label="Buscar tarefa salva" onInput={(e) => setQ(e.currentTarget.value)} />
        </label>
        {!list.length ? (
          <EmptyState icon={ListChecks} title="Nenhuma tarefa salva">
            As tarefas que você criar aparecem aqui.
          </EmptyState>
        ) : (
          <ul class="template-list">
            {list.map((t) => (
              <li key={t.id}>
                <div class="grow" style="min-width:0">
                  <strong>{t.title}</strong>
                  <span class="small muted">
                    {' '}
                    · {taskCategoryLabel(t.category)}
                    {t.assignee ? ` · ${t.assignee}` : ''} · usada {t.uses ?? 0}×
                  </span>
                  <div class="small" style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">
                    {t.repeat ? (
                      <span class={`badge ${t.paused ? 'badge-outline' : 'badge-green'}`}>
                        <Repeat size={11} /> {describeRepeat(t.repeat)}
                        {t.paused ? ' (pausada)' : ''}
                      </span>
                    ) : (
                      <span class="muted">Não repete</span>
                    )}
                  </div>
                </div>
                <div class="toolbar">
                  <button type="button" class="btn btn-soft" onClick={() => onUse(t)}>
                    <Plus size={16} /> Usar
                  </button>
                  <button type="button" class="btn btn-ghost" onClick={() => setEditing(t)}>
                    <Repeat size={16} /> Repetição
                  </button>
                  <button
                    type="button"
                    class="icon-btn"
                    aria-label={`Excluir ${t.title}`}
                    onClick={async () => {
                      const ok = await confirmDialog({
                        title: 'Excluir tarefa salva',
                        message: `"${t.title}" sai da lista de tarefas salvas${t.repeat ? ' e deixa de se repetir' : ''}. As tarefas já feitas continuam no histórico.`,
                        confirmLabel: 'Excluir',
                        danger: true,
                      });
                      if (ok) deleteTemplate(t.id);
                    }}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {editing && <RepeatEditor template={editing} onClose={() => setEditing(null)} />}
    </Modal>
  );
}

function RepeatEditor({ template, onClose }) {
  const r = template.repeat;
  const [kind, setKind] = useState(r?.kind ?? 'none');
  const [weekdays, setWeekdays] = useState(r?.weekdays ?? [1]);
  const [dayOfMonth, setDayOfMonth] = useState(r?.dayOfMonth ?? 1);
  const [paused, setPaused] = useState(!!template.paused);
  const save = () => {
    const repeat = kind === 'none' ? null : kind === 'monthly' ? { kind, dayOfMonth } : { kind, weekdays };
    saveTemplate({ ...template, repeat, paused });
    toast(repeat ? (paused ? 'Repetição pausada' : 'Repetição salva') : 'A tarefa não se repete mais');
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Repetição: ${template.title}`}
      size="sm"
      footer={
        <>
          <button type="button" class="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="button" class="btn btn-primary" onClick={save}>
            Salvar
          </button>
        </>
      }
    >
      <div class="form-section">
        <select class="input" value={kind} aria-label="Tipo de repetição" onChange={(e) => setKind(e.currentTarget.value)}>
          {REPEAT_KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
        {(kind === 'weekly' || kind === 'biweekly') && (
          <div class="chip-row" role="group" aria-label="Dias">
            {WEEK_ORDER.map((d) => (
              <Chip key={d} pressed={weekdays.includes(d)} onClick={() => setWeekdays((cur) => (cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d]))}>
                {WEEKDAY_SHORT[d]}
              </Chip>
            ))}
          </div>
        )}
        {kind === 'monthly' && (
          <label class="field">
            <span class="hint">Dia do mês</span>
            <input class="input" type="number" min={1} max={31} value={dayOfMonth} onInput={(e) => setDayOfMonth(Number(e.currentTarget.value))} style="max-width:120px" />
          </label>
        )}
        {kind !== 'none' && (
          <label class="switch">
            <input type="checkbox" checked={paused} onChange={(e) => setPaused(e.currentTarget.checked)} />
            <span>Pausar repetição (ex.: férias)</span>
          </label>
        )}
      </div>
    </Modal>
  );
}
