import { describe, expect, it } from 'vitest';
import { whenAndWhere } from './eventMeta';
import {
  aheadRows,
  eventDays,
  filterEvents,
  groupByDay,
  groupByMonth,
  listOrder,
  nextExamFor,
  upcomingFrom,
  weekAhead,
  weekEnd,
} from './queries';
import type { CalendarEvent } from './types';

let seq = 0;
const ev = (date: string, over: Partial<CalendarEvent> = {}): CalendarEvent => {
  seq += 1;
  return {
    id: `e${seq}`,
    date,
    endDate: null,
    time: null,
    place: null,
    title: `Event ${seq}`,
    type: 'exam',
    year: 2,
    moduleId: null,
    unitCode: null,
    duration: null,
    rules: null,
    source: null,
    checkedOn: null,
    employerId: null,
    sample: false,
    ...over,
  };
};
const ids = (events: CalendarEvent[]) => events.map((e) => e.id);

describe('listOrder', () => {
  it('sorts by date, then confirmed before unconfirmed, then by type', () => {
    const mockSample = ev('2026-10-15', { type: 'mock', sample: true });
    const deadline = ev('2026-10-15', { type: 'deadline' });
    const examSample = ev('2026-10-15', { sample: true });
    const exam = ev('2026-10-15');
    const early = ev('2026-10-14', { type: 'term' });
    expect(ids(listOrder([mockSample, deadline, examSample, exam, early]))).toEqual(
      ids([early, exam, deadline, examSample, mockSample]),
    );
  });
});

describe('nextExamFor', () => {
  const today = '2026-10-13';

  it('picks the first confirmed exam and lists the unconfirmed ones before it', () => {
    const past = ev('2026-10-10');
    const tentative = ev('2026-10-15', { sample: true });
    const mock = ev('2026-10-16', { type: 'mock' });
    const confirmed = ev('2026-10-23');
    const later = ev('2026-10-27');
    const otherYear = ev('2026-10-14', { year: 1 });
    const answer = nextExamFor([past, tentative, mock, confirmed, later, otherYear], { year: 2, today });
    expect(answer?.exam.id).toBe(confirmed.id);
    expect(ids(answer?.unconfirmedBefore ?? [])).toEqual([tentative.id]);
    expect(answer?.after).toBe(1);
  });

  it('falls back to the first unconfirmed exam when none is confirmed', () => {
    const a = ev('2026-10-20', { sample: true });
    const b = ev('2026-10-25', { sample: true });
    const answer = nextExamFor([b, a], { year: 2, today });
    expect(answer?.exam.id).toBe(a.id);
    expect(answer?.unconfirmedBefore).toEqual([]);
    expect(answer?.after).toBe(1);
  });

  it('counts exams for everyone and today’s exam; every cohort when year is null', () => {
    const forAll = ev(today, { year: null });
    expect(nextExamFor([forAll], { year: 3, today })?.exam.id).toBe(forAll.id);
    const y1 = ev('2026-10-14', { year: 1 });
    expect(nextExamFor([y1], { year: null, today })?.exam.id).toBe(y1.id);
  });

  it('is null with no exam ahead', () => {
    expect(nextExamFor([ev('2026-10-01'), ev('2026-10-20', { type: 'deadline' })], { year: 2, today })).toBeNull();
  });
});

describe('weekAhead', () => {
  const today = '2026-10-13';

  it('covers today and the next six days, for the cohort and everyone', () => {
    const t = ev(today, { type: 'deadline' });
    const last = ev('2026-10-19', { type: 'mock' });
    const tooLate = ev('2026-10-20');
    const yesterday = ev('2026-10-12');
    const otherYear = ev('2026-10-14', { year: 3 });
    const forAll = ev('2026-10-15', { year: null, type: 'event' });
    expect(weekEnd(today)).toBe('2026-10-19');
    expect(ids(weekAhead([t, last, tooLate, yesterday, otherYear, forAll], { year: 2, today }))).toEqual(
      ids([t, forAll, last]),
    );
  });

  it('keeps a break that started earlier and runs into the week', () => {
    const brk = ev('2026-10-10', { type: 'break', endDate: '2026-10-14', year: null });
    expect(ids(weekAhead([brk], { year: 2, today }))).toEqual([brk.id]);
  });
});

describe('upcomingFrom and groupByMonth', () => {
  it('groups by month and day, listing a running event on the first day', () => {
    const running = ev('2026-10-10', { type: 'break', endDate: '2026-10-21' });
    const a = ev('2026-10-20');
    const b = ev('2026-10-20', { type: 'deadline', sample: true });
    const c = ev('2026-11-02');
    const gone = ev('2026-10-12');
    const list = upcomingFrom([c, b, gone, running, a], '2026-10-20');
    expect(ids(list)).toEqual(ids([running, a, b, c]));
    const months = groupByMonth(list, '2026-10-20');
    expect(months.map((m) => [m.key, m.days.map((d) => [d.key, d.events.length])])).toEqual([
      ['2026-10', [['2026-10-20', 3]]],
      ['2026-11', [['2026-11-02', 1]]],
    ]);
    expect(months[0]?.m).toBe(9);
  });
});

describe('filterEvents and eventDays', () => {
  it('filters by cohort and type', () => {
    const a = ev('2026-10-20', { type: 'mock', year: 1 });
    const b = ev('2026-10-20', { type: 'exam', year: null });
    expect(ids(filterEvents([a, b], { year: 2 }))).toEqual([b.id]);
    expect(ids(filterEvents([a, b], { types: new Set(['mock'] as const) }))).toEqual([a.id]);
  });

  it('lists every day an event covers', () => {
    expect(eventDays({ date: '2026-12-30', endDate: '2027-01-02' })).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
    expect(eventDays({ date: '2026-12-30', endDate: null })).toEqual(['2026-12-30']);
  });
});

describe('whenAndWhere', () => {
  it('always gives an exam a line', () => {
    expect(whenAndWhere({ type: 'exam', time: null, place: null })).toBe('Time not set yet');
    expect(whenAndWhere({ type: 'exam', time: null, place: 'Exam hall' })).toBe('Time not set yet, Exam hall');
    expect(whenAndWhere({ type: 'exam', time: '9:00 AM', place: 'Exam hall' })).toBe('9:00 AM, Exam hall');
  });

  it('says nothing for anything else without a time or place', () => {
    expect(whenAndWhere({ type: 'deadline', time: null, place: null })).toBeNull();
    expect(whenAndWhere({ type: 'mock', time: '4:00 PM', place: null })).toBe('4:00 PM');
  });
});

describe('eventDays and groupByDay', () => {
  it('lists every day of an event that spans days, across the end of a month', () => {
    expect(eventDays({ date: '2026-05-30', endDate: '2026-06-02' })).toEqual([
      '2026-05-30',
      '2026-05-31',
      '2026-06-01',
      '2026-06-02',
    ]);
  });

  it('gives the date alone without an end date, or with one that is not after it', () => {
    expect(eventDays({ date: '2026-05-31', endDate: null })).toEqual(['2026-05-31']);
    expect(eventDays({ date: '2026-05-31', endDate: '2026-05-31' })).toEqual(['2026-05-31']);
    expect(eventDays({ date: '2026-05-31', endDate: '2026-05-01' })).toEqual(['2026-05-31']);
  });

  it('puts a multi-day event under each of its days', () => {
    const week = ev('2026-05-29', { endDate: '2026-06-01', type: 'revision' });
    const exam = ev('2026-05-31');
    const byDay = groupByDay([week, exam]);
    expect([...byDay.keys()]).toEqual(['2026-05-29', '2026-05-30', '2026-05-31', '2026-06-01']);
    expect(ids(byDay.get('2026-05-31') ?? [])).toEqual([week.id, exam.id]);
  });
});

describe('aheadRows', () => {
  const today = '2026-10-19';
  it('places a window that has opened by its closing day and drops what is over', () => {
    const open = ev('2026-10-13', { endDate: '2026-10-24', type: 'careers' });
    const over = ev('2026-10-10', { endDate: '2026-10-18', type: 'careers' });
    const exam = ev('2026-10-23');
    const later = ev('2026-10-30');
    const rows = aheadRows([open, over, exam, later], today);
    expect(rows.map((r) => r.event.id)).toEqual([exam.id, open.id, later.id]);
    expect(rows.map((r) => r.day)).toEqual(['2026-10-23', '2026-10-24', '2026-10-30']);
    expect(rows.map((r) => r.closes)).toEqual([false, true, false]);
  });
  it('lists a window that opens today by its first day', () => {
    const w = ev(today, { endDate: '2026-10-25', type: 'deadline' });
    expect(aheadRows([w], today)).toEqual([{ event: w, day: today, closes: false }]);
  });
  it('leaves out the ids it is told to skip', () => {
    const headline = ev('2026-10-23');
    const next = ev('2026-10-26');
    expect(aheadRows([headline, next], today, new Set([headline.id])).map((r) => r.event.id)).toEqual([next.id]);
  });
});
