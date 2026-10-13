import { describe, expect, it } from 'vitest';
import type { ModuleEdit } from '../../../api/types';
import { addChapter, addLesson, canStepLesson, draftProblems, isDirty, moveChapter, moveLesson, removeLesson, stepLesson, toDraft, toSave, updateLesson, videoKind } from './draft';

const lesson = (chapter: number, video: number, id: string) => ({
  kind: 'youtube' as const,
  url: `https://www.youtube.com/watch?v=${id}`,
  title: `Video ${id}`,
  channel: null,
  hidden: false,
  origin: { chapter, video },
});

const loaded: ModuleEdit = {
  id: 'stats',
  unitCode: 'ST1215',
  name: 'Introduction to statistics',
  shortName: 'Statistics',
  year: 1,
  icon: 'ChartBar',
  hidden: false,
  position: 3,
  version: 4,
  chapterCount: 2,
  lessonCount: 3,
  updatedAt: null,
  description: 'Means and **medians**.',
  resources: { materials: 'https://drive.google.com/x', exercises: null, exercisesNote: null, vle: null, olderExams: null, cheatSheet: null },
  chapters: [
    { title: 'One', hidden: false, origin: 0, lessons: [lesson(0, 0, 'aaaaaaaaaaa'), lesson(0, 1, 'bbbbbbbbbbb')] },
    { title: 'Two', hidden: true, origin: 1, lessons: [lesson(1, 0, 'ccccccccccc')] },
  ],
};

const titles = (d: ReturnType<typeof toDraft>) => d.chapters.map((c) => c.lessons.map((l) => l.title));

describe('the module draft', () => {
  it('saves what was loaded unchanged, with every origin', () => {
    const body = toSave(toDraft(loaded), loaded.version);
    expect(body.version).toBe(4);
    expect(body.unitCode).toBe('ST1215');
    expect(body.resources?.materials).toBe('https://drive.google.com/x');
    expect(body.resources?.vle).toBeNull();
    expect(body.chapters?.map((c) => [c.origin, c.hidden])).toEqual([
      [0, false],
      [1, true],
    ]);
    expect(body.chapters?.[0]?.lessons?.[1]).toEqual({ url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb', title: 'Video bbbbbbbbbbb', channel: null, hidden: false, origin: { chapter: 0, video: 1 } });
    expect(isDirty(toDraft(loaded), loaded)).toBe(false);
  });

  it('moves lessons within and across chapters, keeping their origins', () => {
    const d = toDraft(loaded);
    const across = moveLesson(d, { chapter: 1, lesson: 0 }, { chapter: 0, lesson: 0 });
    expect(titles(across)).toEqual([['Video ccccccccccc', 'Video aaaaaaaaaaa', 'Video bbbbbbbbbbb'], []]);
    expect(toSave(across, 4).chapters?.[0]?.lessons?.[0]?.origin).toEqual({ chapter: 1, video: 0 });
    expect(isDirty(across, loaded)).toBe(true);
  });

  it('steps a lesson past the end of its chapter into the next one', () => {
    const d = toDraft(loaded);
    expect(titles(stepLesson(d, { chapter: 0, lesson: 1 }, 1))).toEqual([['Video aaaaaaaaaaa'], ['Video bbbbbbbbbbb', 'Video ccccccccccc']]);
    expect(titles(stepLesson(d, { chapter: 1, lesson: 0 }, -1))).toEqual([['Video aaaaaaaaaaa', 'Video bbbbbbbbbbb', 'Video ccccccccccc'], []]);
    expect(canStepLesson(d, { chapter: 0, lesson: 0 }, -1)).toBe(false);
    expect(canStepLesson(d, { chapter: 1, lesson: 0 }, 1)).toBe(false);
  });

  it('reorders chapters and adds new ones without an origin', () => {
    const d = addLesson(addChapter(moveChapter(toDraft(loaded), 1, 0)), 2);
    const body = toSave(d, 4);
    expect(body.chapters?.map((c) => c.origin)).toEqual([1, 0, null]);
    expect(body.chapters?.[2]?.lessons?.[0]?.origin).toBeNull();
  });

  it('finds what the API would refuse before saving', () => {
    let d = addChapter(toDraft(loaded));
    d = updateLesson(d, { chapter: 0, lesson: 0 }, { url: 'https://evil.example.com/watch?v=x' });
    d = { ...d, unitCode: 'ST12' };
    expect(Object.keys(draftProblems(d)).sort()).toEqual(['chapters.0.lessons.0.url', 'chapters.2.title', 'unitCode']);
    expect(draftProblems(removeLesson(toDraft(loaded), { chapter: 0, lesson: 0 }))).toEqual({});
  });
});

describe('videoKind', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'youtube'],
    ['https://youtu.be/dQw4w9WgXcQ', 'youtube'],
    ['https://www.youtube.com/playlist?list=PL123', 'youtube-playlist'],
    ['https://vc.bibf.com/playback/x', 'bbb'],
    ['http://www.youtube.com/watch?v=dQw4w9WgXcQ', null],
    ['https://vimeo.com/1', null],
    ['https://vc.bibf.com.example.com/x', null],
    ['javascript:alert(1)', null],
    ['not a link', null],
  ])('%s is %s', (url, kind) => {
    expect(videoKind(url)).toBe(kind);
  });
});
