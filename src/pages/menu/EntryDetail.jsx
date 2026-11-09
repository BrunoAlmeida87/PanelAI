// Detalhes e ações de uma refeição planejada.

import { useState } from 'preact/hooks';
import { ArrowRightLeft, BookOpen, Check, Copy, RefreshCw, Trash2, Undo2 } from 'lucide-preact';
import { Modal, Stepper, Chip, Segmented, toast, confirmDialog } from '../../components/ui.jsx';
import { useStore } from '../../storage/store.js';
import {
  updateMeal,
  removeMeal,
  restoreWeek,
  moveMeal,
  duplicateMeal,
  setMealDone,
  marmitaUsage,
} from '../../storage/actions.js';
import { MEAL_SLOTS, slotLabel, marmitaStatusLabel } from '../../models/constants.js';
import { formatDayMonth, weekDates, weekdayName, weekdayShort } from '../../utils/dates.js';
import { navigate } from '../../utils/router.js';
import { entryLabel } from '../../services/share.js';
import { IngredientPreview } from './MealPicker.jsx';

export function EntryDetail({ weekId, date, slot, entryId, onClose, onReplace }) {
  const s = useStore();
  const week = s.weeks[weekId];
  const entry = week?.meals?.[date]?.[slot]?.find((e) => e.id === entryId);
  const [mode, setMode] = useState(null); // 'move' | 'duplicate'
  const [targetDays, setTargetDays] = useState([]);
  const [targetSlot, setTargetSlot] = useState(slot);
  const [note, setNote] = useState(entry?.note ?? '');
  const [text, setText] = useState(entry?.text ?? '');

  if (!entry) return null;
  const recipe = entry.kind === 'recipe' ? s.recipes[entry.recipeId] : null;
  const marmita = entry.kind === 'marmita' ? s.marmitas[entry.marmitaId] : null;
  const label = entryLabel(entry, { recipesById: s.recipes, marmitasById: s.marmitas });
  const where = `${slotLabel(slot)} · ${weekdayName(date)} ${formatDayMonth(date)}`;

  const remove = () => {
    const before = removeMeal(weekId, date, slot, entryId);
    onClose();
    toast('Refeição removida', { action: { label: 'Desfazer', onClick: () => restoreWeek(before) } });
  };

  const toggleDone = async () => {
    if (entry.done) {
      setMealDone(weekId, date, slot, entryId, false);
      toast('Refeição marcada como pendente');
      return;
    }
    let consume = false;
    if (entry.kind === 'recipe' && recipe) {
      const choice = await confirmDialog({
        title: 'Marcar como preparada',
        message: 'A refeição sai da lista de compras. Deseja também descontar os ingredientes usados do estoque da despensa?',
        actions: [
          { id: 'only', label: 'Só marcar', variant: 'btn-secondary' },
          { id: 'consume', label: 'Descontar do estoque', variant: 'btn-primary' },
        ],
      });
      if (!choice) return;
      consume = choice === 'consume';
    }
    const r = setMealDone(weekId, date, slot, entryId, true, consume);
    toast(consume ? `Preparada · ${r.count} itens descontados do estoque` : 'Refeição marcada como preparada');
  };

  const applyTargets = () => {
    if (!targetDays.length) return toast('Escolha pelo menos um dia', { type: 'error' });
    if (mode === 'move') {
      moveMeal(weekId, entryId, targetDays[0], targetSlot);
      toast(`Transferida para ${weekdayName(targetDays[0])} · ${slotLabel(targetSlot)}`);
    } else {
      duplicateMeal(weekId, entryId, targetDays.map((d) => ({ date: d, slot: targetSlot })));
      toast(targetDays.length === 1 ? 'Refeição duplicada' : `Duplicada em ${targetDays.length} dias`);
    }
    onClose();
  };

  const usage = marmita ? marmitaUsage(marmita.id) : null;

  return (
    <Modal
      open
      onClose={onClose}
      title={label}
      subtitle={where}
      footer={
        mode ? (
          <>
            <button type="button" class="btn btn-secondary" onClick={() => setMode(null)}>
              Voltar
            </button>
            <button type="button" class="btn btn-primary" onClick={applyTargets}>
              <Check size={18} /> {mode === 'move' ? 'Transferir' : 'Duplicar'}
            </button>
          </>
        ) : (
          <>
            <button type="button" class="btn btn-danger-ghost keep" onClick={remove} aria-label="Excluir refeição">
              <Trash2 size={18} /> <span class="hide-mobile">Excluir</span>
            </button>
            <span class="spacer hide-mobile" />
            <button type="button" class={`btn ${entry.done ? 'btn-secondary' : 'btn-primary'}`} onClick={toggleDone}>
              {entry.done ? <Undo2 size={18} /> : <Check size={18} />} {entry.done ? 'Desfazer preparo' : 'Marcar preparada'}
            </button>
          </>
        )
      }
    >
      {mode ? (
        <div class="form-grid">
          <p class="small muted">
            {mode === 'move' ? 'Escolha o novo dia e refeição.' : 'Escolha os dias que devem receber uma cópia.'}
          </p>
          <div class="repeat-days" role="group" aria-label="Dias">
            {weekDates(weekId).map((d) => (
              <Chip
                key={d}
                pressed={targetDays.includes(d)}
                aria-label={weekdayName(d)}
                onClick={() =>
                  setTargetDays((list) =>
                    mode === 'move' ? [d] : list.includes(d) ? list.filter((x) => x !== d) : [...list, d],
                  )
                }
              >
                {weekdayShort(d)} {formatDayMonth(d).slice(0, 2)}
              </Chip>
            ))}
          </div>
          <Segmented
            options={MEAL_SLOTS.map((m) => ({ id: m.id, label: m.short }))}
            value={targetSlot}
            onChange={setTargetSlot}
            label="Refeição"
            block
          />
        </div>
      ) : (
        <div class="form-grid">
          <div class="entry-detail-meta">
            {entry.done && <span class="badge badge-green">Preparada</span>}
            {entry.stockConsumed && <span class="badge badge-outline">Estoque descontado</span>}
            {entry.kind === 'marmita' && <span class="badge badge-coral">Marmita</span>}
            {entry.kind === 'out' && <span class="badge badge-blue">Fora de casa</span>}
          </div>

          {recipe && (
            <>
              <div class="field">
                <span class="label">Porções desta refeição</span>
                <Stepper
                  value={entry.servings ?? recipe.servings}
                  min={1}
                  max={50}
                  unit="porções"
                  label="Porções"
                  onChange={(v) => updateMeal(weekId, date, slot, entryId, { servings: v })}
                />
                <span class="hint">Receita original: {recipe.servings} porções. A lista de compras é recalculada.</span>
              </div>
              <details class="disclosure">
                <summary>Ingredientes para {entry.servings ?? recipe.servings} porções</summary>
                <IngredientPreview recipe={recipe} servings={entry.servings ?? recipe.servings} />
              </details>
            </>
          )}

          {marmita && (
            <div class="notice info">
              <div>
                <strong>{s.recipes[marmita.recipeId]?.name}</strong> — lote de {marmita.portions} porções, preparo em{' '}
                {formatDayMonth(marmita.prepDate)} ({marmitaStatusLabel(marmita.status)}). {usage.used} porções distribuídas no cardápio.
              </div>
            </div>
          )}
          {marmita && (
            <div class="field">
              <span class="label">Porções desta refeição</span>
              <Stepper value={entry.servings ?? 1} min={1} max={50} unit="porções" label="Porções" onChange={(v) => updateMeal(weekId, date, slot, entryId, { servings: v })} />
            </div>
          )}

          {(entry.kind === 'out' || entry.kind === 'text') && (
            <label class="field">
              <span class="label">{entry.kind === 'out' ? 'Onde' : 'Refeição'}</span>
              <input
                class="input"
                value={text}
                maxLength={120}
                onInput={(e) => setText(e.currentTarget.value)}
                onBlur={() => text !== entry.text && updateMeal(weekId, date, slot, entryId, { text: text.trim() })}
              />
            </label>
          )}

          <label class="field">
            <span class="label">Observação</span>
            <input
              class="input"
              value={note}
              maxLength={200}
              placeholder="Ex.: sem pimenta, levar para o trabalho"
              onInput={(e) => setNote(e.currentTarget.value)}
              onBlur={() => note !== (entry.note ?? '') && updateMeal(weekId, date, slot, entryId, { note: note.trim() })}
            />
          </label>

          <div class="action-list" role="group" aria-label="Ações">
            <button type="button" onClick={() => onReplace()}>
              <RefreshCw size={20} /> Substituir por outra refeição
            </button>
            <button type="button" onClick={() => { setMode('duplicate'); setTargetDays([]); }}>
              <Copy size={20} /> Duplicar para outros dias
            </button>
            <button type="button" onClick={() => { setMode('move'); setTargetDays([]); }}>
              <ArrowRightLeft size={20} /> Transferir para outro dia
            </button>
            {recipe && (
              <button type="button" onClick={() => { onClose(); navigate(`/receitas/${recipe.id}`); }}>
                <BookOpen size={20} /> Ver receita completa
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
