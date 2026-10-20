import { describe, expect, it } from 'vitest';
import type { ModuleEdit } from '../../../api/types';
import {
  addChapter,
  addLesson,
  canStepLesson,
  draftProblems,
  isDirty,
  keywordError,
  keywordList,
  moveChapter,
  moveLesson,
  removeLesson,
  stepLesson,
  toDraft,
  toSave,
  updateLesson,
  videoKind,
} from './draft';

const lesson = (id: string, video: string) => ({
  id,
  kind: 'youtube' as const,
  url: `https://www.youtube.com/watch?v=${video}`,
  title: `Video ${video}`,
  channel: null,
  hidden: false,
});

const loaded: ModuleEdit = {
  id: 'stats',
  unitCode: 'ST1215',
  name: 'Introduction to statistics',
  shortName: 'Statistics',
  year: 1,
  icon: 'ChartBar',
  art: 'modules/module-st1215.png',
  hidden: false,
  position: 3,
  version: 4,
  chapterCount: 2,
  lessonCount: 3,
  updatedAt: null,
  description: 'Means and **medians**.',
  chapters: [
    {
      id: 'chone',
      title: 'One',
      hidden: false,
      keywords: ['mle', 'cramer rao'],
      lessons: [lesson('la', 'aaaaaaaaaaa'), lesson('lb', 'bbbbbbbbbbb')],
    },
    { id: 'chtwo', title: 'Two', hidden: true, keywords: [], lessons: [lesson('lc', 'ccccccccccc')] },
  ],
};

const titles = (d: ReturnType<typeof toDraft>) => d.chapters.map((c) => c.lessons.map((l) => l.title));

describe('the module draft', () => {
  it('saves what was loaded unchanged, with every id', () => {
    const body = toSave(toDraft(loaded), loaded.version);
    expect(body.version).toBe(4);
    expect(body.unitCode).toBe('ST1215');
    expect(body.chapters?.map((c) => [c.id, c.hidden])).toEqual([
      ['chone', false],
      ['chtwo', true],
    ]);
    expect(body.chapters?.[0]?.lessons?.[1]).toEqual({
      url: 'https://www.youtube.com/watch?v=bbbbbbbbbbb',
      title: 'Video bbbbbbbbbbb',
      channel: null,
      hidden: false,
      id: 'lb',
    });
    expect(isDirty(toDraft(loaded), loaded)).toBe(false);
  });

  it('moves lessons within and across chapters, keeping their ids', () => {
    const d = toDraft(loaded);
    const across = moveLesson(d, { chapter: 1, lesson: 0 }, { chapter: 0, lesson: 0 });
    expect(titles(across)).toEqual([['Video ccccccccccc', 'Video aaaaaaaaaaa', 'Video bbbbbbbbbbb'], []]);
    expect(toSave(across, 4).chapters?.[0]?.lessons?.[0]?.id).toBe('lc');
    expect(isDirty(across, loaded)).toBe(true);
  });

  it('steps a lesson past the end of its chapter into the next one', () => {
    const d = toDraft(loaded);
    expect(titles(stepLesson(d, { chapter: 0, lesson: 1 }, 1))).toEqual([
      ['Video aaaaaaaaaaa'],
      ['Video bbbbbbbbbbb', 'Video ccccccccccc'],
    ]);
    expect(titles(stepLesson(d, { chapter: 1, lesson: 0 }, -1))).toEqual([
      ['Video aaaaaaaaaaa', 'Video bbbbbbbbbbb', 'Video ccccccccccc'],
      [],
    ]);
    expect(canStepLesson(d, { chapter: 0, lesson: 0 }, -1)).toBe(false);
    expect(canStepLesson(d, { chapter: 1, lesson: 0 }, 1)).toBe(false);
  });

  it('reorders chapters and adds new ones without an id', () => {
    const d = addLesson(addChapter(moveChapter(toDraft(loaded), 1, 0)), 2);
    const body = toSave(d, 4);
    expect(body.chapters?.map((c) => c.id)).toEqual(['chtwo', 'chone', null]);
    expect(body.chapters?.[2]?.lessons?.[0]?.id).toBeNull();
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

describe('a chapter’s words for search', () => {
  it('load as one line and save as a list', () => {
    const d = toDraft(loaded);
    expect(d.chapters[0]?.keywords).toBe('mle, cramer rao');
    expect(toSave(d, 4).chapters?.[0]?.keywords).toEqual(['mle', 'cramer rao']);
    expect(isDirty(d, loaded)).toBe(false);
  });
  it('show the API’s problem with the list or one word', () => {
    expect(keywordError({ 'chapters.1.keywords.2': 'Too long' }, 1)).toBe('Too long');
    expect(keywordError({ 'chapters.1.keywords': 'Too many' }, 1)).toBe('Too many');
    expect(keywordError({ 'chapters.1.title': 'Needed', 'chapters.10.keywords': 'x' }, 1)).toBeUndefined();
  });
  it('split at commas, leaving out empty ones', () => {
    expect(keywordList(' MLE ,, Cramér-Rao, ')).toEqual(['MLE', 'Cramér-Rao']);
    expect(keywordList('')).toEqual([]);
  });
});
