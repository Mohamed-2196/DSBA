// The calculator's record in this browser: the marks and the module picks.
import { useMemo } from 'react';
import { useLocalStorage } from '../../state';
import { normalizeGrades, type ChoiceSlot, type Picks } from './classify';
import { EMPTY_RECORD, type GradesRecord } from './examples';

// Marks live only in this browser's localStorage: the calculator never sends them to the server. The key starts
// with 'hub.mine.', so signing out clears them (shared lab computers: security review, finding 23).
export const STORAGE_KEY = 'hub.mine.grades';

const SLOTS: readonly ChoiceSlot[] = ['year2Option', 'elective1', 'elective2'];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Whatever is stored, as a record of 13 mark strings and the known picks (stored JSON is never trusted). */
export function readRecord(raw: unknown): GradesRecord {
  if (!isObject(raw)) return { marks: normalizeGrades(null), picks: {} };
  const picks: Picks = {};
  const storedPicks = raw.picks;
  if (isObject(storedPicks)) {
    for (const slot of SLOTS) {
      const v = storedPicks[slot];
      if (typeof v === 'string' && v) picks[slot] = v;
    }
  }
  return { marks: normalizeGrades(raw.marks), picks };
}

/** The stored record, read-only: other pages read the marks here and never write them. */
export function useCalculatorRecord(): GradesRecord {
  const [stored] = useLocalStorage<unknown>(STORAGE_KEY, EMPTY_RECORD);
  return useMemo(() => readRecord(stored), [stored]);
}
