import { describe, expect, it } from 'vitest';
import type { Chapter, Video } from '../../api/types';
import {
  EMPTY_PROGRESS,
  computeChapterProgress,
  computeModuleProgress,
  computeResumePoint,
  flatLessons,
  fromServer,
  isEmptyProgress,
  isValidLesson,
  normalizeStored,
  summaryProgress,
  toImport,
  type ProgressState,
} from './progress';

const video = (id: string): Video => ({ kind: 'youtube', id, unavailable: false });
const chapter = (title: string, n: number): Chapter => ({ title, videos: Array.from({ length: n }, (_, i) => video(`${title}-${i}`)) });
// 2 chapters: 2 videos, then 1.
const m = { id: 'advanced-stats-distribution', chapters: [chapter('MGFs', 2), chapter('Transformations', 1)] };
const key = (c: number, v: number) => `${m.id}:${c}:${v}`;
const T = Date.parse('2026-10-01T10:00:00Z');
const state = (watched: [number, number][], last?: { c: number; v: number }): ProgressState => ({
  watched: Object.fromEntries(watched.map(([c, v]) => [key(c, v), T])),
  last: last ? { [m.id]: { ...last, at: T } } : {},
});

describe('stored progress', () => {
  it('drops what isn’t progress', () => {
    expect(normalizeStored(null)).toBe(EMPTY_PROGRESS);
    expect(normalizeStored({ demo: true, watched: { [key(0, 0)]: T } })).toBe(EMPTY_PROGRESS); // the prototype's demo history
    const s = normalizeStored({
      watched: { [key(0, 0)]: T, 'bad key': T, [key(0, 1)]: -1 },
      last: { [m.id]: { c: 0, v: 1, at: T }, 'Bad Module': { c: 0, v: 0, at: T }, other: { c: -1, v: 0, at: T } },
    });
    expect(s).toEqual({ watched: { [key(0, 0)]: T }, last: { [m.id]: { c: 0, v: 1, at: T } } });
  });

  it('round-trips with the API’s shape', () => {
    const s = state([[0, 0]], { c: 0, v: 1 });
    const out = toImport(s);
    expect(out).toEqual({ watched: { [key(0, 0)]: new Date(T).toISOString() }, last: { [m.id]: { chapter: 0, video: 1, at: new Date(T).toISOString() } } });
    expect(fromServer(out)).toEqual(s);
  });

  it('knows empty progress', () => {
    expect(isEmptyProgress(EMPTY_PROGRESS)).toBe(true);
    expect(isEmptyProgress(state([[0, 0]]))).toBe(false);
  });
});

describe('lessons', () => {
  it('lists every lesson in order and checks a position', () => {
    expect(flatLessons(m).map((l) => `${l.c}:${l.v}`)).toEqual(['0:0', '0:1', '1:0']);
    expect(isValidLesson(m, 1, 0)).toBe(true);
    expect(isValidLesson(m, 1, 1)).toBe(false);
    expect(isValidLesson(m, null, 0)).toBe(false);
    expect(isValidLesson(null, 0, 0)).toBe(false);
  });

  it('counts what was watched', () => {
    const s = state([[0, 0], [0, 1]]);
    expect(computeModuleProgress(s, m)).toEqual({ watched: 2, total: 3, pct: 67 });
    expect(computeChapterProgress(s, m, 0)).toEqual({ watched: 2, total: 2, pct: 100 });
    expect(computeChapterProgress(s, m, 5)).toEqual({ watched: 0, total: 0, pct: 0 });
    expect(summaryProgress(s, m.id, 3)).toEqual({ watched: 2, total: 3, pct: 67 });
    expect(summaryProgress(s, m.id, 0)).toEqual({ watched: 0, total: 0, pct: 0 });
  });
});

describe('computeResumePoint', () => {
  it('starts at the first lesson', () => {
    expect(computeResumePoint(EMPTY_PROGRESS, m)).toEqual({ c: 0, v: 0, at: null, kind: 'start' });
  });

  it('resumes the lesson last opened, unless it was watched', () => {
    expect(computeResumePoint(state([], { c: 0, v: 1 }), m)).toEqual({ c: 0, v: 1, at: T, kind: 'resume' });
    expect(computeResumePoint(state([[0, 1]], { c: 0, v: 1 }), m)).toEqual({ c: 1, v: 0, at: T, kind: 'next' });
  });

  it('goes back for a lesson skipped earlier, then says done', () => {
    expect(computeResumePoint(state([[0, 1], [1, 0]], { c: 1, v: 0 }), m)).toEqual({ c: 0, v: 0, at: T, kind: 'next' });
    expect(computeResumePoint(state([[0, 0], [0, 1], [1, 0]], { c: 1, v: 0 }), m)?.kind).toBe('done');
  });

  it('has nothing to resume in a module without lessons', () => {
    expect(computeResumePoint(EMPTY_PROGRESS, { id: 'business', chapters: [] })).toBeNull();
  });
});
