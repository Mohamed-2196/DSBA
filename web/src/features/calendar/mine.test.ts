import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dayOrder,
  findEvent,
  formMonthDay,
  isHidden,
  lastRepeat,
  monthDayOf,
  monthlyRule,
  myCalendar,
  occurrenceDays,
  planCardUrl,
  planEvent,
  occurrences,
  oneRowPerRepeat,
  reminderLabel,
  repeatHint,
  repeatLabel,
  repeatShort,
  seriesOf,
  timeRange,
} from './mine';
import { filterEvents } from './queries';
import type { CalendarEvent, CalendarPrefs, PersonalEvent, PlanCard } from './types';

const ID = '3f1c2b9e-1111-4222-8333-944455556666';
const own = (over: Partial<PersonalEvent> = {}): PersonalEvent => ({
  id: ID,
  title: 'Gym',
  date: '2026-10-05',
  endDate: null,
  startTime: null,
  endTime: null,
  place: null,
  notes: null,
  colour: 'teal',
  repeat: 'none',
  repeatUntil: null,
  monthDay: null,
  skipped: [],
  remind: null,
  createdAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  ...over,
});
const programme = (id: string, over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id,
  date: '2026-10-06',
  endDate: null,
  time: null,
  place: null,
  title: id,
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
  resit: false,
  ...over,
});
const prefs = (over: Partial<CalendarPrefs> = {}): CalendarPrefs => ({
  hiddenEvents: [],
  hiddenModules: [],
  hiddenTypes: [],
  showPlan: false,
  feedPath: null,
  ...over,
});
const card = (id: string, due: string, over: Partial<PlanCard> = {}): PlanCard => ({
  id,
  boardId: 'board-1',
  columnId: 'col-1',
  title: `Card ${id}`,
  description: null,
  dueDate: due,
  dueTime: null,
  remindBefore: null,
  priority: 'none',
  labelIds: [],
  checklist: [],
  link: null,
  planModuleId: null,
  planDate: null,
  coverUrl: null,
  attachmentCount: 0,
  commentCount: 0,
  createdAt: '2026-10-01T09:00:00Z',
  doneAt: null,
  boardName: 'Study',
  boardEmoji: null,
  boardColor: 'cobalt',
  due,
  ...over,
});

describe('occurrences', () => {
  it('lays out a weekly repeat until its end, and a year without one', () => {
    expect(occurrenceDays(own({ repeat: 'weekly', repeatUntil: '2026-10-26' }))).toEqual([
      '2026-10-05',
      '2026-10-12',
      '2026-10-19',
      '2026-10-26',
    ]);
    expect(lastRepeat(own({ repeat: 'daily' }))).toBe('2027-10-05');
    expect(occurrenceDays(own({ repeat: 'daily' }))).toHaveLength(366);
    expect(occurrenceDays(own())).toEqual(['2026-10-05']);
  });

  it('crosses month and year ends on the right days', () => {
    // Sunday 25 October, weekly: 1, 8, 15 and 22 November are Sundays too
    expect(occurrenceDays(own({ date: '2026-10-25', repeat: 'weekly', repeatUntil: '2026-11-22' }))).toEqual([
      '2026-10-25',
      '2026-11-01',
      '2026-11-08',
      '2026-11-15',
      '2026-11-22',
    ]);
    expect(occurrenceDays(own({ date: '2026-10-29', repeat: 'daily', repeatUntil: '2026-11-03' }))).toEqual([
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
      '2026-11-03',
    ]);
    expect(occurrenceDays(own({ date: '2026-12-30', repeat: 'daily', repeatUntil: '2027-01-02' }))).toEqual([
      '2026-12-30',
      '2026-12-31',
      '2027-01-01',
      '2027-01-02',
    ]);
    expect(occurrenceDays(own({ date: '2028-02-22', repeat: 'weekly', repeatUntil: '2028-03-07' }))).toEqual([
      '2028-02-22',
      '2028-02-29',
      '2028-03-07',
    ]); // a leap year
  });

  it('lays out a repeat every two weeks on its weekday, across a year end', () => {
    // Thursday 17 December 2026
    const lab = own({ date: '2026-12-17', repeat: 'fortnightly', repeatUntil: '2027-02-11' });
    expect(occurrenceDays(lab)).toEqual(['2026-12-17', '2026-12-31', '2027-01-14', '2027-01-28', '2027-02-11']);
    const year = occurrenceDays(own({ date: '2026-10-18', repeat: 'fortnightly' }));
    expect([year.length, year[year.length - 1]]).toEqual([27, '2027-10-17']); // a year without an end
  });

  it('puts a monthly repeat on its day, or on a shorter month’s last day', () => {
    expect(occurrenceDays(own({ date: '2027-01-31', repeat: 'monthly', repeatUntil: '2027-07-31' }))).toEqual([
      '2027-01-31',
      '2027-02-28',
      '2027-03-31',
      '2027-04-30',
      '2027-05-31',
      '2027-06-30',
      '2027-07-31',
    ]);
    // a leap year's February has its 29th
    expect(occurrenceDays(own({ date: '2028-01-31', repeat: 'monthly', repeatUntil: '2028-03-31' }))).toEqual([
      '2028-01-31',
      '2028-02-29',
      '2028-03-31',
    ]);
    for (const day of ['29', '30']) {
      const days = occurrenceDays(own({ date: `2027-01-${day}`, repeat: 'monthly', repeatUntil: `2028-04-${day}` }));
      expect(days.filter((d) => d.slice(5, 7) === '02')).toEqual(['2027-02-28', '2028-02-29']);
      expect(days.filter((d) => d.slice(5, 7) !== '02').every((d) => d.endsWith(`-${day}`))).toBe(true);
      expect(days).toHaveLength(16);
    }
    // its end: a day in between, or the day it falls on
    expect(occurrenceDays(own({ date: '2027-01-15', repeat: 'monthly', repeatUntil: '2027-04-14' })).pop()).toBe(
      '2027-03-15',
    );
    expect(occurrenceDays(own({ date: '2027-01-31', repeat: 'monthly', repeatUntil: '2027-04-30' })).pop()).toBe(
      '2027-04-30',
    );
    const year = own({ date: '2027-01-31', repeat: 'monthly' });
    expect([lastRepeat(year), occurrenceDays(year).length]).toEqual(['2028-01-31', 13]);
    // days taken off it
    expect(
      occurrenceDays(
        own({ date: '2027-01-31', repeat: 'monthly', repeatUntil: '2027-04-30', skipped: ['2027-02-28'] }),
      ),
    ).toEqual(['2027-01-31', '2027-03-31', '2027-04-30']);
  });

  it('keeps the 31st in a repeat that starts on a shorter month’s last day', () => {
    const later = own({ date: '2027-02-28', repeat: 'monthly', monthDay: 31, repeatUntil: '2027-05-31' });
    expect(monthDayOf(later)).toBe(31);
    expect(occurrenceDays(later)).toEqual(['2027-02-28', '2027-03-31', '2027-04-30', '2027-05-31']);
    const the28th = own({ date: '2027-02-28', repeat: 'monthly', repeatUntil: '2027-04-30' });
    expect(occurrenceDays(the28th)).toEqual(['2027-02-28', '2027-03-28', '2027-04-28']);
  });

  it('leaves out the days taken off a repeat, and lists one row per repeat', () => {
    const gym = own({
      date: '2026-10-25',
      repeat: 'weekly',
      repeatUntil: '2026-11-22',
      skipped: ['2026-11-01', '2026-11-15'],
    });
    expect(occurrenceDays(gym)).toEqual(['2026-10-25', '2026-11-08', '2026-11-22']);
    expect(occurrenceDays(own({ skipped: ['2026-10-05'] }))).toEqual(['2026-10-05']); // a single event has its day
    const other = { ...own({ title: 'Dentist', date: '2026-11-08' }), id: '0d4c2b9e-1111-4222-8333-944455556666' };
    const all = myCalendar([programme('exam-1', { date: '2026-11-08' })], [gym, other], null);
    expect(oneRowPerRepeat(all).map((e) => `${e.date} ${e.title}`)).toEqual([
      '2026-10-25 Gym',
      '2026-11-08 exam-1',
      '2026-11-08 Dentist',
    ]);
    expect(repeatShort(gym)).toBe('Sundays');
    expect(repeatShort({ ...gym, repeat: 'fortnightly' })).toBe('Every other Sunday');
    expect(repeatShort({ ...gym, repeat: 'monthly' })).toBe('Every month');
    expect(repeatShort(own({ repeat: 'daily' }))).toBe('Every day');
    expect(repeatShort(own())).toBeNull();
  });

  it('gives each occurrence the shape the lists take', () => {
    const [first, second] = occurrences([
      own({ repeat: 'weekly', repeatUntil: '2026-10-12', startTime: '18:00:00', endTime: '19:30:00', place: 'Gym' }),
    ]);
    expect(first).toMatchObject({
      id: `mine-${ID}-2026-10-05`,
      date: '2026-10-05',
      time: '18:00–19:30',
      place: 'Gym',
      year: null,
      type: 'event',
    });
    expect(second?.id).toBe(`mine-${ID}-2026-10-12`);
    expect(second?.mine?.id).toBe(ID);
    const [trip] = occurrences([own({ endDate: '2026-10-07' })]);
    expect(trip).toMatchObject({ id: `mine-${ID}`, endDate: '2026-10-07', time: null });
  });

  it('finds an occurrence, or the next one of its event', () => {
    const events = occurrences([own({ repeat: 'weekly', repeatUntil: '2026-10-26' })]);
    expect(seriesOf(`mine-${ID}-2026-10-12`)).toBe(ID);
    expect(seriesOf('2026-10-12-exam')).toBeNull();
    expect(findEvent(events, `mine-${ID}-2026-10-12`, '2026-10-01')?.date).toBe('2026-10-12');
    expect(findEvent(events, `mine-${ID}`, '2026-10-13')?.date).toBe('2026-10-19');
    expect(findEvent(events, `mine-${ID}`, '2027-01-01')?.date).toBe('2026-10-26');
    expect(findEvent(events, 'nothing', '2026-10-13')).toBeNull();
    // a link to a day taken off the repeat opens its next day
    const skipped = occurrences([own({ repeat: 'weekly', repeatUntil: '2026-10-26', skipped: ['2026-10-12'] })]);
    expect(findEvent(skipped, `mine-${ID}-2026-10-12`, '2026-10-06')?.date).toBe('2026-10-19');
  });
});

describe('on a device in a daylight-saving zone', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('still lands each repeat on its day when the clocks change', () => {
    vi.stubEnv('TZ', 'Europe/London'); // the clocks go back on Sunday 25 October 2026
    expect(new Date(2026, 9, 25, 12).getTimezoneOffset()).toBe(0); // the zone took
    expect(occurrenceDays(own({ date: '2026-10-18', repeat: 'weekly', repeatUntil: '2026-11-08' }))).toEqual([
      '2026-10-18',
      '2026-10-25',
      '2026-11-01',
      '2026-11-08',
    ]);
    expect(occurrenceDays(own({ date: '2026-10-24', repeat: 'daily', repeatUntil: '2026-10-27' }))).toEqual([
      '2026-10-24',
      '2026-10-25',
      '2026-10-26',
      '2026-10-27',
    ]);
    vi.stubEnv('TZ', 'America/Los_Angeles'); // and on Sunday 1 November there
    expect(occurrenceDays(own({ date: '2026-10-25', repeat: 'weekly', repeatUntil: '2026-11-15' }))).toEqual([
      '2026-10-25',
      '2026-11-01',
      '2026-11-08',
      '2026-11-15',
    ]);
    expect(occurrenceDays(own({ date: '2026-10-25', repeat: 'fortnightly', repeatUntil: '2026-11-22' }))).toEqual([
      '2026-10-25',
      '2026-11-08',
      '2026-11-22',
    ]);
    vi.stubEnv('TZ', 'America/Santiago'); // the clocks go forward at midnight on Sunday 6 September 2026
    expect(occurrenceDays(own({ date: '2026-08-06', repeat: 'monthly', repeatUntil: '2026-10-06' }))).toEqual([
      '2026-08-06',
      '2026-09-06',
      '2026-10-06',
    ]);
    expect(occurrenceDays(own({ date: '2026-08-31', repeat: 'monthly', repeatUntil: '2026-11-30' }))).toEqual([
      '2026-08-31',
      '2026-09-30',
      '2026-10-31',
      '2026-11-30',
    ]);
  });
});

describe('a day on the month grid', () => {
  it('puts what starts that day first: exams and deadlines, their own events by time, other dates, then running windows', () => {
    const window = programme('window', { type: 'careers', date: '2026-10-13', endDate: '2026-10-24' });
    const deadline = programme('deadline', { type: 'deadline', date: '2026-10-20' });
    const mock = programme('mock', { type: 'mock', date: '2026-10-20' });
    const exam = programme('exam', { date: '2026-10-20' });
    const [late] = occurrences([own({ title: 'Late', date: '2026-10-20', startTime: '18:00:00' })]);
    const [early] = occurrences([
      {
        ...own({ title: 'Early', date: '2026-10-20', startTime: '08:00:00' }),
        id: '1d4c2b9e-1111-4222-8333-944455556666',
      },
    ]);
    const [allDay] = occurrences([
      { ...own({ title: 'All day', date: '2026-10-20' }), id: '2d4c2b9e-1111-4222-8333-944455556666' },
    ]);
    if (!late || !early || !allDay) throw new Error('no occurrence');
    const order = dayOrder([window, mock, deadline, late, exam, early, allDay], '2026-10-20').map((e) => e.title);
    expect(order).toEqual(['deadline', 'exam', 'All day', 'Early', 'Late', 'mock', 'window']);
    expect(dayOrder([window], '2026-10-13').map((e) => e.title)).toEqual(['window']); // its first day
  });
});

describe('labels', () => {
  it('says when, how often and when it reminds', () => {
    expect(timeRange({ startTime: '09:05:00', endTime: null })).toBe('09:05');
    expect(timeRange({ startTime: null, endTime: null })).toBeNull();
    expect(repeatLabel(own({ repeat: 'weekly', repeatUntil: '2026-12-31' }))).toBe('Every week until 31 December 2026');
    expect(repeatLabel(own({ repeat: 'daily' }))).toBe('Every day for a year');
    expect(repeatLabel(own({ repeat: 'fortnightly', repeatUntil: '2026-12-31' }))).toBe(
      'Every two weeks until 31 December 2026',
    );
    expect(repeatLabel(own({ repeat: 'monthly' }))).toBe('Every month for a year');
    expect(reminderLabel(30, false)).toBe('30 minutes before');
    expect(reminderLabel(1440, true)).toBe('The day before, at 9:00');
    expect(reminderLabel(null, true)).toBeNull();
  });

  it('says which day a monthly repeat falls on, and where in a month without it', () => {
    expect(monthlyRule(18)).toBe('On the 18th of every month.');
    expect(monthlyRule(1)).toBe('On the 1st of every month.');
    expect(monthlyRule(28)).toBe('On the 28th of every month.');
    expect(monthlyRule(29)).toBe('On the 29th of every month, or the last day of February.');
    expect(monthlyRule(30)).toBe('On the 30th of every month, or the last day of February.');
    expect(monthlyRule(31)).toBe('On the 31st of every month, or the last day of shorter months.');
  });

  it('says what the repeat chosen in the form means', () => {
    // Sunday 18 October 2026
    expect(repeatHint('weekly', '2026-10-18', 18)).toBe('Every Sunday.');
    expect(repeatHint('fortnightly', '2026-10-18', 18)).toBe('Every other Sunday.');
    expect(repeatHint('monthly', '2027-01-31', 31)).toBe(
      'On the 31st of every month, or the last day of shorter months.',
    );
    expect(repeatHint('daily', '2026-10-18', 18)).toBeUndefined();
    expect(repeatHint('none', '2026-10-18', 18)).toBeUndefined();
  });

  it('keeps a monthly repeat’s day of the month while the form keeps its first day', () => {
    const rent = own({ date: '2027-01-31', repeat: 'monthly' });
    expect(formMonthDay(null, '2027-02-28', '2027-02-28')).toBe(28); // a new event
    expect(formMonthDay(rent, '2027-01-31', '2027-01-31')).toBe(31); // the whole repeat
    expect(formMonthDay(rent, '2027-02-28', '2027-02-28')).toBe(31); // from 28 February on
    expect(formMonthDay(rent, '2027-02-28', '2027-03-05')).toBe(5); // moved
    expect(formMonthDay(own({ date: '2027-01-31', repeat: 'weekly' }), '2027-01-31', '2027-01-31')).toBe(31);
    const later = own({ date: '2027-02-28', repeat: 'monthly', monthDay: 31 });
    expect(formMonthDay(later, '2027-02-28', '2027-02-28')).toBe(31);
    expect(formMonthDay(later, '2027-02-28', '2027-02-27')).toBe(27);
  });
});

describe('the student’s calendar', () => {
  it('leaves out hidden dates, modules and types, and adds their own events', () => {
    const exam = programme('exam-1');
    const mock = programme('mock-1', { type: 'mock' });
    const stats = programme('stats-1', { type: 'revision', moduleId: 'statistics' });
    const kept = programme('kept-1', { type: 'deadline' });
    const p = prefs({ hiddenEvents: ['exam-1'], hiddenTypes: ['mock'], hiddenModules: ['statistics'] });
    expect([exam, mock, stats].map((e) => isHidden(e, p))).toEqual([true, true, true]);
    const all = myCalendar([exam, mock, stats, kept], [own()], p);
    expect(all.map((e) => e.id)).toEqual([`mine-${ID}`, 'kept-1']);
    expect(myCalendar([exam], [], null).map((e) => e.id)).toEqual(['exam-1']);
  });

  it('shows their own events in every cohort, and alone with the "mine" filter', () => {
    const all = myCalendar([programme('y1', { year: 1 }), programme('y2')], [own()], null);
    expect(filterEvents(all, { year: 2 }).map((e) => e.id)).toEqual([`mine-${ID}`, 'y2']);
    expect(filterEvents(all, { year: 2, types: new Set(['mine']) }).map((e) => e.id)).toEqual([`mine-${ID}`]);
    expect(filterEvents(all, { year: 2, types: new Set(['exam']) }).map((e) => e.id)).toEqual(['y2']);
  });

  it('adds their plan only while they show it, alone with the "plan" filter', () => {
    const cards = [card('c2', '2026-10-24', { dueTime: '18:30:00' }), card('c1', '2026-10-22')];
    const exam = programme('y2', { date: '2026-10-23' });
    expect(myCalendar([exam], [], prefs(), cards).map((e) => e.id)).toEqual(['y2']);
    const all = myCalendar([exam], [], prefs({ showPlan: true }), cards);
    expect(all.map((e) => e.id)).toEqual(['plan-c1', 'y2', 'plan-c2']);
    expect(filterEvents(all, { year: 1 }).map((e) => e.id)).toEqual(['plan-c1', 'plan-c2']);
    expect(filterEvents(all, { year: 2, types: new Set(['plan']) }).map((e) => e.id)).toEqual(['plan-c1', 'plan-c2']);
    expect(filterEvents(all, { year: 2, types: new Set(['exam']) }).map((e) => e.id)).toEqual(['y2']);
    expect(isHidden(all[0], prefs({ hiddenTypes: ['event'] }))).toBe(false);
  });

  it('lays a card out on its day, with its time, and links it to its board', () => {
    const e = planEvent(card('c2', '2026-10-24', { dueTime: '18:30:00', planModuleId: 'statistics' }));
    expect([e.date, e.time, e.endDate, e.moduleId, e.plan?.boardName]).toEqual([
      '2026-10-24',
      '18:30',
      null,
      null,
      'Study',
    ]);
    expect(planCardUrl({ id: 'c2', boardId: 'b 1' })).toBe('/board?board=b%201&card=c2');
  });

  it('puts the plan after their own events on a busy day', () => {
    const day = '2026-10-24';
    const order = dayOrder(
      [
        programme('rev', { type: 'revision', date: day }),
        planEvent(card('c1', day)),
        ...occurrences([own({ date: day })]),
        programme('ex', { date: day }),
      ],
      day,
    );
    expect(order.map((e) => e.id)).toEqual(['ex', `mine-${ID}`, 'plan-c1', 'rev']);
  });
});
