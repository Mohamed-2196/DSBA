// Practice scores for past papers on the board. They stay in this browser, like the grades calculator's marks, and
// go on sign-out with every other 'hub.mine.' key (shared lab computers).
import { useCallback } from 'react';
import { useLocalStorage } from '../../state';

const KEY = 'hub.mine.paperScores';

export type Scores = Record<string, number>;

/** The stored map, keeping only library item ids with a score from 0 to 100. */
export function cleanScores(raw: unknown): Scores {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const out: Scores = {};
  for (const [id, v] of Object.entries(raw)) {
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 100) out[id] = v;
  }
  return out;
}

/** Scores by library item id, and a setter (null forgets one). */
export function usePaperScores(): [Scores, (itemId: string, score: number | null) => void] {
  const [raw, setRaw] = useLocalStorage<unknown>(KEY, {});
  const scores = cleanScores(raw);
  const setScore = useCallback(
    (itemId: string, score: number | null) =>
      setRaw((prev: unknown) => {
        const next = { ...cleanScores(prev) };
        if (score == null) delete next[itemId];
        else next[itemId] = score;
        return next;
      }),
    [setRaw],
  );
  return [scores, setScore];
}
