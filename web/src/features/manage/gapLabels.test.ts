import { describe, expect, it } from 'vitest';
import type { EventGap, GapModule, LessonGap } from '../../api/types';
import { eventMissing, lessonLine, moduleEditor, moduleFiles, moduleName, sittingName } from './gapLabels';

const st2133: GapModule = {
  id: 'advanced-stats-distribution',
  name: 'Advanced statistics',
  unitCode: 'ST2133',
  year: 2,
};
const lessons = (g: Partial<LessonGap>): LessonGap => ({
  module: st2133,
  chapters: 8,
  emptyChapters: 0,
  lessons: 10,
  unavailable: 0,
  ...g,
});
const exam = (g: Partial<EventGap>): EventGap => ({
  id: 'e',
  title: 'Exam',
  date: '2026-11-01',
  moduleId: null,
  sample: false,
  noTime: false,
  noPlace: false,
  ...g,
});

describe('gaps', () => {
  it('names modules and links to where they are fixed', () => {
    expect(moduleName(st2133)).toBe('ST2133 Advanced statistics');
    expect(moduleName({ ...st2133, unitCode: null })).toBe('Advanced statistics');
    expect(moduleFiles(st2133)).toBe('/modules/advanced-stats-distribution?tab=files');
    expect(moduleEditor(st2133)).toBe('/manage?tab=content&module=advanced-stats-distribution');
  });

  it('names sittings', () => {
    expect(sittingName({ examYear: 2023, session: 'may' })).toBe('May 2023');
    expect(sittingName({ examYear: 2022, session: 'october' })).toBe('October 2022');
    expect(sittingName({ examYear: 2021, session: null })).toBe('2021');
  });

  it('says what a module lacks in lessons', () => {
    expect(lessonLine(lessons({ chapters: 0, lessons: 0 }))).toBe('No chapters or lessons yet');
    expect(lessonLine(lessons({ chapters: 3, emptyChapters: 3, lessons: 0 }))).toBe('No lessons in its 3 chapters');
    expect(lessonLine(lessons({ emptyChapters: 2, unavailable: 1 }))).toBe(
      '2 of 8 chapters have no lessons · 1 video gone from YouTube',
    );
  });

  it('says what an exam lacks', () => {
    expect(eventMissing(exam({ noTime: true, noPlace: true }))).toBe('No time or place');
    expect(eventMissing(exam({ noPlace: true }))).toBe('No place');
    expect(eventMissing(exam({ noTime: true }))).toBe('No time');
  });
});
