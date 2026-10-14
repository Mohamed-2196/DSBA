// Start here: when Year 1's card shows, which calendar date the "Register" step points at, and the ticks kept in the
// browser. Plain functions over the guide's data (data/guides.ts), tested in startHere.test.ts.
import { addDaysToKey, type DayKey } from '../../lib/dates';

const pad = (n: number): string => String(n).padStart(2, '0');

export interface StartWindow {
  /** the card shows today */
  open: boolean;
  /** the first day of this academic year */
  from: DayKey;
  /** the last day the card shows */
  to: DayKey;
}

/**
 * The first `weeks` weeks of the academic year that `today` is in. The year starts on `termStart` (month 1-12):
 * before it, today still belongs to last year's.
 */
export function startWindow(today: DayKey, termStart: { month: number; day: number }, weeks: number): StartWindow {
  const year = Number(today.slice(0, 4));
  const thisYears = `${year}-${pad(termStart.month)}-${pad(termStart.day)}`;
  const from = today >= thisYears ? thisYears : `${year - 1}-${pad(termStart.month)}-${pad(termStart.day)}`;
  const to = addDaysToKey(from, weeks * 7 - 1);
  return { open: today >= from && today <= to, from, to };
}

interface DatedEvent {
  id: string;
  date: DayKey;
  title: string;
  sample: boolean;
}

/** The next date (from today on) whose title contains `title`, ignoring case; null when there is none. */
export function nextDated<T extends DatedEvent>(events: readonly T[], title: string, today: DayKey): T | null {
  const want = title.trim().toLowerCase();
  if (!want) return null;
  return (
    events
      .filter((e) => e.date >= today && e.title.toLowerCase().includes(want))
      .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))[0] ?? null
  );
}

/** The stored ticks that are still steps of the guide (stored JSON is never trusted). */
export function doneSteps(stored: unknown, stepIds: readonly string[]): Set<string> {
  if (!Array.isArray(stored)) return new Set();
  return new Set(stored.filter((x): x is string => typeof x === 'string' && stepIds.includes(x)));
}

/** The stored list with `id` ticked or unticked. */
export function toggleStep(stored: unknown, id: string): string[] {
  const list = Array.isArray(stored) ? stored.filter((x): x is string => typeof x === 'string') : [];
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}
