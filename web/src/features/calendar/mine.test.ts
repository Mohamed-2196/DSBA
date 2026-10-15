import { describe, expect, it } from 'vitest';
import { findEvent, isHidden, lastRepeat, myCalendar, occurrenceDays, occurrences, reminderLabel, repeatLabel, seriesOf, timeRange } from './mine';
import { filterEvents } from './queries';
import type { CalendarEvent, CalendarPrefs, PersonalEvent } from './types';

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
  ...over,
});
const prefs = (over: Partial<CalendarPrefs> = {}): CalendarPrefs => ({ hiddenEvents: [], hiddenModules: [], hiddenTypes: [], feedPath: null, ...over });

describe('occurrences', () => {
  it('lays out a weekly repeat until its end, and a year without one', () => {
    expect(occurrenceDays(own({ repeat: 'weekly', repeatUntil: '2026-10-26' }))).toEqual(['2026-10-05', '2026-10-12', '2026-10-19', '2026-10-26']);
    expect(lastRepeat(own({ repeat: 'daily' }))).toBe('2027-10-05');
    expect(occurrenceDays(own({ repeat: 'daily' }))).toHaveLength(366);
    expect(occurrenceDays(own())).toEqual(['2026-10-05']);
  });

  it('gives each occurrence the shape the lists take', () => {
    const [first, second] = occurrences([own({ repeat: 'weekly', repeatUntil: '2026-10-12', startTime: '18:00:00', endTime: '19:30:00', place: 'Gym' })]);
    expect(first).toMatchObject({ id: `mine-${ID}-2026-10-05`, date: '2026-10-05', time: '18:00–19:30', place: 'Gym', year: null, type: 'event' });
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
  });
});

describe('labels', () => {
  it('says when, how often and when it reminds', () => {
    expect(timeRange({ startTime: '09:05:00', endTime: null })).toBe('09:05');
    expect(timeRange({ startTime: null, endTime: null })).toBeNull();
    expect(repeatLabel(own({ repeat: 'weekly', repeatUntil: '2026-12-31' }))).toBe('Every week until 31 December 2026');
    expect(repeatLabel(own({ repeat: 'daily' }))).toBe('Every day for a year');
    expect(reminderLabel(30, false)).toBe('30 minutes before');
    expect(reminderLabel(1440, true)).toBe('The day before, at 9:00');
    expect(reminderLabel(null, true)).toBeNull();
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
});
