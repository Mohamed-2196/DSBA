import { describe, expect, it } from 'vitest';
import {
  applicationLine,
  dateLabel,
  eventSummary,
  kindLabel,
  resitNote,
  sourceLine,
  TYPE_ORDER,
  typePlural,
  windowLeft,
} from './eventMeta';
import type { CalendarEvent } from './types';

describe('windowLeft', () => {
  const mcq = { date: '2026-10-18', endDate: '2026-11-12' };
  it('counts the days left while a window is open', () => {
    expect(windowLeft(mcq, '2026-11-09')).toBe('4 days left');
    expect(windowLeft(mcq, '2026-11-12')).toBe('Last day today');
    expect(windowLeft(mcq, '2026-10-18')).toBe('26 days left');
  });
  it('says nothing before, after, or for one day', () => {
    expect(windowLeft(mcq, '2026-10-17')).toBeNull();
    expect(windowLeft(mcq, '2026-11-13')).toBeNull();
    expect(windowLeft({ date: '2026-10-18', endDate: null }, '2026-10-18')).toBeNull();
  });
});

describe('applicationLine', () => {
  const window = { date: '2027-01-10', endDate: '2027-02-28' };
  it('says when applications open, then when they close', () => {
    expect(applicationLine(window, '2026-10-14')).toBe('Opens in January');
    expect(applicationLine(window, '2027-01-01')).toMatch(/^Opens .*10 January$/);
    expect(applicationLine(window, '2027-01-10')).toMatch(/^Closes .*28 February$/);
    expect(applicationLine(window, '2027-03-01')).toBeNull();
  });
  it('reads a single day as the closing date', () => {
    expect(applicationLine({ date: '2026-11-30', endDate: null }, '2026-10-14')).toMatch(/^Closes .*30 November$/);
  });
});

it('sourceLine', () => {
  expect(sourceLine({ source: null, checkedOn: null })).toBeNull();
  expect(sourceLine({ source: 'UoL exam timetable', checkedOn: null })).toBe('Source: UoL exam timetable.');
  expect(sourceLine({ source: 'UoL exam timetable', checkedOn: '2026-10-10' })).toMatch(
    /^Source: UoL exam timetable\. Checked .*10 October 2026\.$/,
  );
});

describe('typePlural', () => {
  it('names every type of date in the plural, for "hide all …"', () => {
    expect(TYPE_ORDER.map(typePlural)).toEqual([
      'exams',
      'mock exams',
      'revision sessions',
      'deadlines',
      'careers dates',
      'events',
      'breaks',
      'term dates',
    ]);
    expect(typePlural('party')).toBe('dates');
  });
});

describe('resits', () => {
  it('are called resits wherever a date’s type shows', () => {
    expect(dateLabel({ type: 'exam', resit: true })).toBe('Resit');
    expect(dateLabel({ type: 'exam', resit: false })).toBe('Exam');
    expect(kindLabel({ type: 'exam', resit: true })).toBe('Resit');
    const e = { title: 'MT1186 resit', type: 'exam', year: 1, resit: true } as CalendarEvent;
    expect(eventSummary(e)).toBe('MT1186 resit, resit, for students retaking it');
  });
  it('say whom they are for', () => {
    expect(resitNote({ resit: true, year: 1 })).toBe(
      'For students retaking the module: Year 2 and anyone who ticks “I’m resitting this” on its page.',
    );
    expect(resitNote({ resit: true, year: 3 })).toBe(
      'For students retaking the module: anyone who ticks “I’m resitting this” on its page.',
    );
    expect(resitNote({ resit: false, year: 1 })).toBeNull();
  });
});
