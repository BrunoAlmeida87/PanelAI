// Estado de interface compartilhado entre as telas (semana selecionada).

import { useEffect, useState } from 'preact/hooks';
import { addDays, isValidISODate, todayISO, weekStartOf } from '../utils/dates.js';

const KEY = 'panelai.weekId';
const listeners = new Set();

function initialWeek() {
  try {
    const saved = sessionStorage.getItem(KEY);
    if (saved && isValidISODate(saved) && weekStartOf(saved) === saved) return saved;
  } catch {
    /* sem sessionStorage */
  }
  return weekStartOf(todayISO());
}

let weekId = initialWeek();

export const getWeekId = () => weekId;

export function setWeekId(id) {
  weekId = weekStartOf(id);
  try {
    sessionStorage.setItem(KEY, weekId);
  } catch {
    /* ignora */
  }
  for (const l of listeners) l(weekId);
}

export const shiftWeek = (n) => setWeekId(addDays(weekId, 7 * n));
export const goToCurrentWeek = () => setWeekId(weekStartOf(todayISO()));

export function useWeekId() {
  const [w, setW] = useState(weekId);
  useEffect(() => {
    listeners.add(setW);
    return () => listeners.delete(setW);
  }, []);
  return w;
}
