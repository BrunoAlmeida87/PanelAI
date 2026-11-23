// Layout do display e-ink: modelos de tela, tipos de card, layouts sugeridos
// e regras de posição na grade (funções puras).
//
// Um layout é uma grade (colunas × linhas) do tamanho exato da tela. Cada card
// ocupa um retângulo da grade: { x, y, w, h } em células.

import { uid } from '../utils/id.js';

export const DISPLAY_MODELS = [
  { id: '7in5', label: '7,5" — 800 × 480 (reTerminal E1001, Waveshare, TRMNL)', w: 800, h: 480 },
  { id: '7in5hd', label: '7,5" HD — 880 × 528', w: 880, h: 528 },
  { id: '6in', label: '6" — 800 × 600 (Inkplate 6, Kindle antigo)', w: 800, h: 600 },
  { id: '9in7', label: '9,7" — 1200 × 825 (Inkplate 10)', w: 1200, h: 825 },
  { id: '10in3', label: '10,3" — 1872 × 1404 (Waveshare, IT8951)', w: 1872, h: 1404 },
  { id: '13in3', label: '13,3" — 1600 × 1200', w: 1600, h: 1200 },
  { id: 'kindle', label: 'Kindle Paperwhite — 1448 × 1072', w: 1448, h: 1072 },
  { id: 'custom', label: 'Personalizado', w: 800, h: 480 },
];

export const COLOR_MODES = [
  { id: 'bw', label: 'Preto e branco', accent: '#000000', soft: '#ffffff' },
  { id: 'gray', label: 'Tons de cinza', accent: '#000000', soft: '#d9d9d9' },
  { id: 'bwr', label: 'Preto, branco e vermelho', accent: '#c4161c', soft: '#ffffff' },
  { id: 'bwy', label: 'Preto, branco e amarelo', accent: '#d9a300', soft: '#ffffff' },
  { id: 'color', label: 'Colorido (Spectra / 7 cores)', accent: '#1f6f3b', soft: '#eef6ef' },
];
export const colorMode = (id) => COLOR_MODES.find((c) => c.id === id) ?? COLOR_MODES[0];

export const FONT_SCALES = [
  { id: 0.75, label: 'P' },
  { id: 1, label: 'M' },
  { id: 1.3, label: 'G' },
  { id: 1.7, label: 'GG' },
  { id: 2.3, label: 'XG' },
];

export const BORDERS = [
  { id: 'line', label: 'Linha' },
  { id: 'thick', label: 'Grossa' },
  { id: 'none', label: 'Sem borda' },
];

const SLOT_CHOICES = [
  { id: 'lanche_manha', label: 'Lanche da manhã' },
  { id: 'almoco', label: 'Almoço' },
  { id: 'lanche_tarde', label: 'Lanche da tarde' },
  { id: 'jantar', label: 'Jantar' },
];
const DAY_CHOICES = [
  { id: 'today', label: 'Hoje' },
  { id: 'tomorrow', label: 'Amanhã' },
];

/**
 * Tipos de card. `options` descreve os campos do painel de propriedades:
 * toggle | select | multi | number | text | textarea.
 */
export const CARD_TYPES = [
  {
    id: 'clock',
    label: 'Data e hora',
    description: 'Dia da semana, data e horário da última atualização.',
    size: { w: 12, h: 1 },
    options: [
      { key: 'showTime', label: 'Mostrar horário', type: 'toggle', default: true },
      { key: 'showWeek', label: 'Mostrar semana', type: 'toggle', default: false },
      { key: 'style', label: 'Formato', type: 'select', default: 'long', choices: [{ id: 'long', label: 'Segunda, 16 de novembro' }, { id: 'short', label: 'Seg 16/11' }] },
    ],
  },
  {
    id: 'menuDay',
    label: 'Cardápio do dia',
    description: 'Refeições de hoje ou de amanhã.',
    size: { w: 6, h: 4 },
    options: [
      { key: 'day', label: 'Dia', type: 'select', default: 'today', choices: DAY_CHOICES },
      { key: 'slots', label: 'Refeições', type: 'multi', default: ['lanche_manha', 'almoco', 'lanche_tarde', 'jantar'], choices: SLOT_CHOICES },
      { key: 'showServings', label: 'Mostrar porções', type: 'toggle', default: false },
      { key: 'hideEmpty', label: 'Esconder refeições vazias', type: 'toggle', default: true },
    ],
  },
  {
    id: 'menuWeek',
    label: 'Cardápio da semana',
    description: 'Grade com os próximos dias.',
    size: { w: 12, h: 4 },
    options: [
      { key: 'start', label: 'Começar em', type: 'select', default: 'today', choices: [{ id: 'today', label: 'Hoje' }, { id: 'monday', label: 'Segunda-feira' }] },
      { key: 'days', label: 'Quantidade de dias', type: 'number', default: 7, min: 2, max: 7 },
      { key: 'slots', label: 'Refeições', type: 'multi', default: ['almoco', 'jantar'], choices: SLOT_CHOICES },
      { key: 'layout', label: 'Disposição', type: 'select', default: 'columns', choices: [{ id: 'columns', label: 'Colunas (dias lado a lado)' }, { id: 'rows', label: 'Linhas (um dia por linha)' }] },
    ],
  },
  {
    id: 'tasksDay',
    label: 'Tarefas do dia',
    description: 'Tarefas da casa de hoje ou de amanhã.',
    size: { w: 6, h: 4 },
    options: [
      { key: 'day', label: 'Dia', type: 'select', default: 'today', choices: DAY_CHOICES },
      { key: 'showDone', label: 'Mostrar feitas', type: 'toggle', default: true },
      { key: 'showAssignee', label: 'Mostrar responsável', type: 'toggle', default: true },
      { key: 'showOverdue', label: 'Incluir atrasadas', type: 'toggle', default: true },
      { key: 'max', label: 'Máximo de itens', type: 'number', default: 12, min: 1, max: 40 },
    ],
  },
  {
    id: 'tasksWeek',
    label: 'Tarefas da semana',
    description: 'Tarefas agrupadas por dia.',
    size: { w: 12, h: 3 },
    options: [
      { key: 'showDone', label: 'Mostrar feitas', type: 'toggle', default: false },
      { key: 'showAssignee', label: 'Mostrar responsável', type: 'toggle', default: false },
      { key: 'layout', label: 'Disposição', type: 'select', default: 'columns', choices: [{ id: 'columns', label: 'Colunas' }, { id: 'rows', label: 'Linhas' }] },
      { key: 'maxPerDay', label: 'Máximo por dia', type: 'number', default: 5, min: 1, max: 20 },
    ],
  },
  {
    id: 'pending',
    label: 'Pendências e atrasadas',
    description: 'Tarefas com pendência (e o recado) ou que passaram da data.',
    size: { w: 6, h: 3 },
    options: [
      { key: 'showNote', label: 'Mostrar recado', type: 'toggle', default: true },
      { key: 'max', label: 'Máximo de itens', type: 'number', default: 8, min: 1, max: 30 },
    ],
  },
  {
    id: 'shopping',
    label: 'Lista de compras',
    description: 'O que falta comprar na semana.',
    size: { w: 6, h: 3 },
    options: [
      { key: 'showQty', label: 'Mostrar quantidade', type: 'toggle', default: true },
      { key: 'showChecked', label: 'Mostrar já comprados', type: 'toggle', default: false },
      { key: 'columns', label: 'Colunas de texto', type: 'number', default: 2, min: 1, max: 4 },
      { key: 'max', label: 'Máximo de itens', type: 'number', default: 30, min: 1, max: 80 },
    ],
  },
  {
    id: 'pantryLow',
    label: 'Despensa: repor',
    description: 'Produtos abaixo do mínimo ou zerados.',
    size: { w: 4, h: 3 },
    options: [
      { key: 'max', label: 'Máximo de itens', type: 'number', default: 10, min: 1, max: 40 },
      { key: 'showQty', label: 'Mostrar estoque', type: 'toggle', default: true },
    ],
  },
  {
    id: 'marmitas',
    label: 'Marmitas',
    description: 'Lotes planejados, prontos e na geladeira/freezer.',
    size: { w: 4, h: 3 },
    options: [{ key: 'showPlanned', label: 'Incluir planejadas', type: 'toggle', default: true }],
  },
  {
    id: 'prep',
    label: 'Preparos do cardápio',
    description: 'O que adiantar hoje para as próximas refeições.',
    size: { w: 6, h: 2 },
    options: [{ key: 'day', label: 'Dia', type: 'select', default: 'today', choices: DAY_CHOICES }],
  },
  {
    id: 'summary',
    label: 'Resumo da semana',
    description: 'Números da semana: tarefas feitas, refeições planejadas, itens a comprar.',
    size: { w: 4, h: 2 },
    options: [],
  },
  {
    id: 'note',
    label: 'Recado',
    description: 'Texto livre fixo (aviso, lembrete, frase do dia).',
    size: { w: 6, h: 2 },
    options: [
      { key: 'text', label: 'Texto', type: 'textarea', default: 'Bom dia! ☀' },
      { key: 'align', label: 'Alinhamento', type: 'select', default: 'center', choices: [{ id: 'left', label: 'Esquerda' }, { id: 'center', label: 'Centro' }] },
    ],
  },
];
export const cardType = (id) => CARD_TYPES.find((t) => t.id === id);

export function defaultOptions(type) {
  return Object.fromEntries((cardType(type)?.options ?? []).map((o) => [o.key, structuredClone(o.default)]));
}

export function newCard(type, rect = {}) {
  const t = cardType(type);
  return {
    id: uid('card'),
    type,
    x: rect.x ?? 0,
    y: rect.y ?? 0,
    w: rect.w ?? t.size.w,
    h: rect.h ?? t.size.h,
    title: '',
    showTitle: type !== 'clock' && type !== 'note',
    fontScale: 1,
    border: 'line',
    invert: false,
    options: defaultOptions(type),
  };
}

// ---------- Grade ----------

export function clampCard(card, grid) {
  const w = Math.max(1, Math.min(grid.cols, Math.round(card.w)));
  const h = Math.max(1, Math.min(grid.rows, Math.round(card.h)));
  const x = Math.max(0, Math.min(grid.cols - w, Math.round(card.x)));
  const y = Math.max(0, Math.min(grid.rows - h, Math.round(card.y)));
  return { ...card, x, y, w, h };
}

export const overlaps = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

/** Ids dos cards que se sobrepõem a algum outro. */
export function overlappingIds(cards) {
  const out = new Set();
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      if (overlaps(cards[i], cards[j])) {
        out.add(cards[i].id);
        out.add(cards[j].id);
      }
    }
  }
  return out;
}

/** Primeiro espaço livre para um card w×h (ou null). */
export function findFreeSpot(cards, grid, w, h) {
  for (let y = 0; y + h <= grid.rows; y++) {
    for (let x = 0; x + w <= grid.cols; x++) {
      const r = { x, y, w, h };
      if (!cards.some((c) => overlaps(c, r))) return r;
    }
  }
  return null;
}

/** Posiciona um card novo: tamanho padrão; se não couber, procura menor. */
export function placeNewCard(cards, grid, type) {
  const t = cardType(type);
  const sizes = [
    [Math.min(t.size.w, grid.cols), Math.min(t.size.h, grid.rows)],
    [Math.min(4, grid.cols), Math.min(2, grid.rows)],
    [Math.min(2, grid.cols), 1],
  ];
  for (const [w, h] of sizes) {
    const spot = findFreeSpot(cards, grid, w, h);
    if (spot) return newCard(type, spot);
  }
  return newCard(type, { x: 0, y: 0, w: sizes[0][0], h: sizes[0][1] });
}

/** Converte cards de uma grade para outra, mantendo as proporções. */
export function rescaleCards(cards, from, to) {
  const sx = to.cols / from.cols;
  const sy = to.rows / from.rows;
  return cards.map((c) => {
    const x = Math.round(c.x * sx);
    const y = Math.round(c.y * sy);
    const w = Math.max(1, Math.round((c.x + c.w) * sx) - x);
    const h = Math.max(1, Math.round((c.y + c.h) * sy) - y);
    return clampCard({ ...c, x, y, w, h }, to);
  });
}

// ---------- Layouts ----------

export function screenSize(layout) {
  const { w, h } = layout.screen;
  return layout.orientation === 'portrait' ? { w: Math.min(w, h), h: Math.max(w, h) } : { w: Math.max(w, h), h: Math.min(w, h) };
}

export const defaultGrid = (orientation) => (orientation === 'portrait' ? { cols: 8, rows: 12, gap: 8, padding: 12 } : { cols: 12, rows: 8, gap: 8, padding: 12 });

/**
 * Layouts sugeridos. Cada um é desenhado numa grade base e convertido para a
 * grade do layout atual.
 */
const c = (type, x, y, w, h, extra = {}) => ({ type, x, y, w, h, ...extra });
export const LAYOUT_PRESETS = [
  {
    id: 'cozinha',
    name: 'Cozinha',
    description: 'Cardápio e tarefas de hoje, lista de compras e pendências.',
    base: { cols: 12, rows: 8 },
    cards: [c('clock', 0, 0, 12, 1), c('menuDay', 0, 1, 6, 4), c('tasksDay', 6, 1, 6, 4), c('shopping', 0, 5, 6, 3), c('pending', 6, 5, 6, 3)],
  },
  {
    id: 'semana',
    name: 'Semana',
    description: 'Cardápio da semana inteira e tarefas por dia.',
    base: { cols: 12, rows: 8 },
    cards: [c('clock', 0, 0, 12, 1), c('menuWeek', 0, 1, 12, 4), c('tasksWeek', 0, 5, 12, 3)],
  },
  {
    id: 'tarefas',
    name: 'Tarefas',
    description: 'Foco nas tarefas: hoje, semana e pendências.',
    base: { cols: 12, rows: 8 },
    cards: [c('clock', 0, 0, 12, 1), c('tasksDay', 0, 1, 5, 7, { fontScale: 1.3 }), c('tasksWeek', 5, 1, 7, 4), c('pending', 5, 5, 7, 3)],
  },
  {
    id: 'mercado',
    name: 'Mercado',
    description: 'Lista de compras grande, despensa e marmitas.',
    base: { cols: 12, rows: 8 },
    cards: [c('clock', 0, 0, 12, 1), c('shopping', 0, 1, 7, 7), c('pantryLow', 7, 1, 5, 4), c('marmitas', 7, 5, 5, 3)],
  },
  {
    id: 'minimalista',
    name: 'Minimalista',
    description: 'Letras grandes: data, refeições de hoje e um recado.',
    base: { cols: 12, rows: 8 },
    cards: [c('clock', 0, 0, 12, 2, { fontScale: 1.7 }), c('menuDay', 0, 2, 12, 4, { fontScale: 1.3, showTitle: false }), c('note', 0, 6, 12, 2)],
  },
  {
    id: 'geladeira',
    name: 'Porta da geladeira (retrato)',
    description: 'Para tela em pé: hoje, amanhã e compras.',
    base: { cols: 8, rows: 12 },
    orientation: 'portrait',
    cards: [
      c('clock', 0, 0, 8, 1),
      c('menuDay', 0, 1, 8, 3),
      c('tasksDay', 0, 4, 8, 4),
      c('menuDay', 0, 8, 4, 4, { title: 'Amanhã', options: { day: 'tomorrow' } }),
      c('shopping', 4, 8, 4, 4, { options: { columns: 1 } }),
    ],
  },
];

/** Cards de um layout sugerido, na grade informada. */
export function presetCards(preset, grid) {
  const cards = preset.cards.map((p) => {
    const card = newCard(p.type, p);
    return {
      ...card,
      ...(p.fontScale ? { fontScale: p.fontScale } : {}),
      ...(p.showTitle !== undefined ? { showTitle: p.showTitle } : {}),
      ...(p.title ? { title: p.title } : {}),
      options: { ...card.options, ...(p.options ?? {}) },
    };
  });
  return rescaleCards(cards, preset.base, grid);
}

export function newLayout({ name = 'Meu display', modelId = '7in5', orientation = 'landscape', presetId = 'cozinha' } = {}, actor) {
  const model = DISPLAY_MODELS.find((m) => m.id === modelId) ?? DISPLAY_MODELS[0];
  const preset = LAYOUT_PRESETS.find((p) => p.id === presetId) ?? LAYOUT_PRESETS[0];
  const orient = preset.orientation ?? orientation;
  const grid = defaultGrid(orient);
  const now = new Date().toISOString();
  return {
    id: uid('display'),
    name,
    modelId: model.id,
    screen: { w: model.w, h: model.h },
    orientation: orient,
    colorMode: 'bw',
    grid,
    cards: presetCards(preset, grid),
    createdAt: now,
    createdBy: actor?.name ?? '',
    updatedAt: now,
    updatedBy: actor?.name ?? '',
  };
}
