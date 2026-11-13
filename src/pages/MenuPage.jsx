// Cardápio semanal: desktop em colunas; celular com um dia por vez ou resumo da semana.

import { useMemo, useRef, useState } from 'preact/hooks';
import {
  Box,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Copy,
  History,
  List,
  MapPin,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Printer,
  Star,
  Trash2,
  CheckCircle2,
  Snowflake,
  Refrigerator,
  ListChecks,
  Scale,
} from 'lucide-preact';
import { useStore } from '../storage/store.js';
import { useWeek } from './useWeekData.js';
import {
  clearWeekMeals,
  copyFromWeek,
  restoreWeek,
  setWeekFavorite,
  toggleTask,
  addManualTask,
  removeManualTask,
  setMarmitaStatus,
  deleteMarmita,
  marmitaUsage,
  updateMarmita,
} from '../storage/actions.js';
import { MEAL_SLOTS, PROTEINS, COMPOSITION, MARMITA_STATUS } from '../models/constants.js';
import { planningStats, balanceStats, prepTasks } from '../services/indicators.js';
import { menuToText, whatsappUrl, copyText, entryLabel } from '../services/share.js';
import { countEntries } from '../services/planning.js';
import {
  addDays,
  formatDayMonth,
  formatWeekRange,
  todayISO,
  weekDates,
  weekdayName,
  weekdayShort,
  parseISODate,
  weekStartOf,
} from '../utils/dates.js';
import { TodayNotes } from './NotesPage.jsx';
import { useIsPhone, usePref } from '../utils/hooks.js';
import { Modal, Menu, Progress, Segmented, toast, confirmDialog, EmptyState } from '../components/ui.jsx';
import { MealPicker } from './menu/MealPicker.jsx';
import { EntryDetail } from './menu/EntryDetail.jsx';

const ENTRY_ICON = { marmita: Box, out: MapPin, text: ClipboardList };

export function MenuPage({ weekId }) {
  const s = useStore();
  const week = useWeek(weekId);
  const isPhone = useIsPhone();
  const [mobileView, setMobileView] = usePref('menuMobileView', 'day');
  const today = todayISO();
  const dates = weekDates(weekId);
  const [selectedDay, setSelectedDay] = useState(() => (dates.includes(today) ? today : dates[0]));
  const day = dates.includes(selectedDay) ? selectedDay : dates.includes(today) ? today : dates[0];

  const [picker, setPicker] = useState(null); // { date, slot, replaceEntryId }
  const [detail, setDetail] = useState(null); // { date, slot, entryId }
  const [historyOpen, setHistoryOpen] = useState(false);
  const [favoriteOpen, setFavoriteOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(null);

  const marmitas = useMemo(() => Object.values(s.marmitas), [s.marmitas]);
  const stats = useMemo(() => planningStats({ weekId, week, settings: s.settings, marmitas }), [weekId, week, s.settings, marmitas]);
  const balance = useMemo(() => balanceStats({ week, recipesById: s.recipes, marmitasById: s.marmitas }), [week, s.recipes, s.marmitas]);
  const tasks = useMemo(() => prepTasks({ weekId, week, recipesById: s.recipes, marmitas }), [weekId, week, s.recipes, marmitas]);

  const openAdd = (date, slot) => setPicker({ date, slot });
  const openEntry = (date, slot, entryId) => setDetail({ date, slot, entryId });

  const prevWeekId = addDays(weekId, -7);
  const actions = {
    whatsapp: () => window.open(whatsappUrl(menuToText({ weekId, week, recipesById: s.recipes, marmitasById: s.marmitas })), '_blank', 'noopener'),
    copy: async () => {
      const ok = await copyText(menuToText({ weekId, week, recipesById: s.recipes, marmitasById: s.marmitas }));
      toast(ok ? 'Cardápio copiado' : 'Não foi possível copiar', ok ? {} : { type: 'error' });
    },
    print: () => window.print(),
    duplicatePrev: async () => {
      const prev = s.weeks[prevWeekId];
      if (!prev || !countEntries(prev)) return toast('A semana anterior não tem refeições', { type: 'error' });
      if (countEntries(week)) {
        const choice = await confirmDialog({
          title: 'Duplicar semana anterior',
          message: 'Esta semana já tem refeições. O que deseja fazer?',
          actions: [
            { id: 'merge', label: 'Somar às atuais', variant: 'btn-secondary' },
            { id: 'replace', label: 'Substituir', variant: 'btn-primary' },
          ],
        });
        if (!choice) return;
        const before = copyFromWeek(prevWeekId, weekId, choice === 'merge');
        toast('Semana anterior duplicada', { action: { label: 'Desfazer', onClick: () => restoreWeek(before) } });
      } else {
        const before = copyFromWeek(prevWeekId, weekId);
        toast('Semana anterior duplicada', { action: { label: 'Desfazer', onClick: () => restoreWeek(before) } });
      }
    },
    clear: async () => {
      if (!countEntries(week)) return;
      const ok = await confirmDialog({
        title: 'Limpar semana',
        message: `Remover todas as ${countEntries(week)} refeições de ${formatWeekRange(weekId)}? Itens avulsos da lista e tarefas manuais são mantidos.`,
        confirmLabel: 'Limpar',
        danger: true,
      });
      if (!ok) return;
      const before = clearWeekMeals(weekId);
      toast('Semana limpa', { action: { label: 'Desfazer', onClick: () => restoreWeek(before) } });
    },
    favorite: () => {
      if (week.favorite) {
        setWeekFavorite(weekId, false);
        toast('Removida das favoritas');
      } else setFavoriteOpen(true);
    },
  };

  const menuItems = (
    <>
      <button type="button" role="menuitem" onClick={actions.copy}><Copy size={16} /> Copiar texto</button>
      <button type="button" role="menuitem" onClick={actions.print}><Printer size={16} /> Imprimir</button>
      <hr />
      <button type="button" role="menuitem" onClick={actions.duplicatePrev}><CalendarDays size={16} /> Duplicar semana anterior</button>
      <button type="button" role="menuitem" onClick={() => setHistoryOpen(true)}><History size={16} /> Reaproveitar semana salva</button>
      <button type="button" role="menuitem" onClick={actions.favorite}><Star size={16} /> {week.favorite ? 'Remover das favoritas' : 'Salvar como favorita'}</button>
      <hr />
      <button type="button" role="menuitem" class="danger" onClick={actions.clear}><Trash2 size={16} /> Limpar semana</button>
    </>
  );

  return (
    <div class="menu-page">
      {weekId === weekStartOf(todayISO()) && <TodayNotes />}
      <div class="menu-head">
        <div class="grow">
          <h1>
            Cardápio {week.favorite && <Star size={18} fill="#DCA49B" color="#DCA49B" style="display:inline;vertical-align:0" aria-label="Semana favorita" />}
          </h1>
          <p class="muted small nowrap">{formatWeekRange(weekId)}{week.favoriteName ? ` · ${week.favoriteName}` : ''}</p>
        </div>
        {isPhone ? (
          <>
            <Segmented
              options={[
                { id: 'day', label: 'Dia', icon: CalendarDays },
                { id: 'week', label: 'Semana', icon: List },
              ]}
              value={mobileView}
              onChange={setMobileView}
              label="Visualização"
            />
            <Menu trigger={(p) => <button type="button" class="icon-btn bordered" aria-label={p.label} aria-expanded={p.open} onClick={p.toggle}><MoreHorizontal size={20} /></button>}>
              <button type="button" role="menuitem" onClick={actions.whatsapp}><MessageCircle size={16} /> Enviar no WhatsApp</button>
              {menuItems}
            </Menu>
          </>
        ) : (
          <div class="toolbar">
            <button type="button" class="btn btn-secondary" onClick={actions.whatsapp}>
              <MessageCircle size={16} /> WhatsApp
            </button>
            <button type="button" class="btn btn-secondary hide-mobile" onClick={actions.duplicatePrev} title="Copiar as refeições da semana anterior">
              <CalendarDays size={16} /> Duplicar anterior
            </button>
            <Menu trigger={(p) => <button type="button" class="btn btn-secondary" aria-label={p.label} aria-expanded={p.open} onClick={p.toggle}><MoreHorizontal size={16} /> Mais</button>}>
              {menuItems}
            </Menu>
          </div>
        )}
      </div>

      {isPhone ? (
        <SummaryStrip stats={stats} tasks={tasks} balance={balance} onOpen={setSummaryOpen} />
      ) : (
        <div class="indicators">
          <PlanningCard stats={stats} />
          <BalanceCard balance={balance} />
          <PrepCard weekId={weekId} tasks={tasks} />
        </div>
      )}

      {isPhone ? (
        mobileView === 'day' ? (
          <DayView
            weekId={weekId}
            week={week}
            dates={dates}
            day={day}
            today={today}
            onDay={setSelectedDay}
            onAdd={openAdd}
            onEntry={openEntry}
          />
        ) : (
          <WeekList
            week={week}
            dates={dates}
            today={today}
            onPick={(d) => {
              setSelectedDay(d);
              setMobileView('day');
            }}
          />
        )
      ) : (
        <div class="week-grid">
          {dates.map((d) => (
            <DayCard key={d} date={d} week={week} today={today} onAdd={openAdd} onEntry={openEntry} />
          ))}
        </div>
      )}

      <MarmitasSection weekId={weekId} />

      <PrintableWeek weekId={weekId} week={week} />

      {picker && (
        <MealPicker
          weekId={weekId}
          date={picker.date}
          slot={picker.slot}
          replaceEntryId={picker.replaceEntryId}
          onClose={() => setPicker(null)}
        />
      )}
      {detail && (
        <EntryDetail
          weekId={weekId}
          {...detail}
          onClose={() => setDetail(null)}
          onReplace={() => {
            setPicker({ date: detail.date, slot: detail.slot, replaceEntryId: detail.entryId });
            setDetail(null);
          }}
        />
      )}
      {historyOpen && <ReuseWeekModal weekId={weekId} onClose={() => setHistoryOpen(false)} />}
      {favoriteOpen && <FavoriteModal weekId={weekId} onClose={() => setFavoriteOpen(false)} />}
      {summaryOpen && (
        <Modal
          open
          onClose={() => setSummaryOpen(null)}
          title={{ plan: 'Planejamento', balance: 'Equilíbrio alimentar', prep: 'Preparo antecipado' }[summaryOpen]}
        >
          {summaryOpen === 'plan' && <PlanningCard stats={stats} bare />}
          {summaryOpen === 'balance' && <BalanceCard balance={balance} bare />}
          {summaryOpen === 'prep' && <PrepCard weekId={weekId} tasks={tasks} bare />}
        </Modal>
      )}
    </div>
  );
}

// ---------- Indicadores ----------

function PlanningCard({ stats, bare }) {
  const body = (
    <>
      {!bare && (
        <h2 class="card-title">
          <CalendarDays size={14} /> Planejamento
        </h2>
      )}
      <div class="big">
        <strong>{stats.filledTracked}</strong>
        <span class="muted">de {stats.tracked} refeições planejadas</span>
      </div>
      <Progress value={stats.progress} label="Refeições planejadas" />
      <div class="stat-row">
        <span>
          <i class="dot" style="background:var(--coral)" /> {stats.pending.length} pendentes
        </span>
        <span>
          <Box size={14} /> {stats.kinds.marmita} marmitas
        </span>
        <span>
          <MapPin size={14} /> {stats.kinds.out} fora de casa
        </span>
        {stats.kinds.text > 0 && (
          <span>
            <ClipboardList size={14} /> {stats.kinds.text} em texto
          </span>
        )}
      </div>
      {stats.pending.length > 0 && (
        <p class="small muted" style="margin-top:12px">
          Pendentes: {stats.pending.slice(0, 8).map((p) => `${weekdayShort(p.date)} ${MEAL_SLOTS.find((m) => m.id === p.slot).short.toLowerCase()}`).join(', ')}
          {stats.pending.length > 8 ? '…' : ''}
        </p>
      )}
    </>
  );
  return bare ? body : <section class="card card-pad indicator" aria-label="Planejamento">{body}</section>;
}

const PROTEIN_COLORS = {
  frango: '#D9B76E',
  bovina: '#C98B80',
  suina: '#DCA49B',
  peixe: '#7E9DB4',
  'frutos-do-mar': '#8FB3C2',
  ovos: '#E2C77E',
  'sem-carne': '#7FA27A',
};
const COMP_COLORS = { proteina: '#C98B80', vegetal: '#7FA27A', carboidrato: '#D9B76E', leguminosa: '#A88B6A', massa: '#9C8CB5' };

function BalanceCard({ balance, bare }) {
  const maxComp = Math.max(1, ...Object.values(balance.composition));
  const body = (
    <>
      {!bare && (
        <h2 class="card-title">
          <Scale size={14} /> Equilíbrio alimentar
        </h2>
      )}
      {balance.meals === 0 ? (
        <p class="small muted" style="margin-top:10px">Adicione receitas para ver a distribuição da semana.</p>
      ) : (
        <>
          <div class="protein-list" aria-label="Proteínas da semana">
            {PROTEINS.filter((p) => balance.proteins[p.id] > 0).map((p) => (
              <span key={p.id} class="badge" style={`background:${PROTEIN_COLORS[p.id]}26;color:var(--text)`}>
                <i class="dot" style={`background:${PROTEIN_COLORS[p.id]}`} /> {balance.proteins[p.id]}× {p.label}
              </span>
            ))}
          </div>
          <div class="bars">
            {COMPOSITION.map((c) => (
              <div class="bar" key={c.id}>
                <span>{c.label}</span>
                <span class="track" aria-hidden="true">
                  <span class="fill" style={`display:block;width:${(balance.composition[c.id] / maxComp) * 100}%;background:${COMP_COLORS[c.id]}`} />
                </span>
                <span class="n" aria-label={`${balance.composition[c.id]} refeições`}>{balance.composition[c.id]}</span>
              </div>
            ))}
          </div>
          {balance.composition.vegetal < Math.ceil(balance.meals / 3) && (
            <p class="xsmall" style="margin-top:8px;color:var(--coral-dark)">Poucas refeições com vegetais nesta semana.</p>
          )}
        </>
      )}
    </>
  );
  return bare ? body : <section class="card card-pad indicator" aria-label="Equilíbrio alimentar">{body}</section>;
}

function PrepCard({ weekId, tasks, bare }) {
  const today = todayISO();
  const [adding, setAdding] = useState(false);
  const [text, setText] = useState('');
  const [date, setDate] = useState(weekDates(weekId).includes(today) ? today : weekId);
  const pending = tasks.filter((t) => !t.done).length;
  const body = (
    <>
      {!bare && (
        <h2 class="card-title" style="justify-content:space-between">
          <span style="display:flex;gap:6px;align-items:center">
            <ListChecks size={14} /> Preparo antecipado
          </span>
          <span class="muted" style="text-transform:none;letter-spacing:0">{pending} pendentes</span>
        </h2>
      )}
      {tasks.length === 0 && <p class="small muted" style="margin-top:10px">Nenhuma tarefa: as receitas da semana não pedem preparo antecipado.</p>}
      <div class="tasks" style={bare ? 'max-height:none' : ''}>
        {tasks.map((t) => (
          <label key={t.key} class={`task ${t.done ? 'done' : ''}`}>
            <input type="checkbox" class="check" checked={t.done} onChange={(e) => toggleTask(weekId, t.key, e.currentTarget.checked)} />
            <span class="t-text">
              <span>{t.text}</span>
              <span class="t-sub">{t.detail}</span>
            </span>
            <span class={`when ${!t.done && t.date < today ? 'late' : ''}`}>{t.date === today ? 'Hoje' : `${weekdayShort(t.date)} ${formatDayMonth(t.date)}`}</span>
            {t.source === 'manual' && (
              <button type="button" class="icon-btn sm" aria-label="Remover tarefa" onClick={(e) => { e.preventDefault(); removeManualTask(weekId, t.id); }}>
                <Trash2 size={14} />
              </button>
            )}
          </label>
        ))}
      </div>
      {adding ? (
        <form
          class="input-group"
          style="margin-top:8px;flex-wrap:wrap"
          onSubmit={(e) => {
            e.preventDefault();
            if (!text.trim()) return;
            addManualTask(weekId, date, text.trim());
            setText('');
            setAdding(false);
          }}
        >
          <input class="input" style="flex:2;min-width:160px" placeholder="Ex.: higienizar frutas" value={text} maxLength={120} onInput={(e) => setText(e.currentTarget.value)} autoFocus aria-label="Nova tarefa" />
          <select class="select" style="flex:1;min-width:110px" value={date} onChange={(e) => setDate(e.currentTarget.value)} aria-label="Dia da tarefa">
            {[addDays(weekId, -1), ...weekDates(weekId)].map((d) => (
              <option key={d} value={d}>{weekdayShort(d)} {formatDayMonth(d)}</option>
            ))}
          </select>
          <button class="btn btn-primary" type="submit">Adicionar</button>
        </form>
      ) : (
        <button type="button" class="add-slot" style="margin-top:6px" onClick={() => setAdding(true)}>
          <Plus size={14} /> Nova tarefa
        </button>
      )}
    </>
  );
  return bare ? body : <section class="card card-pad indicator" aria-label="Preparo antecipado">{body}</section>;
}

function SummaryStrip({ stats, tasks, balance, onOpen }) {
  const pendingTasks = tasks.filter((t) => !t.done).length;
  const proteins = PROTEINS.filter((p) => balance.proteins[p.id] > 0).length;
  return (
    <div class="summary-strip">
      <button type="button" onClick={() => onOpen('plan')} aria-label="Ver planejamento">
        <strong>{stats.filledTracked}/{stats.tracked}</strong>
        <span>planejadas</span>
      </button>
      <button type="button" onClick={() => onOpen('balance')} aria-label="Ver equilíbrio alimentar">
        <strong>{balance.composition.vegetal}</strong>
        <span>com vegetais · {proteins} proteínas</span>
      </button>
      <button type="button" onClick={() => onOpen('prep')} aria-label="Ver preparo antecipado">
        <strong>{pendingTasks}</strong>
        <span>tarefas de preparo</span>
      </button>
    </div>
  );
}

// ---------- Calendário ----------

function EntryButton({ entry, date, slot, onEntry, large }) {
  const s = useStore();
  const label = entryLabel(entry, { recipesById: s.recipes, marmitasById: s.marmitas });
  const Icon = ENTRY_ICON[entry.kind];
  const recipe = entry.kind === 'recipe' ? s.recipes[entry.recipeId] : null;
  const sub = [];
  if (recipe && (entry.servings ?? recipe.servings) !== s.settings.people) sub.push(`${entry.servings} porções`);
  if (entry.kind === 'marmita') sub.push(`${entry.servings ?? 1} porç.`);
  if (entry.note) sub.push(entry.note);
  return (
    <button
      type="button"
      class={`entry kind-${entry.kind} ${entry.done ? 'done' : ''}`}
      onClick={() => onEntry(date, slot, entry.id)}
      aria-label={`${label}${entry.done ? ' (preparada)' : ''}. Abrir opções`}
    >
      {entry.done ? <CheckCircle2 size={large ? 18 : 14} class="e-icon" color="#52765D" /> : Icon ? <Icon size={large ? 18 : 14} class="e-icon" /> : null}
      <span class="e-main">
        <span class="e-name">{label.replace(/^Marmita: /, '').replace(/^Fora: /, '')}</span>
        {sub.length > 0 && <span class="e-sub">{sub.join(' · ')}</span>}
      </span>
    </button>
  );
}

function DayCard({ date, week, today, onAdd, onEntry }) {
  const isToday = date === today;
  return (
    <section class={`day-card ${isToday ? 'today' : ''} ${date < today ? 'past' : ''}`} aria-label={`${weekdayName(date)} ${formatDayMonth(date)}`}>
      <div class="day-head">
        <h3>{weekdayName(date)}</h3>
        <span class="date">{isToday ? 'Hoje · ' : ''}{formatDayMonth(date)}</span>
      </div>
      {MEAL_SLOTS.map((slot) => {
        const entries = week.meals?.[date]?.[slot.id] ?? [];
        return (
          <div class="slot" key={slot.id}>
            <div class="slot-label">{slot.label}</div>
            <div class="slot-entries">
              {entries.map((e) => (
                <EntryButton key={e.id} entry={e} date={date} slot={slot.id} onEntry={onEntry} />
              ))}
            </div>
            <button
              type="button"
              class={`add-slot ${!entries.length && !slot.snack ? 'empty-slot' : ''}`}
              onClick={() => onAdd(date, slot.id)}
              aria-label={`Adicionar ${slot.label.toLowerCase()} em ${weekdayName(date)}`}
            >
              <Plus size={14} /> {entries.length ? 'adicionar' : slot.snack ? 'sem lanche' : 'definir'}
            </button>
          </div>
        );
      })}
    </section>
  );
}

function DayView({ week, dates, day, today, onDay, onAdd, onEntry }) {
  const touch = useRef(null);
  const idx = dates.indexOf(day);
  const go = (n) => {
    const next = dates[idx + n];
    if (next) onDay(next);
  };
  return (
    <>
      <div class="day-strip" role="tablist" aria-label="Dias da semana">
        {dates.map((d) => {
          const filled = MEAL_SLOTS.map((m) => (week.meals?.[d]?.[m.id] ?? []).length > 0);
          return (
            <button
              key={d}
              type="button"
              role="tab"
              class={d === today ? 'today' : ''}
              aria-selected={d === day ? 'true' : 'false'}
              aria-label={`${weekdayName(d)} ${formatDayMonth(d)}, ${filled.filter(Boolean).length} de 4 refeições`}
              onClick={() => onDay(d)}
            >
              <span class="dw">{weekdayShort(d)}</span>
              <span class="dn">{parseISODate(d).getDate()}</span>
              <span class="dots" aria-hidden="true">
                {filled.map((f, i) => (
                  <i key={i} class={f ? 'on' : ''} />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      <div
        class="day-view"
        role="tabpanel"
        aria-label={`${weekdayName(day)} ${formatDayMonth(day)}`}
        onTouchStart={(e) => {
          const t = e.touches[0];
          touch.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={(e) => {
          if (!touch.current) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - touch.current.x;
          const dy = t.clientY - touch.current.y;
          touch.current = null;
          if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(dy) * 1.6) go(dx < 0 ? 1 : -1);
        }}
      >
        <div class="day-view-head">
          <button type="button" class="icon-btn" disabled={idx === 0} onClick={() => go(-1)} aria-label="Dia anterior">
            <ChevronLeft size={20} />
          </button>
          <h2>
            {weekdayName(day)} <span class="muted" style="font-weight:500">{formatDayMonth(day)}{day === today ? ' · hoje' : ''}</span>
          </h2>
          <button type="button" class="icon-btn" disabled={idx === dates.length - 1} onClick={() => go(1)} aria-label="Próximo dia">
            <ChevronRight size={20} />
          </button>
        </div>
        {MEAL_SLOTS.map((slot) => {
          const entries = week.meals?.[day]?.[slot.id] ?? [];
          return (
            <section class="slot-card" key={slot.id} aria-label={slot.label}>
              <div class="slot-label">{slot.label}</div>
              <div class="slot-entries">
                {entries.map((e) => (
                  <EntryButton key={e.id} entry={e} date={day} slot={slot.id} onEntry={onEntry} large />
                ))}
              </div>
              <button type="button" class="add-slot" onClick={() => onAdd(day, slot.id)}>
                <Plus size={16} /> {entries.length ? 'Adicionar mais' : slot.snack ? 'Adicionar lanche' : 'Definir refeição'}
              </button>
            </section>
          );
        })}
      </div>
    </>
  );
}

function WeekList({ week, dates, today, onPick }) {
  const s = useStore();
  return (
    <div class="week-list">
      {dates.map((d) => (
        <button key={d} type="button" class="day-row" onClick={() => onPick(d)} aria-label={`Abrir ${weekdayName(d)}`}>
          <span class="dr-date" style={d === today ? 'color:var(--green-dark)' : ''}>
            {weekdayShort(d)}
            <strong>{parseISODate(d).getDate()}</strong>
          </span>
          <span class="dr-meals">
            {MEAL_SLOTS.map((m) => {
              const entries = week.meals?.[d]?.[m.id] ?? [];
              if (!entries.length && m.snack) return null;
              return (
                <div key={m.id}>
                  <b>{m.short}</b>
                  {entries.length ? (
                    entries.map((e) => entryLabel(e, { recipesById: s.recipes, marmitasById: s.marmitas })).join(' + ')
                  ) : (
                    <span style="color:var(--coral-dark)">a definir</span>
                  )}
                </div>
              );
            })}
          </span>
          <ChevronRight size={18} class="muted" />
        </button>
      ))}
    </div>
  );
}

// ---------- Marmitas ----------

function MarmitasSection({ weekId }) {
  const s = useStore();
  const dates = new Set(weekDates(weekId));
  const list = Object.values(s.marmitas)
    .filter((m) => dates.has(m.prepDate) || ['preparada', 'armazenada'].includes(m.status))
    .sort((a, b) => a.prepDate.localeCompare(b.prepDate));
  if (!list.length) return null;
  return (
    <section class="section" aria-labelledby="marmitas-title">
      <h2 class="section-title" id="marmitas-title">
        <Box size={20} color="#A8645A" /> Marmitas
      </h2>
      <div class="marmita-grid">
        {list.map((m) => (
          <MarmitaCard key={m.id} m={m} />
        ))}
      </div>
    </section>
  );
}

function MarmitaCard({ m }) {
  const s = useStore();
  const recipe = s.recipes[m.recipeId];
  const { used, uses } = marmitaUsage(m.id);
  const idx = MARMITA_STATUS.findIndex((x) => x.id === m.status);
  const next = MARMITA_STATUS[idx + 1];

  const advance = async () => {
    if (!next) return;
    let consume = false;
    if (next.id === 'preparada') {
      const choice = await confirmDialog({
        title: 'Marmitas preparadas',
        message: `Descontar do estoque os ingredientes de ${m.portions} porções de ${recipe?.name}?`,
        actions: [
          { id: 'only', label: 'Só marcar', variant: 'btn-secondary' },
          { id: 'consume', label: 'Descontar do estoque', variant: 'btn-primary' },
        ],
      });
      if (!choice) return;
      consume = choice === 'consume';
    }
    const r = setMarmitaStatus(m.id, next.id, consume);
    toast(consume ? `Marmita preparada · ${r.count} itens descontados` : `Marmita: ${next.label.toLowerCase()}`);
  };

  const remove = async () => {
    const ok = await confirmDialog({
      title: 'Excluir marmita',
      message: `Excluir o lote de ${recipe?.name} e as ${uses.length} refeições que o utilizam?`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    deleteMarmita(m.id);
    toast('Marmita excluída');
  };

  return (
    <article class="card card-pad marmita-card">
      <div class="m-head">
        <h4>{recipe?.name ?? 'Receita removida'}</h4>
        <span class="badge badge-coral">{MARMITA_STATUS[idx]?.label}</span>
      </div>
      <div class="status-steps" aria-hidden="true">
        {MARMITA_STATUS.map((st, i) => (
          <span key={st.id} class={i <= idx ? 'on' : ''} />
        ))}
      </div>
      <p class="small muted">
        Preparo {weekdayShort(m.prepDate)} {formatDayMonth(m.prepDate)} · {used} de {m.portions} porções no cardápio ·{' '}
        {m.storage === 'freezer' ? <Snowflake size={12} style="display:inline" /> : <Refrigerator size={12} style="display:inline" />}{' '}
        {m.storage === 'freezer' ? 'freezer' : 'geladeira'}
      </p>
      {used > m.portions && <p class="xsmall" style="color:var(--coral-dark)">Há mais porções no cardápio do que no lote.</p>}
      <div class="toolbar">
        {next && (
          <button type="button" class="btn btn-soft btn-sm" onClick={advance}>
            Marcar como {next.label.toLowerCase()}
          </button>
        )}
        <button
          type="button"
          class="btn btn-ghost btn-sm"
          onClick={() => updateMarmita(m.id, { storage: m.storage === 'freezer' ? 'geladeira' : 'freezer' })}
        >
          {m.storage === 'freezer' ? 'Mover p/ geladeira' : 'Mover p/ freezer'}
        </button>
        <button type="button" class="icon-btn sm" aria-label="Excluir marmita" onClick={remove}>
          <Trash2 size={16} />
        </button>
      </div>
    </article>
  );
}

// ---------- Reaproveitar semanas ----------

function ReuseWeekModal({ weekId, onClose }) {
  const s = useStore();
  const weeks = Object.values(s.weeks)
    .filter((w) => w.id !== weekId && countEntries(w) > 0)
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || (a.id < b.id ? 1 : -1));
  const apply = async (w) => {
    let merge = false;
    if (countEntries(s.weeks[weekId])) {
      const choice = await confirmDialog({
        title: 'Aplicar semana',
        message: 'Esta semana já tem refeições. Somar ou substituir?',
        actions: [
          { id: 'merge', label: 'Somar', variant: 'btn-secondary' },
          { id: 'replace', label: 'Substituir', variant: 'btn-primary' },
        ],
      });
      if (!choice) return;
      merge = choice === 'merge';
    }
    const before = copyFromWeek(w.id, weekId, merge);
    onClose();
    toast('Planejamento aplicado', { action: { label: 'Desfazer', onClick: () => restoreWeek(before) } });
  };
  return (
    <Modal open onClose={onClose} title="Reaproveitar semana" subtitle="Copie as refeições de uma semana salva ou anterior">
      {weeks.length === 0 ? (
        <EmptyState icon={History} title="Nenhuma outra semana planejada">
          Quando você planejar outras semanas, elas aparecem aqui.
        </EmptyState>
      ) : (
        <div class="action-list">
          {weeks.map((w) => (
            <button key={w.id} type="button" onClick={() => apply(w)}>
              {w.favorite ? <Star size={18} fill="#DCA49B" color="#DCA49B" /> : <CalendarDays size={18} />}
              <span style="flex:1">
                <strong>{w.favoriteName || formatWeekRange(w.id)}</strong>
                <span class="small muted" style="display:block">
                  {w.favoriteName ? `${formatWeekRange(w.id)} · ` : ''}
                  {countEntries(w)} refeições
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Modal>
  );
}

function FavoriteModal({ weekId, onClose }) {
  const [name, setName] = useState('');
  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title="Salvar como favorita"
      footer={
        <>
          <button type="button" class="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button
            type="button"
            class="btn btn-primary"
            onClick={() => {
              setWeekFavorite(weekId, true, name.trim());
              toast('Semana salva nas favoritas');
              onClose();
            }}
          >
            <Star size={16} /> Salvar
          </button>
        </>
      }
    >
      <label class="field">
        <span class="label">Nome (opcional)</span>
        <input class="input" value={name} maxLength={60} placeholder="Ex.: Semana leve, Semana de marmitas" onInput={(e) => setName(e.currentTarget.value)} autoFocus />
        <span class="hint">Semanas favoritas aparecem primeiro em "Reaproveitar semana".</span>
      </label>
    </Modal>
  );
}

// ---------- Versão para impressão ----------

function PrintableWeek({ weekId, week }) {
  const s = useStore();
  const dates = weekDates(weekId);
  return (
    <div class="print-only" aria-hidden="true">
      <h1>Cardápio PanelAI — {formatWeekRange(weekId)}</h1>
      <table class="print-table">
        <thead>
          <tr>
            <th />
            {dates.map((d) => (
              <th key={d}>
                {weekdayName(d)} {formatDayMonth(d)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {MEAL_SLOTS.map((m) => (
            <tr key={m.id}>
              <th>{m.label}</th>
              {dates.map((d) => (
                <td key={d}>
                  {(week.meals?.[d]?.[m.id] ?? []).map((e) => (
                    <div key={e.id}>{entryLabel(e, { recipesById: s.recipes, marmitasById: s.marmitas })}</div>
                  ))}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

