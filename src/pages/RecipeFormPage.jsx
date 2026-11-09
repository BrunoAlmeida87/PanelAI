// Cadastro e edição de receitas.

import { useMemo, useRef, useState } from 'preact/hooks';
import { ArrowLeft, ImagePlus, Plus, Save, Trash2, X } from 'lucide-preact';
import { useStore } from '../storage/store.js';
import { saveRecipe, saveIngredient } from '../storage/actions.js';
import { CATEGORIES, COMPOSITION, DIFFICULTIES, PROTEINS } from '../models/constants.js';
import { emptyRecipe, validateRecipe } from '../models/recipe.js';
import { compatibleUnits, formatNumber, parseQty, UNITS, UNIT_IDS } from '../models/units.js';
import { normalizeText, uid } from '../utils/id.js';
import { navigate } from '../utils/router.js';
import { Chip, Modal, Segmented, toast, EmptyState } from '../components/ui.jsx';

function toFormLines(recipe, ingredients) {
  return recipe.ingredients.map((l) => ({
    key: uid('l'),
    name: ingredients[l.ingredientId]?.name ?? l.ingredientId,
    ingredientId: l.ingredientId,
    qty: l.qty == null ? '' : formatNumber(l.qty, 3),
    unit: l.unit,
    optional: !!l.optional,
    note: l.note ?? '',
  }));
}

/** Reduz a imagem enviada para no máximo 800 px e JPEG (economiza armazenamento local). */
function resizeImage(file, max = 800) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Imagem inválida'));
    };
    img.src = url;
  });
}

export function RecipeFormPage({ id }) {
  const s = useStore();
  const original = id ? s.recipes[id] : null;
  const base = original ?? emptyRecipe();
  const [r, setR] = useState(() => structuredClone(base));
  const [lines, setLines] = useState(() => toFormLines(base, s.ingredients));
  const [stepsText, setStepsText] = useState(base.steps.join('\n'));
  const [tagsText, setTagsText] = useState((base.tags ?? []).join(', '));
  const [errors, setErrors] = useState([]);
  const [newIngFor, setNewIngFor] = useState(null); // key da linha
  const errorsRef = useRef(null);

  const byName = useMemo(() => {
    const m = new Map();
    for (const ing of Object.values(s.ingredients)) m.set(normalizeText(ing.name), ing);
    return m;
  }, [s.ingredients]);
  const names = useMemo(() => Object.values(s.ingredients).map((i) => i.name).sort((a, b) => a.localeCompare(b, 'pt-BR')), [s.ingredients]);

  if (id && !original) {
    return (
      <div class="card">
        <EmptyState title="Receita não encontrada" action={<a class="btn btn-soft" href="#/receitas">Voltar</a>} />
      </div>
    );
  }

  const set = (patch) => setR((x) => ({ ...x, ...patch }));
  const setLine = (key, patch) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const resolveLine = (key, name) => {
    const ing = byName.get(normalizeText(name));
    setLines((ls) =>
      ls.map((l) => {
        if (l.key !== key) return l;
        if (!ing) return { ...l, name, ingredientId: '' };
        const units = compatibleUnits(ing);
        return { ...l, name: ing.name, ingredientId: ing.id, unit: units.includes(l.unit) || l.unit === 'a_gosto' ? l.unit : ing.baseUnit };
      }),
    );
  };

  const build = () => ({
    ...r,
    name: r.name.trim(),
    description: r.description.trim(),
    servings: Number(r.servings),
    time: Number(r.time),
    steps: stepsText
      .split('\n')
      .map((x) => x.trim())
      .filter(Boolean),
    tags: tagsText
      .split(',')
      .map((x) => x.trim())
      .filter(Boolean),
    ingredients: lines
      .filter((l) => l.name.trim() || l.ingredientId)
      .map((l) => ({
        ingredientId: l.ingredientId,
        qty: l.unit === 'a_gosto' ? null : parseQty(l.qty),
        unit: l.unit,
        ...(l.optional ? { optional: true } : {}),
        ...(l.note.trim() ? { note: l.note.trim() } : {}),
      })),
    advancePrep: (r.advancePrep ?? []).filter((p) => p.text.trim()),
  });

  const submit = (e) => {
    e.preventDefault();
    const candidate = build();
    const unresolved = lines.filter((l) => l.name.trim() && !l.ingredientId).map((l) => l.name.trim());
    const errs = [
      ...unresolved.map((n) => `"${n}" não está no catálogo: escolha um ingrediente da lista ou cadastre-o.`),
      ...validateRecipe({ ...candidate, id: candidate.id || 'novo' }, s.ingredients),
    ];
    const dupName = Object.values(s.recipes).find((x) => x.id !== candidate.id && normalizeText(x.name) === normalizeText(candidate.name));
    if (dupName) errs.push(`Já existe uma receita chamada "${dupName.name}".`);
    setErrors(errs);
    if (errs.length) {
      setTimeout(() => errorsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0);
      return;
    }
    const saved = saveRecipe(candidate);
    toast(original ? 'Receita atualizada' : 'Receita criada');
    navigate(`/receitas/${saved.id}`, { replace: true });
  };

  const onImage = async (e) => {
    const file = e.currentTarget.files?.[0];
    e.currentTarget.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast('Escolha um arquivo de imagem', { type: 'error' });
    try {
      set({ image: await resizeImage(file) });
    } catch {
      toast('Não foi possível ler a imagem', { type: 'error' });
    }
  };

  return (
    <form onSubmit={submit} noValidate>
      <div class="toolbar" style="margin-bottom:12px">
        <a class="btn btn-ghost" href={original ? `#/receitas/${original.id}` : '#/receitas'} style="padding-left:6px">
          <ArrowLeft size={18} /> {original ? 'Receita' : 'Receitas'}
        </a>
      </div>
      <div class="page-head">
        <div class="grow">
          <h1>{original ? 'Editar receita' : 'Nova receita'}</h1>
          <p class="sub">Ingredientes estruturados permitem calcular a lista de compras automaticamente.</p>
        </div>
      </div>

      {errors.length > 0 && (
        <div class="notice" role="alert" ref={errorsRef} style="margin-bottom:16px;background:var(--danger-light);color:var(--danger)">
          <ul style="margin:0;padding-left:18px">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <section class="card card-pad form-section" aria-labelledby="f-basic">
        <h2 id="f-basic" class="section-title" style="margin:0">Informações</h2>
        <div class="form-grid cols-2">
          <label class="field span-all">
            <span class="label">Nome *</span>
            <input class="input" required value={r.name} maxLength={120} onInput={(e) => set({ name: e.currentTarget.value })} placeholder="Ex.: Frango ao curry" />
          </label>
          <label class="field span-all">
            <span class="label">Descrição</span>
            <input class="input" value={r.description} maxLength={240} onInput={(e) => set({ description: e.currentTarget.value })} />
          </label>
          <div class="field span-all">
            <span class="label">Categoria</span>
            <Segmented
              options={[
                { id: 'prato', label: 'Prato' },
                { id: 'lanche', label: 'Lanche' },
              ]}
              value={r.category}
              onChange={(v) => set({ category: v })}
              label="Categoria"
            />
          </div>
          <label class="field">
            <span class="label">Rende (porções) *</span>
            <input class="input" type="number" inputMode="numeric" min="1" max="100" value={r.servings} onInput={(e) => set({ servings: e.currentTarget.value })} />
          </label>
          <label class="field">
            <span class="label">Tempo de preparo (min) *</span>
            <input class="input" type="number" inputMode="numeric" min="0" max="1440" value={r.time} onInput={(e) => set({ time: e.currentTarget.value })} />
          </label>
          <label class="field">
            <span class="label">Dificuldade</span>
            <select class="select" value={r.difficulty} onChange={(e) => set({ difficulty: e.currentTarget.value })}>
              {DIFFICULTIES.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </label>
          <label class="field">
            <span class="label">Proteína principal</span>
            <select class="select" value={r.protein} onChange={(e) => set({ protein: e.currentTarget.value })}>
              {PROTEINS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </label>
          <div class="field span-all">
            <span class="label">Composição</span>
            <div class="chip-row">
              {COMPOSITION.map((c) => (
                <Chip
                  key={c.id}
                  pressed={r.composition.includes(c.id)}
                  onClick={() => set({ composition: r.composition.includes(c.id) ? r.composition.filter((x) => x !== c.id) : [...r.composition, c.id] })}
                >
                  {c.label}
                </Chip>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section class="card card-pad form-section" aria-labelledby="f-ing">
        <h2 id="f-ing" class="section-title" style="margin:0">Ingredientes *</h2>
        <datalist id="ingredient-names">
          {names.map((n) => (
            <option key={n} value={n} />
          ))}
        </datalist>
        <div class="ing-rows">
          {lines.map((l, idx) => {
            const ing = s.ingredients[l.ingredientId];
            const units = ing ? [...compatibleUnits(ing), 'a_gosto'] : UNIT_IDS;
            const unresolved = l.name.trim() && !l.ingredientId;
            return (
              <div class="ing-row" key={l.key}>
                <div class="field ir-name">
                  <input
                    class="input"
                    list="ingredient-names"
                    value={l.name}
                    placeholder="Ingrediente"
                    aria-label={`Ingrediente ${idx + 1}`}
                    aria-invalid={unresolved ? 'true' : 'false'}
                    onInput={(e) => setLine(l.key, { name: e.currentTarget.value, ingredientId: '' })}
                    onChange={(e) => resolveLine(l.key, e.currentTarget.value)}
                    onBlur={(e) => resolveLine(l.key, e.currentTarget.value)}
                  />
                  {unresolved && (
                    <button type="button" class="btn btn-ghost btn-sm" style="justify-self:start;color:var(--green-dark)" onClick={() => setNewIngFor(l.key)}>
                      <Plus size={14} /> Cadastrar "{l.name.trim()}"
                    </button>
                  )}
                </div>
                <div class="ir-qty-unit">
                  <input
                    class="input"
                    inputMode="decimal"
                    value={l.unit === 'a_gosto' ? '' : l.qty}
                    disabled={l.unit === 'a_gosto'}
                    placeholder="Qtd."
                    aria-label={`Quantidade do ingrediente ${idx + 1}`}
                    onInput={(e) => setLine(l.key, { qty: e.currentTarget.value })}
                  />
                  <select class="select" value={l.unit} aria-label={`Unidade do ingrediente ${idx + 1}`} onChange={(e) => setLine(l.key, { unit: e.currentTarget.value })}>
                    {units.map((u) => (
                      <option key={u} value={u}>{UNITS[u].name}</option>
                    ))}
                  </select>
                </div>
                <button type="button" class="icon-btn ir-del" aria-label={`Remover ingrediente ${idx + 1}`} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))}>
                  <Trash2 size={16} />
                </button>
                <div class="opt">
                  <label class="switch" style="min-height:32px">
                    <input type="checkbox" checked={l.optional} onChange={(e) => setLine(l.key, { optional: e.currentTarget.checked })} />
                    opcional
                  </label>
                  <input class="input" style="min-height:34px;padding:4px 10px;font-size:var(--fs-sm)" value={l.note} maxLength={60} placeholder="nota (ex.: picado)" aria-label={`Nota do ingrediente ${idx + 1}`} onInput={(e) => setLine(l.key, { note: e.currentTarget.value })} />
                </div>
              </div>
            );
          })}
        </div>
        <button
          type="button"
          class="btn btn-soft"
          style="justify-self:start"
          onClick={() => setLines((ls) => [...ls, { key: uid('l'), name: '', ingredientId: '', qty: '', unit: 'g', optional: false, note: '' }])}
        >
          <Plus size={16} /> Adicionar ingrediente
        </button>
      </section>

      <section class="card card-pad form-section" aria-labelledby="f-steps">
        <h2 id="f-steps" class="section-title" style="margin:0">Modo de preparo</h2>
        <label class="field">
          <span class="label">Um passo por linha</span>
          <textarea class="textarea" rows={6} value={stepsText} onInput={(e) => setStepsText(e.currentTarget.value)} />
        </label>
        <label class="field">
          <span class="label">Observações</span>
          <textarea class="textarea" rows={3} value={r.notes} maxLength={2000} onInput={(e) => set({ notes: e.currentTarget.value })} />
        </label>
        <label class="field">
          <span class="label">Etiquetas</span>
          <input class="input" value={tagsText} placeholder="separadas por vírgula: rápido, festa" onInput={(e) => setTagsText(e.currentTarget.value)} />
        </label>
      </section>

      <section class="card card-pad form-section" aria-labelledby="f-plan">
        <h2 id="f-plan" class="section-title" style="margin:0">Planejamento</h2>
        <label class="switch">
          <input type="checkbox" checked={r.marmita} onChange={(e) => set({ marmita: e.currentTarget.checked })} />
          Boa para marmita
        </label>
        <label class="switch">
          <input type="checkbox" checked={r.freezing.freezable} onChange={(e) => set({ freezing: { ...r.freezing, freezable: e.currentTarget.checked } })} />
          Pode ser congelada
        </label>
        {r.freezing.freezable && (
          <div class="form-grid cols-2">
            <label class="field">
              <span class="label">Validade no freezer (dias)</span>
              <input class="input" type="number" min="1" max="365" value={r.freezing.days} onInput={(e) => set({ freezing: { ...r.freezing, days: Number(e.currentTarget.value) } })} />
            </label>
            <label class="field">
              <span class="label">Como congelar</span>
              <input class="input" value={r.freezing.notes} maxLength={200} onInput={(e) => set({ freezing: { ...r.freezing, notes: e.currentTarget.value } })} />
            </label>
          </div>
        )}
        <div class="field">
          <span class="label">Preparo antecipado</span>
          <span class="hint">Viram tarefas no cardápio (ex.: descongelar na véspera).</span>
          {(r.advancePrep ?? []).map((p, i) => (
            <div class="input-group" key={i}>
              <input
                class="input"
                value={p.text}
                maxLength={120}
                placeholder="Ex.: Descongelar o frango"
                aria-label={`Tarefa ${i + 1}`}
                onInput={(e) => set({ advancePrep: r.advancePrep.map((x, j) => (j === i ? { ...x, text: e.currentTarget.value } : x)) })}
              />
              <select
                class="select"
                style="width:auto"
                value={p.daysBefore}
                aria-label={`Quando fazer a tarefa ${i + 1}`}
                onChange={(e) => set({ advancePrep: r.advancePrep.map((x, j) => (j === i ? { ...x, daysBefore: Number(e.currentTarget.value) } : x)) })}
              >
                <option value={0}>no dia</option>
                <option value={1}>1 dia antes</option>
                <option value={2}>2 dias antes</option>
                <option value={3}>3 dias antes</option>
              </select>
              <button type="button" class="icon-btn" aria-label={`Remover tarefa ${i + 1}`} onClick={() => set({ advancePrep: r.advancePrep.filter((_, j) => j !== i) })}>
                <X size={16} />
              </button>
            </div>
          ))}
          <button type="button" class="btn btn-ghost btn-sm" style="justify-self:start" onClick={() => set({ advancePrep: [...(r.advancePrep ?? []), { text: '', daysBefore: 1 }] })}>
            <Plus size={14} /> Adicionar tarefa
          </button>
        </div>
        <div class="field">
          <span class="label">Imagem (opcional)</span>
          <div class="input-group" style="flex-wrap:wrap">
            {r.image && <img class="image-preview" src={r.image} alt="Prévia da imagem da receita" />}
            <label class="btn btn-secondary">
              <ImagePlus size={16} /> {r.image ? 'Trocar' : 'Escolher imagem'}
              <input type="file" accept="image/*" class="sr-only" onChange={onImage} />
            </label>
            {r.image && (
              <button type="button" class="btn btn-ghost" onClick={() => set({ image: null })}>
                Remover
              </button>
            )}
          </div>
        </div>
      </section>

      <div class="sticky-actions">
        <span class="small muted" style="flex:1">{lines.length} ingredientes</span>
        <a class="btn btn-ghost" href={original ? `#/receitas/${original.id}` : '#/receitas'}>Cancelar</a>
        <button type="submit" class="btn btn-primary">
          <Save size={16} /> Salvar receita
        </button>
      </div>

      {newIngFor && (
        <NewIngredientModal
          name={lines.find((l) => l.key === newIngFor)?.name.trim() ?? ''}
          onClose={() => setNewIngFor(null)}
          onCreated={(ing) => {
            setLine(newIngFor, { name: ing.name, ingredientId: ing.id, unit: ing.baseUnit });
            setNewIngFor(null);
          }}
        />
      )}
    </form>
  );
}

function NewIngredientModal({ name: initial, onClose, onCreated }) {
  const [name, setName] = useState(initial);
  const [category, setCategory] = useState('mercearia');
  const [baseUnit, setBaseUnit] = useState('g');
  const [unitWeight, setUnitWeight] = useState('');
  const create = () => {
    if (!name.trim()) return toast('Informe o nome', { type: 'error' });
    const uw = parseQty(unitWeight);
    const ing = saveIngredient({ name: name.trim(), category, baseUnit, ...(uw ? { unitWeight: uw } : {}) });
    toast(`${ing.name} cadastrado no catálogo`);
    onCreated(ing);
  };
  return (
    <Modal
      open
      size="sm"
      onClose={onClose}
      title="Novo ingrediente"
      footer={
        <>
          <button type="button" class="btn btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" class="btn btn-primary" onClick={create}>Cadastrar</button>
        </>
      }
    >
      <div class="form-grid">
        <label class="field">
          <span class="label">Nome</span>
          <input class="input" value={name} maxLength={80} onInput={(e) => setName(e.currentTarget.value)} />
        </label>
        <label class="field">
          <span class="label">Categoria (na lista de compras)</span>
          <select class="select" value={category} onChange={(e) => setCategory(e.currentTarget.value)}>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>{c.label}</option>
            ))}
          </select>
        </label>
        <label class="field">
          <span class="label">Medido principalmente em</span>
          <select class="select" value={baseUnit} onChange={(e) => setBaseUnit(e.currentTarget.value)}>
            {['g', 'ml', 'un', 'maco', 'fatia', 'lata', 'pacote'].map((u) => (
              <option key={u} value={u}>{UNITS[u].name}</option>
            ))}
          </select>
          <span class="hint">É a unidade usada para somar quantidades e comparar com o estoque.</span>
        </label>
        {(baseUnit === 'un' || baseUnit === 'g') && (
          <label class="field">
            <span class="label">Peso de 1 unidade em gramas (opcional)</span>
            <input class="input" inputMode="decimal" value={unitWeight} onInput={(e) => setUnitWeight(e.currentTarget.value)} placeholder="Ex.: 150" />
            <span class="hint">Permite converter entre unidades e gramas com segurança.</span>
          </label>
        )}
      </div>
    </Modal>
  );
}
