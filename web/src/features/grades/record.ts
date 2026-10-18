// The calculator's record in this browser: each subject's mark, kept by the subject's id (so the rules can change
// order or add subjects without moving anyone's marks), and the module picks.
import { useMemo } from 'react';
import { useLocalStorage } from '../../state';
import type { ChoiceSlot, Picks, Rules } from './classify';

// Marks live only in this browser's localStorage: the calculator never sends them to the server. The key starts
// with 'hub.mine.', so signing out clears them (lab computers are shared).
export const STORAGE_KEY = 'hub.mine.grades';

/** The marks in the rules' order ('' for none), and the picks. */
export interface GradesRecord {
  marks: string[];
  picks: Picks;
}

/** As this browser keeps it. */
export interface StoredRecord {
  marks: Record<string, string>;
  picks: Picks;
}

export const EMPTY_STORED: StoredRecord = { marks: {}, picks: {} };

const SLOTS: readonly ChoiceSlot[] = ['year2Option', 'elective1', 'elective2'];

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

function storedMarks(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (isObject(raw) && isObject(raw.marks)) {
    for (const [id, v] of Object.entries(raw.marks)) {
      if (typeof v === 'string' && v) out[id] = v;
      else if (typeof v === 'number' && Number.isFinite(v)) out[id] = String(v);
    }
  }
  return out;
}

/** Whatever is stored, as one mark string per subject of the rules and the known picks (stored JSON is never
 *  trusted). */
export function readRecord(raw: unknown, rules: Rules): GradesRecord {
  const stored = storedMarks(raw);
  const picks: Picks = {};
  const storedPicks = isObject(raw) ? raw.picks : null;
  if (isObject(storedPicks)) {
    for (const slot of SLOTS) {
      const v = storedPicks[slot];
      if (typeof v === 'string' && v) picks[slot] = v;
    }
  }
  return { marks: rules.subjects.map((s) => stored[s.id] ?? ''), picks };
}

/** The record to keep: its marks by subject id, over what was kept before (a subject the rules leave out for now
 *  keeps its mark). */
export function storedRecord(record: GradesRecord, rules: Rules, before: unknown = null): StoredRecord {
  const marks = storedMarks(before);
  rules.subjects.forEach((s, i) => {
    const v = record.marks[i] ?? '';
    if (v) marks[s.id] = v;
    else delete marks[s.id];
  });
  return { marks, picks: record.picks };
}

/** The stored record, read-only: other pages read the marks here and never write them. */
export function useCalculatorRecord(rules: Rules | undefined): GradesRecord | null {
  const [stored] = useLocalStorage<unknown>(STORAGE_KEY, EMPTY_STORED);
  return useMemo(() => (rules ? readRecord(stored, rules) : null), [stored, rules]);
}
