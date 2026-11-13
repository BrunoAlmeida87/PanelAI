// Recados: avisos da casa, com validade e repetição por dia da semana.

import { useMemo, useState } from 'preact/hooks';
import { CalendarClock, Pencil, Pin, PinOff, Plus, StickyNote, Trash2 } from 'lucide-preact';
import { useStore } from '../storage/store.js';
import { saveNote, deleteNote } from '../storage/actions.js';
import { NOTE_MAX_LENGTH, activeNotes, describeSchedule, groupNotes, normalizeNote, validateNote } from '../services/notes.js';
import { WEEKDAY_SHORT, todayISO } from '../utils/dates.js';
import { usePref } from '../utils/hooks.js';
import { Chip, EmptyState, Modal, toast } from '../components/ui.jsx';

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const EMPTY = { text: '', author: '', pinned: false, startDate: null, endDate: null, weekdays: [] };

export function NotesPage() {
  const s = useStore();
  const today = todayISO();
  const groups = useMemo(() => groupNotes(s.notes, today), [s.notes, today]);
  const [editing, setEditing] = useState(null); // recado em edição (ou EMPTY para novo)
  const total = Object.keys(s.notes).length;

  const remove = (note) => {
    const removed = deleteNote(note.id);
    if (removed) toast('Recado excluído', { action: { label: 'Desfazer', onClick: () => saveNote(removed) } });
  };

  const section = (title, list, hint) =>
    list.length > 0 && (
      <section class="note-group" aria-label={title}>
        <h2 class="section-title">
          {title} <span class="muted">{list.length}</span>
        </h2>
        {hint && <p class="small muted note-group-hint">{hint}</p>}
        <ul class="note-list">
          {list.map((n) => (
            <NoteCard key={n.id} note={n} onEdit={() => setEditing(n)} onRemove={() => remove(n)} />
          ))}
        </ul>
      </section>
    );

  return (
    <div class="notes-page">
      <div class="page-head">
        <div class="grow">
          <h1>Recados</h1>
          <p class="sub">Avisos para quem mora na casa. Os de hoje também aparecem no cardápio.</p>
        </div>
        <button type="button" class="btn btn-primary" onClick={() => setEditing(EMPTY)}>
          <Plus size={16} /> Novo recado
        </button>
      </div>

      {total === 0 ? (
        <div class="card">
          <EmptyState icon={StickyNote} title="Nenhum recado ainda">
            Deixe avisos como "tirar o frango do freezer" ou "lixo toda terça". Dá para definir até quando vale e em quais dias aparece.
          </EmptyState>
        </div>
      ) : (
        <>
          {section('Hoje', groups.active)}
          {groups.active.length === 0 && <p class="muted note-none">Nenhum recado para hoje.</p>}
          {section('Programados', groups.scheduled, 'Aparecem em outra data ou em outro dia da semana.')}
          {section('Encerrados', groups.expired, 'Já passaram da data de término. Edite a data para reativar.')}
        </>
      )}

      <NoteForm note={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function NoteCard({ note, onEdit, onRemove }) {
  const schedule = describeSchedule(note);
  return (
    <li class={`note-card ${note.pinned ? 'pinned' : ''}`}>
      <div class="note-body">
        <p class="note-text">{note.text}</p>
        {(note.author || schedule) && (
          <p class="note-meta">
            {note.author && <span>{note.author}</span>}
            {schedule && (
              <span>
                <CalendarClock size={13} /> {schedule}
              </span>
            )}
          </p>
        )}
      </div>
      <div class="note-actions">
        <button
          type="button"
          class="icon-btn"
          aria-pressed={note.pinned ? 'true' : 'false'}
          aria-label={note.pinned ? 'Desafixar recado' : 'Fixar recado no topo'}
          title={note.pinned ? 'Desafixar' : 'Fixar no topo'}
          onClick={() => saveNote({ ...note, pinned: !note.pinned })}
        >
          {note.pinned ? <PinOff size={18} /> : <Pin size={18} />}
        </button>
        <button type="button" class="icon-btn" aria-label="Editar recado" title="Editar" onClick={onEdit}>
          <Pencil size={18} />
        </button>
        <button type="button" class="icon-btn" aria-label="Excluir recado" title="Excluir" onClick={onRemove}>
          <Trash2 size={18} />
        </button>
      </div>
    </li>
  );
}

function NoteForm({ note, onClose }) {
  return note ? <NoteFormInner key={note.id ?? 'novo'} note={note} onClose={onClose} /> : null;
}

function NoteFormInner({ note, onClose }) {
  const [lastAuthor, setLastAuthor] = usePref('noteAuthor', '');
  const [form, setForm] = useState(() => ({ ...EMPTY, ...note, author: note.id ? note.author : lastAuthor }));
  const [errors, setErrors] = useState([]);
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const toggleDay = (d) => set({ weekdays: form.weekdays.includes(d) ? form.weekdays.filter((x) => x !== d) : [...form.weekdays, d] });

  const submit = (e) => {
    e.preventDefault();
    const clean = normalizeNote(form);
    const errs = validateNote(clean);
    if (errs.length) return setErrors(errs);
    saveNote(clean);
    setLastAuthor(clean.author);
    toast(note.id ? 'Recado atualizado' : 'Recado criado');
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={note.id ? 'Editar recado' : 'Novo recado'}
      footer={
        <>
          <button type="button" class="btn btn-secondary" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="note-form" class="btn btn-primary">
            Salvar
          </button>
        </>
      }
    >
      <form id="note-form" class="note-form" onSubmit={submit}>
        <div class="field">
          <label class="label" for="note-text">Recado</label>
          <textarea
            id="note-text"
            class="textarea"
            rows={3}
            maxLength={NOTE_MAX_LENGTH}
            value={form.text}
            onInput={(e) => set({ text: e.currentTarget.value })}
            placeholder="Ex.: Tirar o frango do freezer"
            required
          />
          <span class="hint">{form.text.length}/{NOTE_MAX_LENGTH}</span>
        </div>
        <label class="field">
          <span class="label">Quem escreveu (opcional)</span>
          <input class="input" type="text" maxLength={40} value={form.author} onInput={(e) => set({ author: e.currentTarget.value })} />
        </label>
        <div class="note-dates">
          <label class="field">
            <span class="label">Aparece a partir de</span>
            <input class="input" type="date" value={form.startDate ?? ''} onInput={(e) => set({ startDate: e.currentTarget.value || null })} />
          </label>
          <label class="field">
            <span class="label">Até</span>
            <input class="input" type="date" value={form.endDate ?? ''} min={form.startDate ?? undefined} onInput={(e) => set({ endDate: e.currentTarget.value || null })} />
          </label>
        </div>
        <div class="field">
          <span class="label">Repetir só nestes dias</span>
          <div class="chip-row" role="group" aria-label="Dias da semana">
            {WEEK_ORDER.map((d) => (
              <Chip key={d} pressed={form.weekdays.includes(d)} onClick={() => toggleDay(d)}>
                {WEEKDAY_SHORT[d]}
              </Chip>
            ))}
          </div>
          <span class="hint">Sem datas e sem dias marcados, o recado aparece sempre, até ser excluído.</span>
        </div>
        <label class="switch">
          <input type="checkbox" checked={form.pinned} onChange={(e) => set({ pinned: e.currentTarget.checked })} />
          <span>Fixar no topo</span>
        </label>
        {errors.length > 0 && (
          <p class="form-error" role="alert">
            {errors[0]}
          </p>
        )}
      </form>
    </Modal>
  );
}

/** Faixa com os recados de hoje, mostrada no topo do cardápio da semana atual. */
export function TodayNotes() {
  const s = useStore();
  const today = todayISO();
  const notes = useMemo(() => activeNotes(s.notes, today), [s.notes, today]);
  if (!notes.length) return null;
  const shown = notes.slice(0, 3);
  return (
    <a class="today-notes" href="#/recados" aria-label={`Recados de hoje: ${notes.length}. Abrir recados`}>
      <StickyNote size={18} />
      <ul>
        {shown.map((n) => (
          <li key={n.id}>
            {n.pinned && <Pin size={12} aria-label="Fixado" />} {n.text}
          </li>
        ))}
        {notes.length > shown.length && <li class="more">+ {notes.length - shown.length} recado(s)</li>}
      </ul>
    </a>
  );
}
