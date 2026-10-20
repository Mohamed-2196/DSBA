// The guides: which calendar date a step points at, and the ticks kept in the browser (when the Results day card
// shows, GET /home says). Plain functions over the guides (GET /guides), tested in guides.test.ts.
import type { DayKey } from '../../lib/dates';

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
