// Roteamento por hash (#/rota), compatível com hospedagem estática no GitHub Pages.

import { useEffect, useState } from 'preact/hooks';

const ROUTES = [
  ['cardapio', /^\/cardapio$/],
  ['compras', /^\/compras$/],
  ['despensa', /^\/despensa(?:\/(estoque|contagem|mercado))?$/],
  ['receitas', /^\/receitas$/],
  ['receita-nova', /^\/receitas\/nova$/],
  ['receita-editar', /^\/receitas\/([^/]+)\/editar$/],
  ['receita', /^\/receitas\/([^/]+)$/],
  ['recados', /^\/recados$/],
  ['ajustes', /^\/ajustes$/],
  ['historico', /^\/historico$/],
];

export function parseHash(hash = location.hash) {
  const raw = decodeURIComponent(hash.replace(/^#/, '')) || '/cardapio';
  const [path, query = ''] = raw.split('?');
  const params = Object.fromEntries(new URLSearchParams(query));
  for (const [name, re] of ROUTES) {
    const m = re.exec(path);
    if (m) return { name, path, arg: m[1] ?? null, params };
  }
  return { name: 'cardapio', path: '/cardapio', arg: null, params };
}

export function navigate(path, { replace = false } = {}) {
  const hash = `#${path}`;
  if (replace) history.replaceState(null, '', hash);
  else if (location.hash !== hash) location.hash = hash;
  window.dispatchEvent(new HashChangeEvent('hashchange'));
}

export function useRoute() {
  const [route, setRoute] = useState(() => parseHash());
  useEffect(() => {
    const on = () => setRoute(parseHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
