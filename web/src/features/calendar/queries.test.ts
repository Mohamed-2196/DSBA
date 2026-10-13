// The calendar's queries over a list of events: exams for a year, the next one, its session and the days an event
// covers.
import { describe, expect, it } from 'vitest';
import { eventDays, examOutlook, examSession, examsFor, groupByDay, nextExam } from './queries';
import type { CalendarEvent } from './types';

const ev = (id: string, date: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id,
  date,
  endDate: null,
  time: null,
  place: null,
  title: id,
  type: 'exam',
  year: 2,
  moduleId: null,
  unitCode: null,
  sample: false,
  ...extra,
});

// Oldest first, as the API sends them. A Year 2 session from 20 May to 5 June (31 May, the last day of the month,
// in the middle), a Year 2 exam alone in July, a Year 3 exam and a date for everyone.
const events: CalendarEvent[] = [
  ev('st2134', '2026-05-20'),
  ev('y3-ml', '2026-05-25', { year: 3 }),
  ev('break', '2026-05-28', { type: 'break', year: null }),
  ev('st2187', '2026-05-31'),
  ev('st2195', '2026-06-05'),
  ev('resit', '2026-07-20'),
];
const ids = (list: readonly CalendarEvent[] | null | undefined) => list?.map((e) => e.id);

describe('examsFor', () => {
  it('keeps the exams of a year, oldest first', () => {
    expect(ids(examsFor(events, 2))).toEqual(['st2134', 'st2187', 'st2195', 'resit']);
    expect(ids(examsFor(events, 3))).toEqual(['y3-ml']);
  });

  it('keeps every exam for no year', () => {
    expect(ids(examsFor(events, null))).toEqual(['st2134', 'y3-ml', 'st2187', 'st2195', 'resit']);
  });
});

describe('nextExam', () => {
  it('counts an exam today as next', () => {
    expect(nextExam(events, { year: 2, from: new Date(2026, 4, 31, 15, 30) })?.id).toBe('st2187');
  });

  it('skips what is past, and other years', () => {
    expect(nextExam(events, { year: 2, from: new Date(2026, 4, 21) })?.id).toBe('st2187');
    expect(nextExam(events, { year: 3, from: new Date(2026, 4, 26) })).toBeNull();
    expect(nextExam(events, { year: 2, from: new Date(2026, 6, 21) })).toBeNull();
  });
});

describe('examSession', () => {
  it('is the run of exams at most three weeks apart, across the end of a month', () => {
    const session = ids(examSession(events, ev('st2187', '2026-05-31'), { year: 2 }));
    expect(session).toEqual(['st2134', 'st2187', 'st2195']);
  });

  it('leaves an exam far from the others in a session of its own', () => {
    expect(ids(examSession(events, ev('resit', '2026-07-20'), { year: 2 }))).toEqual(['resit']);
  });

  it('takes a tighter gap when asked', () => {
    // 20 May to 31 May is 11 days; 31 May to 5 June is 5
    expect(ids(examSession(events, ev('st2187', '2026-05-31'), { year: 2, gapDays: 7 }))).toEqual(['st2187', 'st2195']);
  });

  it('gives the exam alone when it is not in the list', () => {
    const other = ev('elsewhere', '2026-05-22');
    expect(examSession(events, other, { year: 2 })).toEqual([other]);
  });
});

describe('examOutlook', () => {
  it('says a session has started once one of its exams is past', () => {
    const outlook = examOutlook(events, { year: 2, from: new Date(2026, 4, 21) });
    expect(outlook?.next.id).toBe('st2187');
    expect(ids(outlook?.ahead)).toEqual(['st2187', 'st2195']);
    expect(outlook?.started).toBe(true);
  });

  it('is null with no exam ahead', () => {
    expect(examOutlook(events, { year: 2, from: new Date(2026, 6, 21) })).toBeNull();
  });
});

describe('eventDays', () => {
  it('lists every day of an event that spans days, across the end of a month', () => {
    expect(eventDays({ date: '2026-05-30', endDate: '2026-06-02' })).toEqual(['2026-05-30', '2026-05-31', '2026-06-01', '2026-06-02']);
  });

  it('gives the date alone without an end date, or with one that is not after it', () => {
    expect(eventDays({ date: '2026-05-31', endDate: null })).toEqual(['2026-05-31']);
    expect(eventDays({ date: '2026-05-31', endDate: '2026-05-31' })).toEqual(['2026-05-31']);
    expect(eventDays({ date: '2026-05-31', endDate: '2026-05-01' })).toEqual(['2026-05-31']);
  });

  it('puts a multi-day event under each of its days', () => {
    const week = ev('revision-week', '2026-05-29', { endDate: '2026-06-01', type: 'revision' });
    const byDay = groupByDay([week, ev('st2187', '2026-05-31')]);
    expect([...byDay.keys()]).toEqual(['2026-05-29', '2026-05-30', '2026-05-31', '2026-06-01']);
    expect(ids(byDay.get('2026-05-31'))).toEqual(['revision-week', 'st2187']);
  });
});
