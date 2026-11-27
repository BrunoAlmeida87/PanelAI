// Desenha um layout do display no tamanho exato da tela (pixels reais).
// Usado no editor (com escala), nas miniaturas e na tela cheia (#/display/tela).

import { Sun, CloudSun, Cloud, CloudFog, CloudDrizzle, CloudRain, CloudRainWind, CloudSnow, CloudLightning, CloudHail, Moon, CloudMoon, Umbrella, Droplets, Wind, Sunrise, Sunset } from 'lucide-preact';
import { cardType, colorMode, screenSize, typographyVars } from './model.js';
import './fonts.js';
import { forecastView, formatMm } from './weather.js';
import { useForecast } from './useWeather.js';
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
    case 'weather':
      return card.options?.place?.name ? `Clima · ${card.options.place.name}` : 'Clima';
    case 'shopping':
      return card.options?.day === 'today' || card.options?.day === 'tomorrow' ? `Compras de ${day}` : 'Lista de compras';
    default:
      return cardType(card.type)?.label ?? card.type;
  }
}

export function DisplayRender({ layout, data, scale = 1, overlay = null, className = '', filter = null }) {
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
    <div class={`eink-frame ${className}`} style={{ width: `${w * scale}px`, height: `${h * scale}px`, ...(filter ? { filter } : {}) }}>
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
          ...typographyVars(layout.typography),
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
    case 'weather':
      return <Weather o={o} data={data} />;
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
  // Hora real em que a imagem foi gerada (não o horário agendado para o qual ela foi feita).
  const at = data.updatedAt ?? data.now;
  const time = `${pad(at.getHours())}:${pad(at.getMinutes())}`;
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
    <dl class={`eink-meals label-${o.labelStyle ?? 'underline'}`}>
      {slots.map((m) => (
        <div key={m.slot} class="meal">
          <dt>
            <span>{m.label}</span>
          </dt>
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

function TaskLine({ t, o, today, day = null, showDate = false }) {
  const late = t.date < today && t.status !== 'done';
  // Feita de outro dia (ex.: atrasada de ontem ticada hoje): mostra de quando era.
  const otherDay = t.status === 'done' && day && t.date !== day;
  return (
    <li class={`${t.status}`}>
      <Box on={t.status === 'done'} warn={t.status === 'pending'} />
      <span class="txt">
        {t.title}
        {o.showAssignee && t.assignee ? <span class="who"> · {t.assignee}</span> : null}
        {t.movedFrom?.length ? <span class="from"> ↪ de {formatDayMonth(t.movedFrom[t.movedFrom.length - 1])}</span> : null}
        {late || showDate || otherDay ? <span class="from"> ({late ? 'atrasada ' : otherDay ? 'de ' : ''}{formatDayMonth(t.date)})</span> : null}
      </span>
    </li>
  );
}

function TasksDay({ o, data }) {
  const date = data.dayOf(o.day);
  const doneFor = o.doneFor ?? '24';
  const day = data.tasksOn(date);
  const open = day.filter((t) => t.status !== 'done');
  let done = [];
  if (o.showDone) {
    done = day.filter((t) => t.status === 'done' && data.doneVisible(t, doneFor));
    // Feitas de dias anteriores (ex.: atrasada ticada hoje) continuam ✓ até a janela acabar.
    if (o.day !== 'tomorrow') done = [...data.recentlyDone(doneFor).filter((t) => t.date < date), ...done];
  }
  // Abertas primeiro (atrasadas no topo), feitas no fim da lista.
  let list = [...(o.showOverdue && o.day !== 'tomorrow' ? data.overdue() : []), ...open, ...done];
  list = list.slice(0, o.max ?? 12);
  if (!list.length) return <Empty>Nenhuma tarefa.</Empty>;
  return (
    <ul class="eink-list">
      {list.map((t) => (
        <TaskLine key={t.id} t={t} o={o} today={data.today} day={date} />
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
        list = o.showDone ? list.filter((t) => data.doneVisible(t, o.doneFor ?? '24')) : list.filter((t) => t.status !== 'done');
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
  const byDay = o.day === 'today' || o.day === 'tomorrow';
  let list = byDay ? data.shopping(data.dayOf(o.day), true) : data.shopping();
  if (!o.showChecked) list = list.filter((i) => !i.checked);
  const extra = Math.max(0, list.length - (o.max ?? 30));
  list = list.slice(0, o.max ?? 30);
  if (!list.length) return <Empty>{byDay ? `Nada a comprar ${o.day === 'tomorrow' ? 'amanhã' : 'hoje'}.` : 'Nada a comprar.'}</Empty>;
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

// ---------- Clima ----------

const WEATHER_ICONS = {
  sun: Sun,
  'sun-cloud': CloudSun,
  moon: Moon,
  'moon-cloud': CloudMoon,
  cloud: Cloud,
  fog: CloudFog,
  drizzle: CloudDrizzle,
  rain: CloudRain,
  'rain-heavy': CloudRainWind,
  snow: CloudSnow,
  storm: CloudLightning,
  hail: CloudHail,
};
const WIcon = ({ name, size = '1.4em' }) => {
  const I = WEATHER_ICONS[name] ?? Cloud;
  return <I class="w-ico" size={size} strokeWidth={2.25} aria-hidden="true" />;
};
const deg = (n) => (n == null ? '—' : `${n}°`);

function Weather({ o, data }) {
  const f = useForecast(o.place);
  const view = f.status === 'ok' ? forecastView(f.value, data.now, data.today, { hours: o.hours, hourStep: o.hourStep, days: o.days }) : null;
  if (f.status === 'none') return <Empty>Escolha a cidade nas opções do card.</Empty>;
  if (f.status === 'loading' && !view) return <Empty>Buscando a previsão…</Empty>;
  if (!view) return <Empty>Previsão indisponível agora.</Empty>;
  const { current: cur, today, rain } = view;
  const stamp = f.stale && f.at ? new Date(f.at) : null;
  return (
    <div class="eink-weather">
      {o.showNow !== false && (
        <div class="w-now">
          <WIcon name={cur.icon} size="2.4em" />
          <span class="w-temp">{deg(cur.temp)}</span>
          <span class="w-now-txt">
            <b>{cur.desc}</b>
            <span>
              {today ? `máx ${deg(today.max)} · mín ${deg(today.min)}` : ''}
              {cur.feels != null && Math.abs(cur.feels - cur.temp) >= 2 ? ` · sensação ${deg(cur.feels)}` : ''}
            </span>
          </span>
        </div>
      )}
      {o.showRain !== false && rain && (
        <div class={`w-rain ${rain.level}`}>
          <Umbrella class="w-ico" size="1.15em" strokeWidth={2.25} aria-hidden="true" />
          <span>{rain.text}</span>
        </div>
      )}
      {o.showDetails && (
        <div class="w-details">
          {cur.humidity != null && (
            <span>
              <Droplets class="w-ico" size="1em" aria-hidden="true" /> {cur.humidity}%
            </span>
          )}
          {cur.wind != null && (
            <span>
              <Wind class="w-ico" size="1em" aria-hidden="true" /> {cur.wind} km/h
            </span>
          )}
          {today?.uv != null && <span>UV {today.uv}</span>}
          {today?.sunrise && (
            <span>
              <Sunrise class="w-ico" size="1em" aria-hidden="true" /> {today.sunrise}
            </span>
          )}
          {today?.sunset && (
            <span>
              <Sunset class="w-ico" size="1em" aria-hidden="true" /> {today.sunset}
            </span>
          )}
        </div>
      )}
      {view.hours.length > 0 && (
        <div class="w-hours" style={{ gridTemplateColumns: `repeat(${view.hours.length}, minmax(0, 1fr))` }} aria-label="Chance de chuva ao longo de hoje">
          {view.hours.map((h) => (
            <div key={h.time} class="w-hour">
              <span class="w-h-pct">{h.prob ?? 0}%</span>
              <span class="w-bar">
                <i style={{ height: `${h.prob ?? 0}%` }} />
              </span>
              <span class="w-h-lbl">{h.label}</span>
              <span class="w-h-temp">{deg(h.temp)}</span>
            </div>
          ))}
        </div>
      )}
      {view.days.length > 0 && (
        <div class={`w-days ${o.daysLayout === 'columns' ? 'cols' : 'rows'}`} style={o.daysLayout === 'columns' ? { gridTemplateColumns: `repeat(${view.days.length}, minmax(0, 1fr))` } : undefined}>
          {view.days.map((d) => (
            <div key={d.date} class={`w-day ${d.date === data.today ? 'today' : ''}`}>
              <span class="w-d-name">{o.daysLayout === 'columns' ? d.short : d.label}</span>
              <WIcon name={d.icon} size="1.3em" />
              <span class="w-d-temp">
                <b>{deg(d.max)}</b> / {deg(d.min)}
              </span>
              <span class="w-d-rain">
                <Umbrella class="w-ico" size="0.95em" strokeWidth={2.25} aria-hidden="true" /> {d.prob ?? 0}%
                {d.mm >= 0.5 && o.daysLayout !== 'columns' ? ` · ${formatMm(d.mm)}` : ''}
              </span>
              {o.daysLayout !== 'columns' && <span class="w-d-desc">{d.desc}</span>}
            </div>
          ))}
        </div>
      )}
      {stamp && (
        <span class="w-stale">
          previsão de {pad(stamp.getHours())}:{pad(stamp.getMinutes())}
        </span>
      )}
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
