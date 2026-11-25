// Busca da previsão do tempo (Open-Meteo) com cache, para o card "Clima".
//
// - Uma busca por lugar, compartilhada por todos os cards e miniaturas.
// - Guarda a última previsão boa no navegador (até 12 h) para quando a internet
//   falhar; a tela mostra "previsão de HH:MM" nesse caso.
// - A tela pronta (#/display/tela) só se declara pronta para a foto quando os
//   cards de clima terminaram de buscar (ou desistiram), ver useForecastsReady.

import { useEffect, useState } from 'preact/hooks';
import { browserTimeZone, forecastUrl, geocodeUrl, isPlace, parseGeocode } from './weather.js';

const FRESH_MS = 20 * 60 * 1000; // previsão nova a cada 20 min
const STALE_MS = 12 * 60 * 60 * 1000; // cópia guardada vale até 12 h
const TIMEOUT_MS = 12_000;

const cache = new Map(); // chave → { status, value, at, stale, promise }
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

const keyOf = (place, tz) => `${Number(place.lat).toFixed(3)},${Number(place.lon).toFixed(3)}|${tz}`;
const storageKey = (key) => `panelai.clima.${key}`;

function readStored(key) {
  try {
    const raw = localStorage.getItem(storageKey(key));
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeStored(key, value, at) {
  try {
    localStorage.setItem(storageKey(key), JSON.stringify({ at, value }));
  } catch {
    // sem espaço ou bloqueado: só não guarda
  }
}

async function fetchJson(url) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), TIMEOUT_MS) : null;
  try {
    const res = await fetch(url, { signal: ctrl?.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function load(place, tz) {
  const key = keyOf(place, tz);
  const entry = cache.get(key);
  const now = Date.now();
  if (entry?.promise) return entry;
  if (entry?.status === 'ok' && !entry.stale && now - entry.at < FRESH_MS) return entry;
  if (!entry) {
    const stored = readStored(key);
    if (stored?.value && now - stored.at < FRESH_MS) {
      const e = { status: 'ok', value: stored.value, at: stored.at, stale: false };
      cache.set(key, e);
      return e;
    }
  }
  const next = { ...(entry ?? { status: 'loading' }) };
  next.promise = fetchJson(forecastUrl(place, tz))
    .then((value) => {
      const at = Date.now();
      writeStored(key, value, at);
      cache.set(key, { status: 'ok', value, at, stale: false });
    })
    .catch(() => {
      const old = cache.get(key);
      const stored = readStored(key);
      const fallback = old?.value ? { value: old.value, at: old.at } : stored;
      if (fallback?.value && Date.now() - fallback.at < STALE_MS) cache.set(key, { status: 'ok', value: fallback.value, at: fallback.at, stale: true, failedAt: Date.now() });
      else cache.set(key, { status: 'error', at: Date.now(), failedAt: Date.now() });
    })
    .finally(notify);
  cache.set(key, next);
  return next;
}

/** Re-desenha quando alguma previsão chega. */
function useCacheVersion() {
  const [, setV] = useState(0);
  useEffect(() => {
    const fn = () => setV((v) => v + 1);
    listeners.add(fn);
    return () => listeners.delete(fn);
  }, []);
}

/**
 * Previsão de um lugar: { status: 'none' | 'loading' | 'ok' | 'error', value, at, stale }.
 * Busca de novo a cada 20 min enquanto a tela estiver aberta.
 */
export function useForecast(place) {
  useCacheVersion();
  const tz = browserTimeZone();
  const ok = isPlace(place);
  const key = ok ? keyOf(place, tz) : null;
  useEffect(() => {
    if (!ok) return undefined;
    load(place, tz);
    const id = setInterval(() => load(place, tz), FRESH_MS);
    return () => clearInterval(id);
    // Só a chave (lugar + fuso) importa: o objeto `place` muda a cada render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!ok) return { status: 'none' };
  const entry = cache.get(key);
  return entry ?? { status: 'loading' };
}

/**
 * Todos os lugares já terminaram de buscar (com ou sem sucesso)? Depois de
 * `timeoutMs` responde "sim" de qualquer jeito, para a imagem nunca travar.
 */
export function useForecastsReady(places, timeoutMs = 20_000) {
  useCacheVersion();
  const tz = browserTimeZone();
  const valid = places.filter(isPlace);
  const sig = valid.map((p) => keyOf(p, tz)).join(';');
  const [timedOut, setTimedOut] = useState(false);
  useEffect(() => {
    valid.forEach((p) => load(p, tz));
    if (!valid.length) return undefined;
    const id = setTimeout(() => setTimedOut(true), timeoutMs);
    return () => clearTimeout(id);
    // `sig` resume a lista de lugares (os objetos mudam a cada render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sig]);
  if (timedOut) return true;
  return valid.every((p) => {
    const e = cache.get(keyOf(p, tz));
    return e && !e.promise && (e.status === 'ok' || e.status === 'error');
  });
}

/** Busca cidades pelo nome (para escolher o lugar do card). */
export async function searchPlaces(query) {
  if (!String(query ?? '').trim()) return [];
  return parseGeocode(await fetchJson(geocodeUrl(query)));
}
