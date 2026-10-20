import { describe, expect, it } from 'vitest';
import type { TimetableRow } from '../../../api/types';
import { defaultSource, draftsOf, noticeLine, refusedRows, rowIn, savedLine, summaryLine, wasLine } from './timetable';

const row = (over: Partial<TimetableRow> = {}): TimetableRow => ({
  line: 2,
  text: 'ST2134 13/10/2026 10:00 Hall A',
  unitCode: 'ST2134',
  date: '2026-10-13',
  time: '10:00 AM',
  place: 'Hall A',
  moduleId: 'advanced-stats-inferential',
  moduleName: 'Advanced Statistics: Statistical Inference',
  year: 2,
  eventId: 'st2134-exam',
  action: 'update',
  was: null,
  problems: [],
  ...over,
});

describe('the timetable', () => {
  it('turns rows into drafts and back, leaving empty fields out', () => {
    const [d] = draftsOf([row({ time: null, place: null })]);
    expect(d).toEqual({ key: '2-0', unitCode: 'ST2134', date: '2026-10-13', time: '', place: '' });
    expect(rowIn({ ...d, place: '  Hall B ' })).toEqual({
      unitCode: 'ST2134',
      date: '2026-10-13',
      time: null,
      place: 'Hall B',
    });
    expect(rowIn({ key: 'x', unitCode: ' ', date: '', time: '', place: '' })).toEqual({
      unitCode: null,
      date: null,
      time: null,
      place: null,
    });
  });

  it('sums up what saving will do', () => {
    const rows = [row(), row(), row({ action: 'new' }), row({ action: 'same' }), row({ action: 'fix' })];
    expect(summaryLine(rows)).toBe('5 rows: 2 change an exam, 1 new exam, 1 the same, 1 to fix.');
    expect(summaryLine([row()])).toBe('1 row: 1 changes an exam.');
    expect(summaryLine([])).toBe('0 rows.');
  });

  it('says what the calendar has now', () => {
    expect(wasLine(row())).toBeNull();
    expect(wasLine(row({ was: { date: '2026-10-12', time: null, place: null, sample: true } }))).toBe(
      'On the calendar: Mon 12 Oct, time not set, no venue. Not confirmed.',
    );
    expect(wasLine(row({ was: { date: '2026-10-12', time: '9:00 AM', place: 'Hall B', sample: false } }))).toBe(
      'On the calendar: Mon 12 Oct, 9:00 AM, Hall B.',
    );
  });

  it('finds the rows a save refused', () => {
    expect(refusedRows({ 'rows.1': 'No date. Add it.', 'rows.12.unitCode': 'x', source: 'y' })).toEqual(
      new Map([
        [1, 'No date. Add it.'],
        [12, 'x'],
      ]),
    );
  });

  it('says what each year was told, and what was saved', () => {
    expect(noticeLine({ year: 2, exams: 3, notice: 'sent', told: 41 })).toBe('Year 2: 3 exams, 41 people told.');
    expect(noticeLine({ year: 1, exams: 1, notice: 'limit', told: 0 })).toBe(
      'Year 1: 1 exam. They had a timetable notice today already, so not again.',
    );
    expect(noticeLine({ year: null, exams: 2, notice: 'none', told: 0 })).toBe('All years: 2 exams. Nobody was told.');
    expect(savedLine({ created: 3, updated: 9, unchanged: 1 })).toBe('Saved: 3 new exams and 9 changed.');
    expect(savedLine({ created: 0, updated: 1, unchanged: 0 })).toBe('Saved: 1 changed.');
    expect(savedLine({ created: 0, updated: 0, unchanged: 4 })).toBe(
      'Nothing changed: every exam already had these details.',
    );
  });

  it('names the source by the day', () => {
    expect(defaultSource(new Date(2026, 9, 20))).toBe('Exam timetable, 20 October 2026');
  });
});
