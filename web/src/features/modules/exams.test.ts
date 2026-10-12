import { describe, expect, it } from 'vitest';
import type { CalendarEvent } from '../calendar/public';
import { examInfo } from './exams';

const exam = (date: string): CalendarEvent => ({
  id: `${date}-st2133-exam`,
  date,
  endDate: null,
  time: null,
  place: null,
  title: 'ST2133 exam',
  type: 'exam',
  year: 2,
  moduleId: 'advanced-stats-distribution',
  unitCode: 'ST2133',
  sample: false,
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
