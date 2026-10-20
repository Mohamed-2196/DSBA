import { describe, expect, it } from 'vitest';
import type { Chapter, Video } from '../../api/types';
import {
  EMPTY_PROGRESS,
  computeChapterProgress,
  computeModuleProgress,
  computeResumePoint,
  findLesson,
  flatLessons,
  fromServer,
  isEmptyProgress,
  normalizeStored,
  summaryProgress,
  toImport,
  toServer,
  type ProgressState,
} from './progress';

const video = (id: string): Video => ({ id, kind: 'youtube', videoId: `yt${id}`, unavailable: false, topics: [] });
const chapter = (title: string, n: number): Chapter => ({
  id: title.toLowerCase(),
  title,
  videos: Array.from({ length: n }, (_, i) => video(`${title.toLowerCase()}${i}`)),
});
// 2 chapters: 2 videos, then 1.
const m = { id: 'advanced-stats-distribution', chapters: [chapter('MGFs', 2), chapter('Transformations', 1)] };
const id = (c: number, v: number) => m.chapters[c].videos[v].id;
const T = Date.parse('2026-10-01T10:00:00Z');
const state = (watched: [number, number][], last?: { c: number; v: number }): ProgressState => ({
  watched: Object.fromEntries(watched.map(([c, v]) => [id(c, v), { m: m.id, at: T }])),
  last: last ? { [m.id]: { l: id(last.c, last.v), at: T } } : {},
});

describe('stored progress', () => {
  it('drops what isn’t progress', () => {
    expect(normalizeStored(null)).toBe(EMPTY_PROGRESS);
    const s = normalizeStored({
      watched: {
        [id(0, 0)]: { m: m.id, at: T },
        'bad key': { m: m.id, at: T },
        [id(0, 1)]: { m: m.id, at: -1 },
        [id(1, 0)]: T,
      },
      last: { [m.id]: { l: id(0, 1), at: T }, 'Bad Module': { l: id(0, 0), at: T }, other: { c: 0, v: 0, at: T } },
    });
    expect(s).toEqual({ watched: { [id(0, 0)]: { m: m.id, at: T } }, last: { [m.id]: { l: id(0, 1), at: T } } });
  });

  it('round-trips with the API’s shape', () => {
    const s = state([[0, 0]], { c: 0, v: 1 });
    const at = new Date(T).toISOString();
    const out = toServer(s);
    expect(out).toEqual({
      watched: { [id(0, 0)]: { moduleId: m.id, at } },
      last: { [m.id]: { lessonId: id(0, 1), at } },
    });
    expect(fromServer(out)).toEqual(s);
    expect(toImport(s)).toEqual({ watched: { [id(0, 0)]: at }, last: { [m.id]: { lessonId: id(0, 1), at } } });
  });

  it('knows empty progress', () => {
    expect(isEmptyProgress(EMPTY_PROGRESS)).toBe(true);
    expect(isEmptyProgress(state([[0, 0]]))).toBe(false);
  });
});

describe('lessons', () => {
  it('lists every lesson in order and finds one by id', () => {
    expect(flatLessons(m).map((l) => `${l.c}:${l.v}`)).toEqual(['0:0', '0:1', '1:0']);
    expect(findLesson(m, id(1, 0))).toEqual({ c: 1, v: 0 });
    expect(findLesson(m, 'nosuchlesson')).toBeNull();
    expect(findLesson(m, null)).toBeNull();
    expect(findLesson(null, id(0, 0))).toBeNull();
  });

  it('follows a lesson that moved', () => {
    const s = state([[0, 1]], { c: 0, v: 1 });
    const moved = {
      ...m,
      chapters: [{ ...m.chapters[0], videos: [m.chapters[0].videos[1], m.chapters[0].videos[0]] }, m.chapters[1]],
    };
    expect(computeResumePoint(s, moved)).toEqual({ c: 0, v: 1, at: T, kind: 'next' });
    expect(computeChapterProgress(s, moved, 0)).toEqual({ watched: 1, total: 2, pct: 50 });
  });

  it('counts what was watched', () => {
    const s = state([
      [0, 0],
      [0, 1],
    ]);
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
    expect(
      computeResumePoint(
        state(
          [
            [0, 1],
            [1, 0],
          ],
          { c: 1, v: 0 },
        ),
        m,
      ),
    ).toEqual({ c: 0, v: 0, at: T, kind: 'next' });
    expect(
      computeResumePoint(
        state(
          [
            [0, 0],
            [0, 1],
            [1, 0],
          ],
          { c: 1, v: 0 },
        ),
        m,
      )?.kind,
    ).toBe('done');
  });

  it('has nothing to resume in a module without lessons', () => {
    expect(computeResumePoint(EMPTY_PROGRESS, { id: 'business', chapters: [] })).toBeNull();
  });
});
