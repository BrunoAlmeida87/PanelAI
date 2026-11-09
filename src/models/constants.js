// Vocabulário fixo do domínio. IDs são estáveis e usados na persistência;
// os rótulos podem mudar sem quebrar dados salvos.

export const MEAL_SLOTS = [
  { id: 'lanche_manha', label: 'Lanche da manhã', short: 'Manhã', snack: true },
  { id: 'almoco', label: 'Almoço', short: 'Almoço', snack: false },
  { id: 'lanche_tarde', label: 'Lanche da tarde', short: 'Tarde', snack: true },
  { id: 'jantar', label: 'Jantar', short: 'Jantar', snack: false },
];
export const MEAL_SLOT_IDS = MEAL_SLOTS.map((s) => s.id);
export const slotLabel = (id) => MEAL_SLOTS.find((s) => s.id === id)?.label ?? id;

export const ENTRY_KINDS = {
  recipe: 'Receita',
  marmita: 'Marmita',
  out: 'Fora de casa',
  text: 'Texto livre',
};

export const CATEGORIES = [
  { id: 'hortifruti', label: 'Hortifruti', color: '#7FA27A' },
  { id: 'acougue', label: 'Açougue', color: '#C98B80' },
  { id: 'peixaria', label: 'Peixaria', color: '#7E9DB4' },
  { id: 'frios', label: 'Frios e laticínios', color: '#D9B76E' },
  { id: 'padaria', label: 'Padaria', color: '#C5A07A' },
  { id: 'mercearia', label: 'Mercearia', color: '#A89B86' },
  { id: 'graos', label: 'Grãos', color: '#B59A6A' },
  { id: 'congelados', label: 'Congelados', color: '#8FB3C2' },
  { id: 'bebidas', label: 'Bebidas', color: '#9C8CB5' },
  { id: 'limpeza', label: 'Limpeza', color: '#7FAFA6' },
  { id: 'higiene', label: 'Higiene', color: '#B9A0B8' },
  { id: 'outros', label: 'Outros', color: '#A3A6A2' },
];
export const CATEGORY_IDS = CATEGORIES.map((c) => c.id);
export const categoryLabel = (id) => CATEGORIES.find((c) => c.id === id)?.label ?? 'Outros';
export const categoryColor = (id) => CATEGORIES.find((c) => c.id === id)?.color ?? '#A3A6A2';

export const SPEEDS = [
  { id: 'ultrarrapida', label: 'Ultrarrápida', max: 15 },
  { id: 'rapida', label: 'Rápida', max: 30 },
  { id: 'moderada', label: 'Moderada', max: 60 },
  { id: 'elaborada', label: 'Elaborada', max: Infinity },
];
export function speedOf(minutes) {
  const m = Number(minutes) || 0;
  return SPEEDS.find((s) => m <= s.max).id;
}
export const speedLabel = (id) => SPEEDS.find((s) => s.id === id)?.label ?? id;

export const PROTEINS = [
  { id: 'frango', label: 'Frango' },
  { id: 'bovina', label: 'Bovina' },
  { id: 'suina', label: 'Suína' },
  { id: 'peixe', label: 'Peixe' },
  { id: 'frutos-do-mar', label: 'Frutos do mar' },
  { id: 'ovos', label: 'Ovos' },
  { id: 'sem-carne', label: 'Sem carne' },
];
export const proteinLabel = (id) => PROTEINS.find((p) => p.id === id)?.label ?? id;

export const COMPOSITION = [
  { id: 'proteina', label: 'Proteína' },
  { id: 'vegetal', label: 'Vegetal' },
  { id: 'carboidrato', label: 'Carboidrato' },
  { id: 'leguminosa', label: 'Leguminosa' },
  { id: 'massa', label: 'Massa' },
];
export const compositionLabel = (id) => COMPOSITION.find((c) => c.id === id)?.label ?? id;

export const DIFFICULTIES = [
  { id: 'facil', label: 'Fácil' },
  { id: 'media', label: 'Média' },
  { id: 'dificil', label: 'Difícil' },
];
export const difficultyLabel = (id) => DIFFICULTIES.find((d) => d.id === id)?.label ?? id;

export const RESTRICTIONS = [
  { id: 'vegetariano', label: 'Vegetariano' },
  { id: 'vegano', label: 'Vegano' },
  { id: 'sem-gluten', label: 'Sem glúten' },
  { id: 'sem-lactose', label: 'Sem lactose' },
];
export const restrictionLabel = (id) => RESTRICTIONS.find((r) => r.id === id)?.label ?? id;

// Marcadores dietéticos dos ingredientes, usados para deduzir restrições.
export const DIET_FLAGS = ['carne', 'peixe', 'lactose', 'ovo', 'gluten', 'mel'];

export const MARMITA_STATUS = [
  { id: 'planejada', label: 'Planejada' },
  { id: 'preparada', label: 'Preparada' },
  { id: 'armazenada', label: 'Armazenada' },
  { id: 'consumida', label: 'Consumida' },
];
export const marmitaStatusLabel = (id) => MARMITA_STATUS.find((s) => s.id === id)?.label ?? id;

export const MOVEMENT_TYPES = {
  compra: 'Compra',
  consumo: 'Consumo',
  contagem: 'Contagem',
  ajuste: 'Ajuste manual',
};

export const DEFAULT_SETTINGS = {
  people: 2,
  // Dias da semana em que a família costuma ir ao mercado (0 = domingo).
  marketDays: [0, 3],
  // Se os lanches contam como pendência quando estão vazios.
  trackSnacks: false,
};
