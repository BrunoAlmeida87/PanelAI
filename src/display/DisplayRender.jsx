// Desenha um layout do display no tamanho exato da tela (pixels reais).
// Usado no editor (com escala), nas miniaturas e na tela cheia (#/display/tela).

import { cardType, colorMode, screenSize } from './model.js';
import { formatDayMonth, weekdayName, weekdayShort, addDays, weekStartOf, formatWeekRange, parseISODate } from '../utils/dates.js';
import { formatAge, montessoriCategory } from '../models/montessori.js';

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const pad = (n) => String(n).padStart(2, '0');

export function cardTitle(card) {
  if (card.title) return card.title;
  const day = card.options?.day === 'tomorrow' ? 'amanhã' : 'hoje';
  switch (card.type) {
    case 'menuDay':
      return `Cardápio de ${day}`;
    case 'tasksDay':
      return `Tarefas de ${day}`;
    case 'prep':
      return `Preparos de ${day}`;
    default:
      return cardType(card.type)?.label ?? card.type;
  }
}

export function DisplayRender({ layout, data, scale = 1, overlay = null, className = '' }) {
  const { w, h } = screenSize(layout);
  const mode = colorMode(layout.colorMode);
  const g = layout.grid;
  const base = Math.max(10, Math.round(Math.min(w, h) / 30));
  const gridStyle = {
    gridTemplateColumns: `repeat(${g.cols}, minmax(0, 1fr))`,
    gridTemplateRows: `repeat(${g.rows}, minmax(0, 1fr))`,
    gap: `${g.gap}px`,
    padding: `${g.padding}px`,
  };
  return (
    <div class={`eink-frame ${className}`} style={{ width: `${w * scale}px`, height: `${h * scale}px` }}>
      <div
        class={`eink eink-${mode.id}`}
        style={{
          ...gridStyle,
          width: `${w}px`,
          height: `${h}px`,
          transform: scale === 1 ? undefined : `scale(${scale})`,
          '--base': `${base}px`,
          '--accent': mode.accent,
          '--soft': mode.soft,
        }}
      >
        {layout.cards.map((card) => (
          <div
            key={card.id}
            class={`eink-card border-${card.border ?? 'line'} ${card.invert ? 'invert' : ''}`}
            data-type={card.type}
            style={{ gridColumn: `${card.x + 1} / span ${card.w}`, gridRow: `${card.y + 1} / span ${card.h}`, fontSize: `calc(var(--base) * ${card.fontScale ?? 1})` }}
          >
            {card.showTitle && <div class="eink-title">{cardTitle(card)}</div>}
            <div class="eink-body">
              <CardBody card={card} data={data} />
            </div>
          </div>
        ))}
        {overlay && <div class="eink-overlay" style={gridStyle}>{overlay}</div>}
      </div>
    </div>
  );
}

const Box = ({ on, warn }) => <span class={`eink-box ${on ? 'on' : ''} ${warn ? 'warn' : ''}`} aria-hidden="true" />;
const Empty = ({ children }) => <p class="eink-empty">{children}</p>;

function CardBody({ card, data }) {
  const o = card.options ?? {};
  switch (card.type) {
    case 'clock':
      return <Clock o={o} data={data} />;
    case 'menuDay':
      return <MenuDay o={o} data={data} />;
    case 'menuWeek':
      return <MenuWeek o={o} data={data} />;
    case 'tasksDay':
      return <TasksDay o={o} data={data} />;
    case 'tasksWeek':
      return <TasksWeek o={o} data={data} />;
    case 'pending':
      return <Pending o={o} data={data} />;
    case 'shopping':
      return <Shopping o={o} data={data} />;
    case 'pantryLow':
      return <PantryLow o={o} data={data} />;
    case 'marmitas':
      return <Marmitas o={o} data={data} />;
    case 'prep':
      return <Prep o={o} data={data} />;
    case 'summary':
      return <Summary data={data} />;
    case 'montessori':
      return <Montessori o={o} data={data} />;
    case 'note':
      return <p class="eink-note" style={{ textAlign: o.align ?? 'center' }}>{o.text}</p>;
    default:
      return <Empty>Card desconhecido</Empty>;
  }
}

function Clock({ o, data }) {
  const d = parseISODate(data.today);
  const date =
    o.style === 'short' ? `${weekdayShort(data.today)} ${formatDayMonth(data.today)}` : `${weekdayName(data.today)}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
  const time = `${pad(data.now.getHours())}:${pad(data.now.getMinutes())}`;
  return (
    <div class="eink-clock">
      <span class="date">{date}</span>
      {o.showWeek && <span class="week">Semana {formatWeekRange(weekStartOf(data.today))}</span>}
      {o.showTime && <span class="time">Atualizado às {time}</span>}
    </div>
  );
}

function MenuDay({ o, data }) {
  const date = data.dayOf(o.day);
  const slots = data.meals(date).filter((m) => (o.slots ?? []).includes(m.slot) && (!o.hideEmpty || m.entries.length));
  if (!slots.length) return <Empty>Nada planejado para {o.day === 'tomorrow' ? 'amanhã' : 'hoje'}.</Empty>;
  return (
    <dl class="eink-meals">
      {slots.map((m) => (
        <div key={m.slot} class="meal">
          <dt>{m.label}</dt>
          <dd>
            {m.entries.length
              ? m.entries.map((e) => `${e.text}${o.showServings && e.servings ? ` (${e.servings})` : ''}`).join(' + ')
              : '—'}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function MenuWeek({ o, data }) {
  const first = o.start === 'monday' ? weekStartOf(data.today) : data.today;
  const days = Array.from({ length: Math.max(2, Math.min(7, o.days ?? 7)) }, (_, i) => addDays(first, i));
  return (
    <div class={`eink-week ${o.layout === 'rows' ? 'rows' : 'cols'}`} style={o.layout === 'rows' ? undefined : { gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
      {days.map((d) => {
        const meals = data.meals(d).filter((m) => (o.slots ?? []).includes(m.slot));
        return (
          <div key={d} class={`day ${d === data.today ? 'today' : ''}`}>
            <div class="day-name">
              {weekdayShort(d)} {parseISODate(d).getDate()}
            </div>
            <div class="day-items">
              {meals.map((m) => (
                <div key={m.slot} class="item">
                  {(o.slots ?? []).length > 1 && <span class="lbl">{m.short}: </span>}
                  {m.entries.length ? m.entries.map((e) => e.text).join(' + ') : '—'}
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskLine({ t, o, today, showDate = false }) {
  const late = t.date < today && t.status !== 'done';
  return (
    <li class={`${t.status}`}>
      <Box on={t.status === 'done'} warn={t.status === 'pending'} />
      <span class="txt">
        {t.title}
        {o.showAssignee && t.assignee ? <span class="who"> · {t.assignee}</span> : null}
        {t.movedFrom?.length ? <span class="from"> ↪ de {formatDayMonth(t.movedFrom[t.movedFrom.length - 1])}</span> : null}
        {late || showDate ? <span class="from"> ({late ? 'atrasada ' : ''}{formatDayMonth(t.date)})</span> : null}
      </span>
    </li>
  );
}

function TasksDay({ o, data }) {
  const date = data.dayOf(o.day);
  let list = data.tasksOn(date);
  if (!o.showDone) list = list.filter((t) => t.status !== 'done');
  if (o.showOverdue && o.day !== 'tomorrow') list = [...data.overdue(), ...list];
  list = list.slice(0, o.max ?? 12);
  if (!list.length) return <Empty>Nenhuma tarefa.</Empty>;
  return (
    <ul class="eink-list">
      {list.map((t) => (
        <TaskLine key={t.id} t={t} o={o} today={data.today} />
      ))}
    </ul>
  );
}

function TasksWeek({ o, data }) {
  const days = Array.from({ length: 7 }, (_, i) => addDays(data.weekId, i));
  return (
    <div class={`eink-week ${o.layout === 'rows' ? 'rows' : 'cols'}`} style={o.layout === 'rows' ? undefined : { gridTemplateColumns: 'repeat(7, minmax(0, 1fr))' }}>
      {days.map((d) => {
        let list = data.tasksOn(d);
        if (!o.showDone) list = list.filter((t) => t.status !== 'done');
        const extra = Math.max(0, list.length - (o.maxPerDay ?? 5));
        list = list.slice(0, o.maxPerDay ?? 5);
        return (
          <div key={d} class={`day ${d === data.today ? 'today' : ''}`}>
            <div class="day-name">
              {weekdayShort(d)} {parseISODate(d).getDate()}
            </div>
            <ul class="eink-list compact">
              {list.map((t) => (
                <TaskLine key={t.id} t={t} o={o} today={data.today} />
              ))}
              {extra > 0 && <li class="more">+{extra}</li>}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

function Pending({ o, data }) {
  const list = data.pending().slice(0, o.max ?? 8);
  if (!list.length) return <Empty>Sem pendências. 👍</Empty>;
  return (
    <ul class="eink-list">
      {list.map((t) => (
        <li key={t.id} class={t.status}>
          <Box warn />
          <span class="txt">
            <strong>{t.title}</strong> <span class="from">({formatDayMonth(t.date)})</span>
            {o.showNote && t.pendingNote ? <span class="note"> — {t.pendingNote}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

function Shopping({ o, data }) {
  let list = data.shopping();
  if (!o.showChecked) list = list.filter((i) => !i.checked);
  const extra = Math.max(0, list.length - (o.max ?? 30));
  list = list.slice(0, o.max ?? 30);
  if (!list.length) return <Empty>Nada a comprar. 🎉</Empty>;
  return (
    <ul class="eink-list" style={{ columnCount: o.columns ?? 2 }}>
      {list.map((i, idx) => (
        <li key={idx} class={i.checked ? 'done' : ''}>
          <Box on={i.checked} />
          <span class="txt">
            {i.name}
            {o.showQty && i.qty ? <span class="who"> {i.qty}</span> : null}
          </span>
        </li>
      ))}
      {extra > 0 && <li class="more">+{extra} itens</li>}
    </ul>
  );
}

function PantryLow({ o, data }) {
  const list = data.pantryLow().slice(0, o.max ?? 10);
  if (!list.length) return <Empty>Despensa em dia.</Empty>;
  return (
    <ul class="eink-list">
      {list.map((p) => (
        <li key={p.name}>
          <Box warn />
          <span class="txt">
            {p.name}
            {o.showQty ? <span class="who"> {p.qty} (mín. {p.min})</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

const MARMITA_STATUS = { planejada: 'planejada', preparada: 'pronta', armazenada: 'guardada' };
function Marmitas({ o, data }) {
  const list = data.marmitas().filter((m) => o.showPlanned || m.status !== 'planejada');
  if (!list.length) return <Empty>Nenhuma marmita.</Empty>;
  return (
    <ul class="eink-list">
      {list.map((m, idx) => (
        <li key={idx}>
          <Box on={m.status !== 'planejada'} />
          <span class="txt">
            {m.name}
            <span class="who">
              {' '}
              · {m.portions} porç. · {MARMITA_STATUS[m.status]} · {m.storage === 'freezer' ? 'freezer' : 'geladeira'}
            </span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Prep({ o, data }) {
  const list = data.prep(data.dayOf(o.day));
  if (!list.length) return <Empty>Nada para adiantar.</Empty>;
  return (
    <ul class="eink-list">
      {list.map((t) => (
        <li key={t.key}>
          <Box />
          <span class="txt">
            {t.text}
            <span class="who"> · {t.detail}</span>
          </span>
        </li>
      ))}
    </ul>
  );
}

function Summary({ data }) {
  const s = data.summary();
  const items = [
    [`${s.tasksDone}/${s.tasksTotal}`, 'tarefas feitas'],
    [`${s.planned}/${s.plannedTotal}`, 'refeições planejadas'],
    [s.toBuy, 'itens a comprar'],
    [s.pending, 'pendências'],
  ];
  return (
    <div class="eink-summary">
      {items.map(([n, l]) => (
        <div key={l}>
          <b>{n}</b>
          <span>{l}</span>
        </div>
      ))}
    </div>
  );
}

function Montessori({ o, data }) {
  const kids = data.montessori?.() ?? [];
  if (!kids.length) return <Empty>Cadastre a criança na aba Montessori.</Empty>;
  return (
    <div class="eink-montessori">
      {kids.map(({ child, age, items }) => {
        const list = o.showDone === false ? items.filter((i) => !i.done) : items;
        return (
          <div key={child.id} class="kid">
            {o.showChild !== false && (
              <div class="kid-name">
                {child.name}
                {age ? <span class="who"> · {formatAge(age)}</span> : null}
              </div>
            )}
            {list.length ? (
              <ul class="eink-list">
                {list.map(({ activity: a, done }) => (
                  <li key={a.id} class={done ? 'done' : ''}>
                    <Box on={done} />
                    <span class="txt">
                      {a.nome}
                      {o.showCategory ? <span class="who"> · {montessoriCategory(a.categoria)?.short}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>{items.length ? 'Tudo feito hoje. 👏' : 'Nenhuma atividade escolhida.'}</Empty>
            )}
          </div>
        );
      })}
    </div>
  );
}
