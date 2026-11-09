// Geração de identificadores estáveis.

export function uid(prefix = 'id') {
  const rnd =
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}_${Date.now().toString(36)}${rnd}`;
}

/** Converte um nome em identificador legível: "Pão de forma" → "pao-de-forma". */
export function slugify(text) {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Gera um id único a partir de um nome, evitando colisões com `existing`. */
export function uniqueSlug(text, existing) {
  const base = slugify(text) || 'item';
  let id = base;
  let n = 2;
  while (existing.has(id)) id = `${base}-${n++}`;
  return id;
}

/** Normaliza texto para busca (sem acentos, minúsculo). */
export function normalizeText(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}
