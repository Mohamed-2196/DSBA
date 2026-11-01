import { describe, expect, it } from 'vitest';
import {
  DAILY_WINDOW,
  NO_CHOICE,
  chaptersFor,
  homeDaily,
  isNoChoice,
  normalizeChoice,
  poolLine,
  withChapters,
  withHomeModule,
} from './daily';

describe('normalizeChoice', () => {
  it('keeps what fits from this browser and drops the rest', () => {
    expect(normalizeChoice(null)).toBeNull();
    expect(normalizeChoice(['econometrics'])).toBeNull();
    expect(
      normalizeChoice({
        moduleId: 'econometrics',
        chapters: { econometrics: ['c1', 'c2', 'c1', 'Bad!'], 'Not an id': ['c1'], mathematics: [], stats: 'c1' },
      }),
    ).toEqual({ moduleId: 'econometrics', chapters: { econometrics: ['c1', 'c2'] } });
    expect(normalizeChoice({ moduleId: 7 })).toEqual(NO_CHOICE);
  });
});

describe('chapters', () => {
  const all = ['c1', 'c2', 'c3'];

  it('keeps the chapters picked, in the module’s order', () => {
    const c = withChapters(NO_CHOICE, 'econometrics', ['c3', 'c1'], all);
    expect(chaptersFor(c, 'econometrics')).toEqual(['c1', 'c3']);
    expect(chaptersFor(c, 'mathematics')).toEqual([]);
    expect(isNoChoice(c)).toBe(false);
  });

  it('forgets a module when every chapter or none is picked, or chapters it no longer has', () => {
    const some = withChapters(NO_CHOICE, 'econometrics', ['c1'], all);
    expect(withChapters(some, 'econometrics', all, all)).toEqual(NO_CHOICE);
    expect(withChapters(some, 'econometrics', [], all)).toEqual(NO_CHOICE);
    expect(withChapters(some, 'econometrics', ['gone'], all)).toEqual(NO_CHOICE);
    expect(isNoChoice(NO_CHOICE)).toBe(true);
  });
});

describe('homeDaily', () => {
  const exam = { moduleId: 'econometrics', days: 10 };

  it('asks the module picked for Home, whatever the next exam', () => {
    const c = withHomeModule(NO_CHOICE, 'mathematics');
    expect(homeDaily(c, exam)).toEqual({ moduleId: 'mathematics', examDays: null });
    expect(homeDaily(c, null)).toEqual({ moduleId: 'mathematics', examDays: null });
  });

  it('else follows the next exam in the six weeks before it', () => {
    expect(homeDaily(NO_CHOICE, exam)).toEqual({ moduleId: 'econometrics', examDays: 10 });
    expect(homeDaily(NO_CHOICE, { ...exam, days: DAILY_WINDOW })?.examDays).toBe(DAILY_WINDOW);
    expect(homeDaily(NO_CHOICE, { ...exam, days: DAILY_WINDOW + 1 })).toBeNull();
    expect(homeDaily(NO_CHOICE, { moduleId: null, days: 3 })).toBeNull();
    expect(homeDaily(NO_CHOICE, null)).toBeNull();
  });
});

describe('poolLine', () => {
  it('says what the question comes from', () => {
    expect(poolLine(34, 3, 'EC2020')).toBe('From 34 questions in the 3 chapters you chose');
    expect(poolLine(1, 1, 'EC2020')).toBe('From 1 question in the chapter you chose');
    expect(poolLine(120, 0, 'EC2020')).toBe('From all 120 questions in EC2020');
  });
});
