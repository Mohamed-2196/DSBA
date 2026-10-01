// "What if" hints for the grade calculator. Every answer here is found by running classify()
// (the v1 algorithm) on modified marks, so a hint can never disagree with the result it explains.
// verify-grades.mjs re-runs the suggested marks through the untouched v1 component as well.
import { classify, normalizeGrades, RANK, SUBJECTS } from './classify.js';

/** Next outcome up from a classified (non-resit) result. */
export const NEXT_CLASS = { none: 'third', third: 'lower', lower: 'upper', upper: 'first' };
/** Lowest mark of the band that a class counts (First → 70 …). */
export const BAND_FLOOR = { first: 70, upper: 60, lower: 50, third: 40 };

const isBlank = (raw) => raw == null || String(raw).trim() === '';
const reaches = (marks, target) => RANK[classify(marks).kind] >= RANK[target];

/** Indexes of subjects with no mark yet. */
export function blankIndexes(grades) {
  return normalizeGrades(grades)
    .map((raw, i) => (isBlank(raw) ? i : -1))
    .filter((i) => i >= 0);
}

/**
 * Partial input: for each class, the lowest whole mark that — scored in every subject still blank —
 * gives that class. mark null = out of reach even with 100s (e.g. an entered mark is under 40).
 * @returns {{ kind: 'first'|'upper'|'lower'|'third', mark: number|null, blanks: number }[]}
 */
export function targetsForRemaining(grades) {
  const g = normalizeGrades(grades);
  const blanks = blankIndexes(g);
  if (!blanks.length) return [];
  const fill = (m) => g.map((raw, i) => (blanks.includes(i) ? String(m) : raw));
  return ['first', 'upper', 'lower', 'third'].map((kind) => {
    let mark = null;
    // Below 40 is always a resit, so 40 is the floor. classify() is monotone in every mark,
    // so the first mark that works is the minimum.
    for (let m = 40; m <= 100; m += 1) {
      if (reaches(fill(m), kind)) {
        mark = m;
        break;
      }
    }
    return { kind, mark, blanks: blanks.length };
  });
}

/**
 * Complete, classified input below a First: the cheapest way (fewest extra percentage points) found
 * to reach the next class. Tries every single-module change first, then a greedy multi-module plan
 * that raises marks to the band that counts, cheapest classification mark first, and prunes it.
 * @returns {{ target, changes: { index, from, to }[], delta: number, marks: string[] } | null}
 */
export function improvementPlan(grades) {
  const g = normalizeGrades(grades);
  const now = classify(g);
  if (!now.complete || now.failed) return null;
  const target = NEXT_CLASS[now.kind];
  if (!target) return null;

  // 1. One module is enough?
  let best = null;
  g.forEach((raw, i) => {
    const cur = Number(raw);
    for (let v = Math.floor(cur) + 1; v <= 100; v += 1) {
      const test = g.slice();
      test[i] = String(v);
      if (reaches(test, target)) {
        const delta = v - cur;
        if (!best || delta < best.delta) best = { changes: [{ index: i, from: cur, to: v }], delta, marks: test };
        break;
      }
    }
  });
  if (best) return { target, ...best };

  // 2. Greedy over "raise to the band floor" moves.
  const floor = BAND_FLOOR[target];
  let marks = g.slice();
  const changed = new Map(); // index -> original value
  for (let step = 0; step < 20 && !reaches(marks, target); step += 1) {
    const moves = [];
    // Year 1 counts through its average (2 marks): raise the lowest Year 1 marks until it reaches the floor.
    let sum = [0, 1, 2, 3].reduce((s, i) => s + Number(marks[i]), 0);
    if (sum / 4 < floor) {
      const next = marks.slice();
      [0, 1, 2, 3]
        .sort((a, b) => Number(marks[a]) - Number(marks[b]))
        .forEach((i) => {
          if (sum >= floor * 4) return;
          const cur = Number(next[i]);
          const up = Math.min(100, Math.ceil(cur + (floor * 4 - sum)));
          sum += up - cur;
          next[i] = String(up);
        });
      const cost = [0, 1, 2, 3].reduce((s, i) => s + (Number(next[i]) - Number(marks[i])), 0);
      if (cost > 0) moves.push({ next, cost, gain: 2 });
    }
    SUBJECTS.forEach((s) => {
      if (s.year === 1) return;
      const cur = Number(marks[s.index]);
      if (cur >= floor) return;
      const next = marks.slice();
      next[s.index] = String(floor);
      moves.push({ next, cost: floor - cur, gain: s.weight });
    });
    if (!moves.length) break;
    moves.sort((a, b) => a.cost / a.gain - b.cost / b.gain);
    const move = moves[0];
    move.next.forEach((v, i) => {
      if (v !== marks[i] && !changed.has(i)) changed.set(i, g[i]);
    });
    marks = move.next;
  }
  if (!reaches(marks, target)) return null;

  // Prune: undo changes that turned out not to be needed (latest first).
  [...changed.keys()].reverse().forEach((i) => {
    const test = marks.slice();
    test[i] = g[i];
    if (reaches(test, target)) {
      marks = test;
      changed.delete(i);
    }
  });

  const changes = [...changed.keys()]
    .sort((a, b) => a - b)
    .map((i) => ({ index: i, from: Number(g[i]), to: Number(marks[i]) }));
  return { target, changes, delta: changes.reduce((s, c) => s + (c.to - c.from), 0), marks };
}

/**
 * Complete, classified input: for each subject, the lowest whole mark it could fall to (everything
 * else unchanged) while keeping the current class. Found by stepping down until classify() drops.
 * @returns {{ index, from: number, floor: number }[] | null}
 */
export function holdingFloors(grades) {
  const g = normalizeGrades(grades);
  const now = classify(g);
  if (!now.complete || now.failed) return null;
  return SUBJECTS.map((s) => {
    const cur = Number(g[s.index]);
    let floor = cur;
    for (let v = Math.floor(cur); v >= 0; v -= 1) {
      const test = g.slice();
      test[s.index] = String(v);
      if (RANK[classify(test).kind] >= RANK[now.kind]) floor = v;
      else break;
    }
    return { index: s.index, from: cur, floor };
  });
}

/**
 * Complete input with a fail: the subjects that trigger the resit, and what the calculator gives
 * once they are passed with 40. (v1 only checks Year 1 through its average.)
 * @returns {{ failing: { index, mark }[], yearOneAverageFails: boolean, outcome: string, marks: string[] } | null}
 */
export function resitOutlook(grades) {
  const g = normalizeGrades(grades);
  const now = classify(g);
  if (!now.failed) return null;
  const failing = [];
  const fixed = g.slice();
  const yearOneAverageFails = now.yearOneAverage != null && now.yearOneAverage < 40;
  SUBJECTS.forEach((s) => {
    const mark = Number(g[s.index]);
    if (isNaN(mark) || mark >= 40) return;
    if (s.year === 1 && !yearOneAverageFails) return;
    failing.push({ index: s.index, mark, blank: isBlank(g[s.index]) });
    fixed[s.index] = '40';
  });
  return { failing, yearOneAverageFails, outcome: classify(fixed).kind, marks: fixed };
}
