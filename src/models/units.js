// Unidades de medida e conversões.
//
// Regras:
// - Unidades da mesma dimensão (massa, volume, contagem) sempre convertem entre si.
// - Entre dimensões diferentes só convertemos com dados do ingrediente:
//   `density` (g por ml), `unitWeight` (g por unidade) ou `conversions`
//   (quanto da unidade-base do ingrediente cabe em 1 unidade especial, ex.: 1 dente = 5 g).
// - Sem informação confiável, a conversão retorna null e as quantidades ficam separadas.

export const UNITS = {
  g: { label: 'g', name: 'gramas', dim: 'mass', factor: 1 },
  kg: { label: 'kg', name: 'quilos', dim: 'mass', factor: 1000 },
  ml: { label: 'ml', name: 'mililitros', dim: 'volume', factor: 1 },
  l: { label: 'L', name: 'litros', dim: 'volume', factor: 1000 },
  xicara: { label: 'xíc.', name: 'xícaras', dim: 'volume', factor: 240 },
  colher_sopa: { label: 'c. sopa', name: 'colheres de sopa', dim: 'volume', factor: 15 },
  colher_cha: { label: 'c. chá', name: 'colheres de chá', dim: 'volume', factor: 5 },
  un: { label: 'un', name: 'unidades', dim: 'count', factor: 1 },
  // Unidades especiais: só convertem via `conversions` do ingrediente.
  dente: { label: 'dente(s)', name: 'dentes', dim: 'dente', factor: 1 },
  fatia: { label: 'fatia(s)', name: 'fatias', dim: 'fatia', factor: 1 },
  maco: { label: 'maço(s)', name: 'maços', dim: 'maco', factor: 1 },
  lata: { label: 'lata(s)', name: 'latas', dim: 'lata', factor: 1 },
  pacote: { label: 'pct', name: 'pacotes', dim: 'pacote', factor: 1 },
  caixa: { label: 'cx', name: 'caixas', dim: 'caixa', factor: 1 },
  rolo: { label: 'rolo(s)', name: 'rolos', dim: 'rolo', factor: 1 },
  a_gosto: { label: 'a gosto', name: 'a gosto', dim: 'taste', factor: 0 },
};

export const UNIT_IDS = Object.keys(UNITS);
export const isUnit = (u) => Object.prototype.hasOwnProperty.call(UNITS, u);
export const unitLabel = (u) => UNITS[u]?.label ?? u;
export const isToTaste = (unit, qty) => unit === 'a_gosto' || qty === null || qty === undefined;

/** Gramas contidas em 1 unidade `unit` do ingrediente, ou null. */
function gramsPer(unit, ing, depth = 0) {
  const u = UNITS[unit];
  if (!u) return null;
  if (u.dim === 'mass') return u.factor;
  if (u.dim === 'volume') return ing?.density ? u.factor * ing.density : null;
  if (u.dim === 'count') return ing?.unitWeight ?? null;
  // Unidade especial: precisa de conversão explícita para a base do ingrediente.
  if (depth === 0 && ing?.conversions?.[unit] != null && ing.baseUnit !== unit) {
    const g = gramsPer(ing.baseUnit, ing, 1);
    return g == null ? null : ing.conversions[unit] * g;
  }
  return null;
}

/**
 * Fator multiplicativo que converte 1 `unit` na unidade-base do ingrediente.
 * Retorna null quando a conversão não é confiável.
 */
export function factorToBase(unit, ing) {
  if (!ing || !isUnit(unit)) return null;
  const base = ing.baseUnit;
  if (unit === base) return 1;
  if (unit === 'a_gosto') return null;
  if (ing.conversions?.[unit] != null) return ing.conversions[unit];
  const u = UNITS[unit];
  const b = UNITS[base];
  if (!b) return null;
  if (u.dim === b.dim) return u.factor / b.factor;
  // Unidade especial definida apenas para outra unidade da mesma dimensão da base.
  const g = gramsPer(unit, ing);
  const gb = gramsPer(base, ing);
  if (g != null && gb != null && gb > 0) return g / gb;
  return null;
}

/** Converte `qty` de `from` para `to`, considerando o ingrediente. Retorna null se incompatível. */
export function convert(qty, from, to, ing) {
  if (qty == null) return null;
  if (from === to) return qty;
  if (ing) {
    const f = factorToBase(from, ing);
    const t = factorToBase(to, ing);
    if (f != null && t != null && t > 0) return (qty * f) / t;
    return null;
  }
  const a = UNITS[from];
  const b = UNITS[to];
  if (a && b && a.dim === b.dim && b.factor > 0) return (qty * a.factor) / b.factor;
  return null;
}

/**
 * Normaliza uma quantidade para a unidade-base do ingrediente.
 * Se não houver conversão confiável, retorna a quantidade na unidade-base da
 * própria dimensão (g, ml, un) ou na unidade especial original, com `compatible: false`.
 */
export function toBase(qty, unit, ing) {
  if (isToTaste(unit, qty)) return { qty: null, unit: 'a_gosto', compatible: true };
  const f = factorToBase(unit, ing);
  if (f != null) return { qty: qty * f, unit: ing.baseUnit, compatible: true };
  const u = UNITS[unit];
  if (!u) return { qty, unit, compatible: false };
  const dimBase = { mass: 'g', volume: 'ml', count: 'un' }[u.dim];
  if (dimBase) return { qty: qty * u.factor, unit: dimBase, compatible: false };
  return { qty, unit, compatible: false };
}

/** Unidades em que faz sentido registrar o ingrediente (base + mesma dimensão + conversões conhecidas). */
export function compatibleUnits(ing) {
  if (!ing) return ['un'];
  return UNIT_IDS.filter((u) => u !== 'a_gosto' && factorToBase(u, ing) != null);
}

// ---------- Formatação ----------

const nf = (maxDigits) =>
  new Intl.NumberFormat('pt-BR', { maximumFractionDigits: maxDigits, minimumFractionDigits: 0 });

export function formatNumber(n, maxDigits = 2) {
  if (n == null || Number.isNaN(n)) return '';
  return nf(maxDigits).format(roundTo(n, maxDigits));
}

export function roundTo(n, digits = 2) {
  const p = 10 ** digits;
  return Math.round(n * p) / p;
}

/**
 * Formata quantidade escolhendo a melhor unidade de exibição:
 * 1200 g → "1,2 kg", 1500 ml → "1,5 L", 2 dente → "2 dente(s)".
 */
export function formatQty(qty, unit) {
  if (isToTaste(unit, qty)) return 'a gosto';
  if (unit === 'g' && Math.abs(qty) >= 1000) return `${formatNumber(qty / 1000, 2)} kg`;
  if (unit === 'ml' && Math.abs(qty) >= 1000) return `${formatNumber(qty / 1000, 2)} L`;
  const digits = unit === 'g' || unit === 'ml' ? 0 : 2;
  const value = formatNumber(qty, digits);
  if (value === '0' && qty > 0) return `${formatNumber(qty, 2)} ${unitLabel(unit)}`;
  return `${value} ${unitLabel(unit)}`;
}

/**
 * Arredonda para cima uma quantidade de compra de forma prática:
 * unidades contáveis → inteiro; g/ml → múltiplo de 10 (ou 50 acima de 1 kg/L).
 */
export function roundForPurchase(qty, unit) {
  if (qty == null || qty <= 0) return 0;
  const u = UNITS[unit];
  if (!u) return Math.ceil(qty);
  if (u.dim === 'mass' || u.dim === 'volume') {
    if (unit === 'kg' || unit === 'l') return Math.ceil(qty * 10) / 10;
    if (unit === 'g' || unit === 'ml') {
      const step = qty >= 1000 ? 50 : 10;
      return Math.ceil(qty / step - 1e-9) * step;
    }
    return Math.ceil(qty * 2 - 1e-9) / 2; // xícaras/colheres: meia unidade
  }
  return Math.ceil(qty - 1e-9);
}

/** Converte texto digitado ("1,5", "2.25") em número. Retorna null se inválido. */
export function parseQty(text) {
  if (typeof text === 'number') return Number.isFinite(text) ? text : null;
  if (typeof text !== 'string') return null;
  const t = text.trim().replace(/\s/g, '');
  if (!t) return null;
  // Aceita vírgula decimal e ponto como separador de milhar ou decimal.
  let normalized = t;
  if (t.includes(',')) normalized = t.replace(/\./g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) {
    // Frações simples: "1/2"
    const frac = /^(\d+)\/(\d+)$/.exec(t);
    if (frac && Number(frac[2]) !== 0) return Number(frac[1]) / Number(frac[2]);
    return null;
  }
  const n = Number(normalized);
  return Number.isFinite(n) ? n : null;
}
