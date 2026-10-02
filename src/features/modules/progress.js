// Lesson progress store (modules feature). One localStorage key, JSON:
//   { watched: { [lessonKey]: watchedAtMs }, last: { [moduleId]: { c, v, at } }, demo?: true }
// lessonKey() comes from src/data/modules.js ('<moduleId>:<chapterIndex>:<videoIndex>').
// `last` is the lesson a student most recently opened (played or marked) per module; it drives
// "Pick up where you left off" and Home's Continue learning.
//
// DEMO SEED: the first time this browser has no progress at all, a small deterministic history is
// written for a Year 2 student (ST2133 ~40%, ST2195 ~25%, EC2020 ~10%) so Home and /modules are not
// empty in the launch film. It is local to this browser and marked `demo: true`. Clearing the key
// (or "Reset progress" in a module's lesson list) gives a clean slate; it is never re-seeded once
// the key exists.
import { useCallback, useMemo } from 'react';
import { getModule, lessonKey } from '../../data/modules.js';
import { useLocalStorage } from '../../state';

export const PROGRESS_KEY = 'hub.lessons.v1';
const EMPTY = Object.freeze({ watched: Object.freeze({}), last: Object.freeze({}) });

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

/** Deterministic demo history, relative to `now` (the film freezes the clock, so times stay stable). */
function buildDemoSeed(now) {
  const watched = {};
  const add = (moduleId, c, v, ago) => {
    watched[lessonKey(moduleId, c, v)] = now - ago;
  };
  // ST2133 Distribution Theory: all of chapter 1 (9 videos), then the first eight lessons of chapter 2 (its
  // first class recordings and videos): 17 of 42 = 40%, one a day. The student stopped at lesson 11, the binomial.
  for (let v = 0; v < 9; v++) add('advanced-stats-distribution', 0, v, (17 - v) * DAY + 6 * HOUR);
  for (let v = 0; v < 8; v++) add('advanced-stats-distribution', 1, v, (8 - v) * DAY + 5 * HOUR);
  // ST2195 Programming for Data Science: R and Python courses, blocks 1–2, first video of block 3 (9 of 37 = 24%).
  const pds = [[0, 0], [1, 0], [4, 0], [4, 1], [5, 0], [5, 1], [5, 2], [5, 3], [6, 0]];
  pds.forEach(([c, v], i) => add('programming-data-science', c, v, (16 - i) * DAY + 3 * HOUR));
  // EC2020 Elements of Econometrics: chapter 1 (1 of 8 = 13%).
  add('econometrics', 0, 0, 4 * DAY + 2 * HOUR);
  return {
    demo: true,
    watched,
    last: {
      'advanced-stats-distribution': { c: 1, v: 10, at: now - 2 * HOUR },
      'programming-data-science': { c: 6, v: 1, at: now - 26 * HOUR },
      econometrics: { c: 1, v: 0, at: now - 3 * DAY - 4 * HOUR },
    },
  };
}

let seedChecked = false;
/** Write the demo seed once, only if this browser has never stored lesson progress. */
export function ensureDemoSeed() {
  if (seedChecked || typeof window === 'undefined') return;
  seedChecked = true;
  try {
    if (window.localStorage.getItem(PROGRESS_KEY) === null) {
      window.localStorage.setItem(PROGRESS_KEY, JSON.stringify(buildDemoSeed(Date.now())));
    }
  } catch {
    /* storage unavailable: start empty */
  }
}

/** Coerce whatever is stored into { watched, last }. */
export function normalizeProgress(p) {
  const ok = (x) => x && typeof x === 'object' && !Array.isArray(x);
  return { watched: ok(p?.watched) ? p.watched : EMPTY.watched, last: ok(p?.last) ? p.last : EMPTY.last };
}

/** Snapshot read (non-reactive) for plain functions such as getModuleProgress(). */
export function readProgress() {
  ensureDemoSeed();
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    return normalizeProgress(raw ? JSON.parse(raw) : null);
  } catch {
    return EMPTY;
  }
}

// ── Pure helpers ──────────────────────────────────────────────────────────

/** Every lesson of a module in order: [{ c, v, video, chapter }]. */
export function flatLessons(m) {
  const out = [];
  if (!m) return out;
  m.chapters.forEach((chapter, c) => chapter.videos.forEach((video, v) => out.push({ c, v, video, chapter })));
  return out;
}

export function isValidLesson(m, c, v) {
  return Boolean(m && Number.isInteger(c) && Number.isInteger(v) && m.chapters[c] && m.chapters[c].videos[v]);
}

/** { watched, total, pct } for a module. */
export function computeModuleProgress(state, m) {
  let watched = 0;
  let total = 0;
  if (m) {
    m.chapters.forEach((ch, c) => {
      ch.videos.forEach((_, v) => {
        total += 1;
        if (state.watched[lessonKey(m.id, c, v)]) watched += 1;
      });
    });
  }
  return { watched, total, pct: total ? Math.round((watched / total) * 100) : 0 };
}

/** { watched, total, pct } for one chapter. */
export function computeChapterProgress(state, m, c) {
  const ch = m?.chapters[c];
  if (!ch) return { watched: 0, total: 0, pct: 0 };
  const watched = ch.videos.reduce((n, _, v) => n + (state.watched[lessonKey(m.id, c, v)] ? 1 : 0), 0);
  const total = ch.videos.length;
  return { watched, total, pct: total ? Math.round((watched / total) * 100) : 0 };
}

/**
 * Where to pick up in a module:
 *   { c, v, at, kind: 'resume' | 'next' | 'start' | 'done' } or null when the module has no lessons.
 * resume = last opened lesson, not yet watched · next = the first unwatched lesson after it ·
 * start = nothing opened yet · done = everything watched.
 */
export function computeResumePoint(state, m) {
  const lessons = flatLessons(m);
  if (!lessons.length) return null;
  const seen = (l) => Boolean(state.watched[lessonKey(m.id, l.c, l.v)]);
  const last = state.last[m.id];
  if (last && isValidLesson(m, last.c, last.v)) {
    const i = lessons.findIndex((l) => l.c === last.c && l.v === last.v);
    if (!seen(lessons[i])) return { c: last.c, v: last.v, at: last.at, kind: 'resume' };
    const after = lessons.slice(i + 1).find((l) => !seen(l)) || lessons.slice(0, i).find((l) => !seen(l));
    if (after) return { c: after.c, v: after.v, at: last.at, kind: 'next' };
    return { c: lessons[0].c, v: lessons[0].v, at: last.at, kind: 'done' };
  }
  const first = lessons.find((l) => !seen(l));
  if (first) {
    const anyWatched = lessons.some(seen);
    return { c: first.c, v: first.v, at: null, kind: anyWatched ? 'next' : 'start' };
  }
  return { c: lessons[0].c, v: lessons[0].v, at: null, kind: 'done' };
}

/** Up to n modules the student is working through, most recent first, each with its resume lesson. */
export function computeRecentInProgress(state, n = 3) {
  return Object.entries(state.last)
    .map(([id, l]) => ({ module: getModule(id), at: Number(l?.at) || 0 }))
    .filter((x) => x.module && x.at)
    .sort((a, b) => b.at - a.at)
    .map(({ module, at }) => ({ module, at, resume: computeResumePoint(state, module), progress: computeModuleProgress(state, module) }))
    .filter((x) => x.resume && x.resume.kind !== 'done')
    .slice(0, n);
}

// ── React hook ────────────────────────────────────────────────────────────

/**
 * Reactive progress for the modules feature.
 * @returns {{ state, isWatched(key), setWatched(moduleId, c, v, on), markOpened(moduleId, c, v), resetModule(moduleId), restore(snapshot) }}
 */
export function useLessonProgress() {
  ensureDemoSeed();
  const [raw, setRaw] = useLocalStorage(PROGRESS_KEY, EMPTY);
  const state = useMemo(() => normalizeProgress(raw), [raw]);

  const isWatched = useCallback((key) => Boolean(state.watched[key]), [state]);

  const setWatched = useCallback(
    (moduleId, c, v, on) => {
      setRaw((prev) => {
        const s = normalizeProgress(prev);
        const key = lessonKey(moduleId, c, v);
        const watched = { ...s.watched };
        if (on) watched[key] = Date.now();
        else delete watched[key];
        return { ...prev, watched, last: { ...s.last, [moduleId]: { c, v, at: Date.now() } } };
      });
    },
    [setRaw],
  );

  const markOpened = useCallback(
    (moduleId, c, v) => {
      setRaw((prev) => {
        const s = normalizeProgress(prev);
        return { ...prev, watched: s.watched, last: { ...s.last, [moduleId]: { c, v, at: Date.now() } } };
      });
    },
    [setRaw],
  );

  /** Clears a module's progress and returns the previous store snapshot (for Undo). */
  const resetModule = useCallback(
    (moduleId) => {
      let snapshot = null;
      setRaw((prev) => {
        snapshot = prev;
        const s = normalizeProgress(prev);
        const watched = Object.fromEntries(Object.entries(s.watched).filter(([k]) => !k.startsWith(`${moduleId}:`)));
        const last = { ...s.last };
        delete last[moduleId];
        return { ...prev, watched, last };
      });
      return snapshot;
    },
    [setRaw],
  );

  const restore = useCallback((snapshot) => setRaw(snapshot ?? EMPTY), [setRaw]);

  return { state, isWatched, setWatched, markOpened, resetModule, restore };
}
