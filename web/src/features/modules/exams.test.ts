import { describe, expect, it } from 'vitest';
import type { CalendarEvent } from '../calendar/public';
import { examInfo, moduleSittings } from './exams';

const exam = (date: string, over: Partial<CalendarEvent> = {}): CalendarEvent => ({
  id: `${date}-st2133-exam`,
  date,
  endDate: null,
  time: null,
  place: null,
  duration: null,
  rules: null,
  source: null,
  checkedOn: null,
  employerId: null,
  title: 'ST2133 exam',
  type: 'exam',
  year: 2,
  moduleId: 'advanced-stats-distribution',
  unitCode: 'ST2133',
  sample: false,
  resit: false,
  ...over,
});

describe('examInfo', () => {
  it('says when the exam is, counted in calendar days', () => {
    expect(examInfo(exam('2026-10-30'), '2026-10-06')).toMatchObject({
      days: 24,
      date: '30 Oct',
      weekdayDate: 'Fri 30 Oct',
      weekday: 'Friday',
      relative: 'in 24 days',
      soon: false,
    });
  });

  it('is soon within two weeks, and says today and tomorrow', () => {
    expect(examInfo(exam('2026-10-20'), '2026-10-06')).toMatchObject({ days: 14, soon: true });
    expect(examInfo(exam('2026-10-07'), '2026-10-06')?.relative).toBe('tomorrow');
    expect(examInfo(exam('2026-10-06'), '2026-10-06')?.relative).toBe('today');
  });

  it('writes September as Sep, as the rest of the Hub does', () => {
    expect(examInfo(exam('2027-09-14'), '2027-09-01')?.weekdayDate).toBe('Tue 14 Sep');
  });

  it('has nothing to say without an exam', () => {
    expect(examInfo(null)).toBeNull();
    expect(examInfo(undefined)).toBeNull();
  });
});

describe('moduleSittings', () => {
  const resit = exam('2026-10-30', { id: 'resit', resit: true });
  const main = exam('2027-05-14', { id: 'main' });
  const none = new Set<string>();
  it('counts down to the main sitting for the module’s own year, and says the resit quietly', () => {
    const s = moduleSittings([resit, main], 2, none, '2026-10-20');
    expect(s.next?.event.id).toBe('main');
    expect(s.otherResit?.weekdayDate).toBe('Fri 30 Oct');
  });
  it('never falls back to the resit when the main sitting has no date yet', () => {
    const s = moduleSittings([resit], 2, none, '2026-10-20');
    expect(s.next).toBeNull();
    expect(s.otherResit?.event.id).toBe('resit');
    expect(moduleSittings([resit], null, none, '2026-10-20').next).toBeNull(); // no year: the module's own
  });
  it('counts down to the resit for the next year and for those resitting', () => {
    expect(moduleSittings([resit, main], 3, none, '2026-10-20')).toMatchObject({
      next: { event: { id: 'resit' } },
      otherResit: null,
    });
    const resitting = new Set(['advanced-stats-distribution']);
    expect(moduleSittings([resit, main], 2, resitting, '2026-10-20').next?.event.id).toBe('resit');
  });
});
