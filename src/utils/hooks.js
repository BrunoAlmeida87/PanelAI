import { useEffect, useState, useCallback } from 'preact/hooks';

export function useMediaQuery(query) {
  const get = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia(query).matches : false);
  const [matches, setMatches] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const onChange = () => setMatches(mq.matches);
    onChange();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [query]);
  return matches;
}

/** Celular: até 599 px. */
export const useIsPhone = () => useMediaQuery('(max-width: 599px)');
/** Layout com navegação superior: a partir de 900 px. */
export const useIsDesktop = () => useMediaQuery('(min-width: 900px)');

/** Preferência simples guardada no localStorage. */
export function usePref(key, initial) {
  const storageKey = `panelai.${key}`;
  const [value, setValue] = useState(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw == null ? initial : JSON.parse(raw);
    } catch {
      return initial;
    }
  });
  const set = useCallback(
    (v) => {
      setValue((prev) => {
        const next = typeof v === 'function' ? v(prev) : v;
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          /* armazenamento indisponível: mantém só em memória */
        }
        return next;
      });
    },
    [storageKey],
  );
  return [value, set];
}

export function useOnline() {
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

/** Mantém --vvh igual à altura visível (considera o teclado virtual no iOS). */
export function installViewportHeightVar() {
  const vv = window.visualViewport;
  if (!vv) return;
  const update = () => document.documentElement.style.setProperty('--vvh', `${vv.height}px`);
  update();
  vv.addEventListener('resize', update);
}
