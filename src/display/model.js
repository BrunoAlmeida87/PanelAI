// Layout do display e-ink: modelos de tela, tipos de card, layouts sugeridos
// e regras de posição na grade (funções puras).
//
// Um layout é uma grade (colunas × linhas) do tamanho exato da tela. Cada card
// ocupa um retângulo da grade: { x, y, w, h } em células.

import { uid } from '../utils/id.js';

export const DISPLAY_MODELS = [
  { id: '7in5', label: '7,5" — 800 × 480 (kit TRMNL DIY, Waveshare, reTerminal E1001)', w: 800, h: 480 },
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

// ---------- Letras (fontes) ----------
// Fontes embutidas no app (src/display/fonts.js): funcionam no gerador da imagem
// (GitHub) mesmo sem fontes instaladas no computador. Todas são variáveis (qualquer peso).
export const DISPLAY_FONTS = [
  { id: 'inter', label: 'Inter (padrão)', css: "'Inter Variable', Inter, sans-serif", min: 100, max: 900, hint: 'Clara e neutra.' },
  { id: 'atkinson', label: 'Atkinson Hyperlegible', css: "'Atkinson Hyperlegible Next Variable', sans-serif", min: 200, max: 800, hint: 'Feita para leitura fácil: letras parecidas (I, l, 1) bem diferentes.' },
  { id: 'lexend', label: 'Lexend', css: "'Lexend Variable', sans-serif", min: 100, max: 900, hint: 'Larga e espaçada: boa de longe, ocupa mais espaço.' },
  { id: 'roboto-condensed', label: 'Roboto Condensed', css: "'Roboto Condensed Variable', sans-serif", min: 100, max: 900, hint: 'Estreita: cabe mais texto por linha.' },
  { id: 'nunito', label: 'Nunito', css: "'Nunito Variable', sans-serif", min: 200, max: 1000, hint: 'Arredondada e amigável.' },
  { id: 'source-serif', label: 'Source Serif (com serifa)', css: "'Source Serif 4 Variable', serif", min: 200, max: 900, hint: 'Estilo de livro. Em tamanho pequeno, as serifas podem sumir.' },
];
export const displayFont = (id) => DISPLAY_FONTS.find((f) => f.id === id) ?? DISPLAY_FONTS[0];

export const FONT_WEIGHTS = [
  { id: 300, label: 'Leve' },
  { id: 400, label: 'Normal' },
  { id: 500, label: 'Médio' },
  { id: 600, label: 'Seminegrito' },
  { id: 700, label: 'Negrito' },
  { id: 800, label: 'Extranegrito' },
  { id: 900, label: 'Preto' },
];
export const TYPE_SIZES = [
  { id: 0.85, label: 'P' },
  { id: 1, label: 'M' },
  { id: 1.15, label: 'G' },
  { id: 1.3, label: 'GG' },
  { id: 1.5, label: 'XG' },
];
export const LETTER_SPACINGS = [
  { id: 'normal', label: 'Normal' },
  { id: 'open', label: 'Aberto' },
];
/** Espessura do traço na conversão para preto e branco (limiar de claridade do gerador da imagem). */
export const INK_LEVELS = [
  { id: 'thin', label: 'Mais finas', threshold: 115, hint: 'Negrito não embola, mas letras finas podem falhar.' },
  { id: 'normal', label: 'Normal', threshold: 150, hint: '' },
  { id: 'bold', label: 'Mais grossas', threshold: 185, hint: 'Letras finas aparecem melhor, mas negrito pequeno pode embolar.' },
];
export const inkThreshold = (id) => (INK_LEVELS.find((l) => l.id === id) ?? INK_LEVELS[1]).threshold;

/** Padrão = visual de antes desta opção existir (layouts antigos não mudam). */
export const DEFAULT_TYPOGRAPHY = {
  title: { font: 'inter', weight: 800, size: 1, upper: true, spacing: 'normal' },
  text: { font: 'inter', weight: 400, size: 1, spacing: 'normal' },
  ink: 'normal',
};

const pick = (list, v, fallback) => (list.some((x) => x.id === v) ? v : fallback);

/** Letras do layout com valores válidos (dados antigos ou incompletos viram o padrão). */
export function normalizeTypography(t) {
  const d = DEFAULT_TYPOGRAPHY;
  const title = t?.title ?? {};
  const text = t?.text ?? {};
  return {
    title: {
      font: pick(DISPLAY_FONTS, title.font, d.title.font),
      weight: pick(FONT_WEIGHTS, Number(title.weight), d.title.weight),
      size: pick(TYPE_SIZES, Number(title.size), d.title.size),
      upper: typeof title.upper === 'boolean' ? title.upper : d.title.upper,
      spacing: pick(LETTER_SPACINGS, title.spacing, d.title.spacing),
    },
    text: {
      font: pick(DISPLAY_FONTS, text.font, d.text.font),
      weight: pick(FONT_WEIGHTS, Number(text.weight), d.text.weight),
      size: pick(TYPE_SIZES, Number(text.size), d.text.size),
      spacing: pick(LETTER_SPACINGS, text.spacing, d.text.spacing),
    },
    ink: pick(INK_LEVELS, t?.ink, d.ink),
  };
}

const clampWeight = (font, w) => Math.max(font.min, Math.min(font.max, w));

/** Variáveis CSS que o DisplayRender aplica na tela. */
export function typographyVars(t) {
  const n = normalizeTypography(t);
  const tf = displayFont(n.title.font);
  const xf = displayFont(n.text.font);
  const textW = clampWeight(xf, n.text.weight);
  return {
    '--title-font': tf.css,
    '--title-weight': String(clampWeight(tf, n.title.weight)),
    // Rótulos (nome da refeição, dia da semana) um pouco mais fortes que o título, sem passar do máximo.
    '--label-weight': String(clampWeight(tf, Math.min(900, n.title.weight + 100))),
    '--title-size': String(n.title.size),
    '--title-case': n.title.upper ? 'uppercase' : 'none',
    '--title-spacing': n.title.spacing === 'open' ? (n.title.upper ? '0.12em' : '0.06em') : n.title.upper ? '0.06em' : '0.01em',
    '--text-font': xf.css,
    '--text-weight': String(textW),
    // Destaques do texto (comida, recado): +200 como antes (400 → 600).
    '--strong-weight': String(clampWeight(xf, Math.min(900, n.text.weight + 200))),
    '--text-size': String(n.text.size),
    '--text-spacing': n.text.spacing === 'open' ? '0.03em' : '0',
  };
}

/**
 * Menores letras que vão aparecer na tela (em pixels do aparelho) e avisos de
 * legibilidade para telas de 1 bit, onde não há meio-tom para suavizar as bordas.
 * `base` = tamanho base da tela (DisplayRender: menor lado ÷ 30, mín. 10 px).
 */
export function typographyCheck(layout) {
  const { w, h } = screenSize(layout);
  const base = Math.max(10, Math.round(Math.min(w, h) / 30));
  const n = normalizeTypography(layout.typography);
  const scales = (layout.cards ?? []).map((c) => Number(c.fontScale) || 1);
  const minScale = scales.length ? Math.min(...scales) : 1;
  const titlePx = Math.round(base * minScale * 0.72 * n.title.size * 10) / 10;
  // Partes menores do texto (responsável, data, quantidade) usam 0,8 do tamanho.
  const textPx = Math.round(base * minScale * 0.8 * n.text.size * 10) / 10;
  const warnings = [];
  const thick = n.ink === 'bold';
  if (n.title.weight >= 800 && titlePx < 11 + (thick ? 2 : 0))
    warnings.push(`Títulos com ${titlePx} px em ${FONT_WEIGHTS.find((x) => x.id === n.title.weight).label.toLowerCase()} podem embolar no aparelho. Use Negrito ou Seminegrito, aumente o tamanho ou deixe o espaço entre letras "Aberto".`);
  if (n.title.upper && n.title.spacing === 'normal' && n.title.weight >= 700 && titlePx < 10)
    warnings.push('Títulos em maiúsculas muito pequenos ficam colados: experimente o espaço entre letras "Aberto".');
  if (n.text.weight >= 600 && textPx < 11 + (thick ? 2 : 0))
    warnings.push(`O texto em negrito fica com partes de ${textPx} px: as letras podem se juntar. Use Normal ou Médio, ou aumente o tamanho.`);
  if (n.text.weight <= 300 && n.ink !== 'bold') warnings.push('Peso "Leve" tem traço fino: no preto e branco algumas partes das letras podem sumir. Prefira Normal ou "Mais grossas".');
  if (textPx < 9) warnings.push(`Há texto com ${textPx} px: pequeno demais para ler de longe numa tela de ${w} × ${h}.`);
  if (n.text.font === 'source-serif' && textPx < 12) warnings.push('Fonte com serifa em tamanho pequeno perde os detalhes no preto e branco.');
  return { base, titlePx, textPx, warnings };
}

export const BORDERS = [
  { id: 'line', label: 'Linha' },
  { id: 'thick', label: 'Grossa' },
  { id: 'none', label: 'Sem borda' },
];

const SLOT_CHOICES = [
  { id: 'lanche_manha', label: 'Café da manhã' },
  { id: 'almoco', label: 'Almoço' },
  { id: 'lanche_tarde', label: 'Lanche da tarde' },
  { id: 'jantar', label: 'Jantar' },
];
// Por quanto tempo uma tarefa feita continua na tela (marcada ✓) depois de ticada.
// 'day' = só no dia da tarefa (comportamento antigo). Primeira opção = padrão dos cards antigos.
export const DONE_FOR_CHOICES = [
  { id: '24', label: '24 horas depois de feita' },
  { id: '6', label: '6 horas depois de feita' },
  { id: '12', label: '12 horas depois de feita' },
  { id: '48', label: '2 dias depois de feita' },
  { id: '72', label: '3 dias depois de feita' },
  { id: 'day', label: 'Só no dia da tarefa' },
];
// Destaque dos nomes das refeições (Café da manhã, Jantar…). Primeira opção = padrão.
export const MEAL_LABEL_STYLES = [
  { id: 'underline', label: 'Negrito e sublinhado' },
  { id: 'band', label: 'Tarja preta (letra branca)' },
  { id: 'divider', label: 'Negrito com linha separando as refeições' },
  { id: 'plain', label: 'Discreto (como antes)' },
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
      { key: 'labelStyle', label: 'Destaque do nome da refeição', type: 'select', default: 'underline', choices: MEAL_LABEL_STYLES },
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
    id: 'weather',
    label: 'Clima',
    description: 'Tempo agora, chance de chuva nas próximas horas e previsão dos próximos dias.',
    size: { w: 6, h: 4 },
    options: [
      { key: 'place', label: 'Cidade', type: 'place', default: null },
      { key: 'showNow', label: 'Mostrar o tempo agora', type: 'toggle', default: true },
      { key: 'showRain', label: 'Aviso "vai chover?"', type: 'toggle', default: true },
      { key: 'hours', label: 'Próximas horas (chance de chuva; 0 = esconder)', type: 'number', default: 6, min: 0, max: 12 },
      {
        key: 'hourStep',
        label: 'De quanto em quanto tempo',
        type: 'select',
        default: '1',
        choices: [
          { id: '1', label: 'A cada 1 hora' },
          { id: '2', label: 'A cada 2 horas' },
          { id: '3', label: 'A cada 3 horas' },
        ],
      },
      { key: 'days', label: 'Dias de previsão (hoje + próximos; 0 = esconder)', type: 'number', default: 3, min: 0, max: 7 },
      { key: 'daysLayout', label: 'Disposição dos dias', type: 'select', default: 'rows', choices: [{ id: 'rows', label: 'Linhas (um dia por linha)' }, { id: 'columns', label: 'Colunas (dias lado a lado)' }] },
      { key: 'showDetails', label: 'Detalhes: umidade, vento, UV e sol', type: 'toggle', default: false },
    ],
  },
  {
    id: 'tasksDay',
    label: 'Tarefas do dia',
    description: 'Tarefas da casa de hoje ou de amanhã.',
    size: { w: 6, h: 4 },
    options: [
      { key: 'day', label: 'Dia', type: 'select', default: 'today', choices: DAY_CHOICES },
      { key: 'showDone', label: 'Mostrar feitas (marcadas ✓)', type: 'toggle', default: true },
      { key: 'doneFor', label: 'Feitas somem da tela', type: 'select', default: '24', choices: DONE_FOR_CHOICES },
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
      { key: 'showDone', label: 'Mostrar feitas (marcadas ✓)', type: 'toggle', default: false },
      { key: 'doneFor', label: 'Feitas somem da tela', type: 'select', default: '24', choices: DONE_FOR_CHOICES },
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
    description: 'O que falta comprar: da semana, de hoje ou de amanhã.',
    size: { w: 6, h: 3 },
    options: [
      { key: 'day', label: 'Mostrar', type: 'select', default: 'week', choices: [{ id: 'week', label: 'A semana toda' }, ...DAY_CHOICES.map((d) => ({ ...d, label: `Só ${d.label.toLowerCase()}` }))] },
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
    id: 'montessori',
    label: 'Montessori de hoje',
    description: 'Atividades do dia para a criança (aba Montessori), com as já feitas marcadas.',
    size: { w: 6, h: 3 },
    options: [
      { key: 'showChild', label: 'Mostrar nome e idade', type: 'toggle', default: true },
      { key: 'showCategory', label: 'Mostrar categoria', type: 'toggle', default: false },
      { key: 'showDone', label: 'Mostrar feitas', type: 'toggle', default: true },
    ],
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
    id: 'clima',
    name: 'Cozinha com clima',
    description: 'Previsão do tempo, cardápio de hoje e compras do dia.',
    base: { cols: 12, rows: 8 },
    cards: [
      c('clock', 0, 0, 12, 1),
      c('weather', 0, 1, 6, 7),
      c('menuDay', 6, 1, 6, 4),
      c('shopping', 6, 5, 6, 3, { options: { day: 'today', columns: 1 } }),
    ],
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
    id: 'familia',
    name: 'Família',
    description: 'Cardápio e tarefas de hoje, atividades Montessori da criança e compras.',
    base: { cols: 12, rows: 8 },
    cards: [c('clock', 0, 0, 12, 1), c('menuDay', 0, 1, 6, 4), c('montessori', 6, 1, 6, 4), c('tasksDay', 0, 5, 6, 3), c('shopping', 6, 5, 6, 3)],
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
    typography: structuredClone(DEFAULT_TYPOGRAPHY),
    grid,
    cards: presetCards(preset, grid),
    createdAt: now,
    createdBy: actor?.name ?? '',
    updatedAt: now,
    updatedBy: actor?.name ?? '',
  };
}
