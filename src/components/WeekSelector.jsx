import { useState } from 'preact/hooks';
import { ChevronLeft, ChevronRight } from 'lucide-preact';
import { useWeekId, shiftWeek, setWeekId } from '../storage/ui.js';
import { useStore } from '../storage/store.js';
import { Modal } from './ui.jsx';
import { addDays, formatDayMonth, parseISODate, todayISO, weekStartOf, formatWeekRange } from '../utils/dates.js';
import { countEntries } from '../services/planning.js';

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

export function weekShortLabel(weekId) {
  const a = parseISODate(weekId);
  const b = parseISODate(addDays(weekId, 6));
  if (a.getMonth() === b.getMonth()) return `${a.getDate()}–${b.getDate()} ${MONTHS[b.getMonth()]}`;
  return `${a.getDate()} ${MONTHS[a.getMonth()]}–${b.getDate()} ${MONTHS[b.getMonth()]}`;
}

export function relativeWeekLabel(weekId) {
  const current = weekStartOf(todayISO());
  const diff = Math.round((parseISODate(weekId) - parseISODate(current)) / (7 * 86400000));
  if (diff === 0) return 'Esta semana';
  if (diff === 1) return 'Próxima semana';
  if (diff === -1) return 'Semana passada';
  return String(parseISODate(addDays(weekId, 6)).getFullYear());
}

export function WeekSelector() {
  const weekId = useWeekId();
  const [open, setOpen] = useState(false);
  return (
    <div class="week-selector" aria-label="Semana">
      <button type="button" class="icon-btn" onClick={() => shiftWeek(-1)} aria-label="Semana anterior" title="Semana anterior (←)">
        <ChevronLeft size={18} />
      </button>
      <button type="button" class="label" onClick={() => setOpen(true)} aria-label={`Semana de ${formatWeekRange(weekId)}. Escolher outra semana`}>
        {weekShortLabel(weekId)}
        <small>{relativeWeekLabel(weekId)}</small>
      </button>
      <button type="button" class="icon-btn" onClick={() => shiftWeek(1)} aria-label="Próxima semana" title="Próxima semana (→)">
        <ChevronRight size={18} />
      </button>
      {open && <WeekPicker onClose={() => setOpen(false)} weekId={weekId} />}
    </div>
  );
}

function WeekPicker({ onClose, weekId }) {
  const s = useStore();
  const current = weekStartOf(todayISO());
  const options = [-2, -1, 0, 1, 2, 3].map((n) => addDays(current, n * 7));
  const pick = (id) => {
    setWeekId(id);
    onClose();
  };
  return (
    <Modal open onClose={onClose} title="Escolher semana" size="sm">
      <div class="action-list">
        {options.map((id) => {
          const n = countEntries(s.weeks[id]);
          return (
            <button key={id} type="button" onClick={() => pick(id)} aria-current={id === weekId ? 'true' : undefined} style={id === weekId ? 'background:var(--green-light)' : ''}>
              <span style="flex:1">
                <strong>{formatDayMonth(id)} – {formatDayMonth(addDays(id, 6))}</strong>
                <span class="muted small" style="display:block">{relativeWeekLabel(id)}</span>
              </span>
              <span class="muted small">{n ? `${n} refeições` : 'vazia'}</span>
            </button>
          );
        })}
      </div>
      <div class="divider" />
      <label class="field">
        <span class="label">Ir para a semana de uma data</span>
        <input
          type="date"
          class="input"
          onChange={(e) => {
            if (e.currentTarget.value) pick(weekStartOf(e.currentTarget.value));
          }}
        />
      </label>
    </Modal>
  );
}
