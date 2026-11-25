// Formulários da aba Montessori: cadastro da criança e registro de uma atividade.

import { useState } from 'preact/hooks';
import { Trash2 } from 'lucide-preact';
import { AUTONOMY_LEVELS, INTEREST_LEVELS, validateChildInput, validateLogInput } from '../../models/montessori.js';
import { addLog, deleteChild, deleteLog, restoreChild, restoreLog, saveChild, updateLog } from '../../storage/montessoriActions.js';
import { Chip, Modal, confirmDialog, toast } from '../../components/ui.jsx';
import { formatDayMonth, todayISO } from '../../utils/dates.js';

// ---------- Criança ----------

/** Campos do cadastro (usados no modal e no convite da página vazia). */
export function ChildFields({ form, setForm, errors, autoFocus = false }) {
  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  return (
    <>
      <label class="field">
        <span class="label">Nome da criança</span>
        <input
          class="input"
          value={form.name}
          maxLength={40}
          autoFocus={autoFocus}
          aria-invalid={errors.name ? 'true' : undefined}
          onInput={(e) => set({ name: e.currentTarget.value })}
        />
        {errors.name && <span class="error">{errors.name}</span>}
      </label>
      <label class="field">
        <span class="label">Data de nascimento</span>
        <input
          class="input"
          type="date"
          value={form.birthDate}
          max={todayISO()}
          style="max-width:220px"
          aria-invalid={errors.birthDate ? 'true' : undefined}
          onInput={(e) => set({ birthDate: e.currentTarget.value })}
        />
        {errors.birthDate && <span class="error">{errors.birthDate}</span>}
      </label>
      <details class="mt-optional" open={!!form.gestationWeeks || !!errors.gestationWeeks}>
        <summary>Nasceu prematuro? (opcional)</summary>
        <label class="field" style="margin-top:8px">
          <span class="label">Semanas de gestação ao nascer</span>
          <input
            class="input"
            type="number"
            inputMode="numeric"
            min={22}
            max={44}
            value={form.gestationWeeks ?? ''}
            placeholder="Ex.: 34"
            style="max-width:140px"
            aria-invalid={errors.gestationWeeks ? 'true' : undefined}
            onInput={(e) => set({ gestationWeeks: e.currentTarget.value })}
          />
          <span class="hint">Com 36 semanas ou menos, as sugestões usam a idade corrigida até os 2 anos, como orienta a pediatria.</span>
          {errors.gestationWeeks && <span class="error">{errors.gestationWeeks}</span>}
        </label>
      </details>
    </>
  );
}

export const emptyChildForm = (child = null) => ({
  name: child?.name ?? '',
  birthDate: child?.birthDate ?? '',
  gestationWeeks: child?.gestationWeeks ?? '',
});

/** Valida e grava. Devolve a criança salva ou null (erros em setErrors). */
export function submitChild(form, setErrors, id = null) {
  const errs = validateChildInput(form, todayISO());
  setErrors(errs);
  if (Object.keys(errs).length) return null;
  return saveChild({ id, ...form });
}

export function ChildModal({ child = null, onClose, onSaved }) {
  const [form, setForm] = useState(() => emptyChildForm(child));
  const [errors, setErrors] = useState({});
  const save = (e) => {
    e.preventDefault();
    const saved = submitChild(form, setErrors, child?.id ?? null);
    if (!saved) return;
    toast(child ? 'Cadastro atualizado' : 'Cadastro salvo');
    onSaved?.(saved);
    onClose();
  };
  const remove = async () => {
    const ok = await confirmDialog({
      title: 'Excluir cadastro',
      message: `Excluir o cadastro de ${child.name} e todo o histórico de atividades? Os registros são apagados em todos os aparelhos da casa.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    const removed = deleteChild(child.id);
    onClose();
    if (removed) toast('Cadastro excluído', { action: { label: 'Desfazer', onClick: () => restoreChild(removed) } });
  };
  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title={child ? 'Editar criança' : 'Cadastrar criança'}
      subtitle="A idade é calculada sozinha a partir da data de nascimento."
      footer={
        <>
          {child && (
            <button type="button" class="btn btn-danger-ghost" onClick={remove} style="margin-right:auto">
              <Trash2 size={16} /> Excluir
            </button>
          )}
          <button type="button" class="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="mt-child-form" class="btn btn-primary">
            Salvar
          </button>
        </>
      }
    >
      <form id="mt-child-form" class="form-section" onSubmit={save}>
        <ChildFields form={form} setForm={setForm} errors={errors} autoFocus />
      </form>
    </Modal>
  );
}

// ---------- Registro de atividade ----------

/**
 * Registrar que a atividade foi feita (ou editar um registro).
 * `log` presente → edição.
 */
export function LogModal({ activity, child, log = null, onClose }) {
  const today = todayISO();
  const [date, setDate] = useState(log?.date ?? today);
  const [interest, setInterest] = useState(log?.interest ?? '');
  const [autonomy, setAutonomy] = useState(log?.autonomy ?? '');
  const [notes, setNotes] = useState(log?.notes ?? '');
  const [errors, setErrors] = useState({});

  const save = (e) => {
    e.preventDefault();
    const errs = validateLogInput({ date, interest, autonomy }, today);
    setErrors(errs);
    if (Object.keys(errs).length) return;
    if (log) {
      updateLog(log.id, { date, interest, autonomy, notes });
      toast('Registro atualizado');
    } else {
      const created = addLog({ childId: child.id, activityId: activity.id, date, interest, autonomy, notes });
      toast(`Registrado: ${activity.nome}${date === today ? ' (hoje)' : ` (${formatDayMonth(date)})`}`, {
        action: { label: 'Desfazer', onClick: () => deleteLog(created.id) },
      });
    }
    onClose();
  };

  const remove = async () => {
    const ok = await confirmDialog({ title: 'Excluir registro', message: `Excluir o registro de ${formatDayMonth(log.date)}?`, confirmLabel: 'Excluir', danger: true });
    if (!ok) return;
    const removed = deleteLog(log.id);
    onClose();
    if (removed) toast('Registro excluído', { action: { label: 'Desfazer', onClick: () => restoreLog(removed) } });
  };

  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title={log ? 'Editar registro' : 'Registrar atividade'}
      subtitle={`${activity?.nome ?? 'Atividade'} · ${child.name}`}
      footer={
        <>
          {log && (
            <button type="button" class="btn btn-danger-ghost" onClick={remove} style="margin-right:auto">
              <Trash2 size={16} /> Excluir
            </button>
          )}
          <button type="button" class="btn btn-ghost" onClick={onClose}>
            Cancelar
          </button>
          <button type="submit" form="mt-log-form" class="btn btn-primary">
            Salvar
          </button>
        </>
      }
    >
      <form id="mt-log-form" class="form-section" onSubmit={save}>
        <label class="field">
          <span class="label">Data</span>
          <input class="input" type="date" value={date} max={today} style="max-width:200px" onInput={(e) => setDate(e.currentTarget.value)} aria-invalid={errors.date ? 'true' : undefined} />
          {errors.date && <span class="error">{errors.date}</span>}
        </label>
        <div class="field">
          <span class="label" id="mt-interest">Interesse da criança</span>
          <div class="chip-row" role="group" aria-labelledby="mt-interest">
            {INTEREST_LEVELS.map((x) => (
              <Chip key={x.id} pressed={interest === x.id} onClick={() => setInterest(x.id)}>
                {x.label}
              </Chip>
            ))}
          </div>
          {errors.interest && <span class="error">{errors.interest}</span>}
        </div>
        <div class="field">
          <span class="label" id="mt-autonomy">Autonomia</span>
          <div class="chip-row" role="group" aria-labelledby="mt-autonomy">
            {AUTONOMY_LEVELS.map((x) => (
              <Chip key={x.id} pressed={autonomy === x.id} onClick={() => setAutonomy(x.id)}>
                {x.label}
              </Chip>
            ))}
          </div>
          {errors.autonomy && <span class="error">{errors.autonomy}</span>}
        </div>
        <label class="field">
          <span class="label">Observações</span>
          <textarea class="input" rows={3} maxLength={1000} value={notes} placeholder="Opcional: o que ela fez, do que gostou, o que mudar da próxima vez" onInput={(e) => setNotes(e.currentTarget.value)} />
        </label>
        <p class="xsmall muted" style="margin:0">É só um registro para lembrar como foi — não é nota nem meta.</p>
      </form>
    </Modal>
  );
}
