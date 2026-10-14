import { describe, expect, it } from 'vitest';
import { doneSteps, latestWithin, nextDated, startWindow, toggleStep } from './startHere';

const TERM = { month: 9, day: 14 };

describe('startWindow', () => {
  it('opens for six weeks from the first day of term', () => {
    expect(startWindow('2026-09-14', TERM, 6)).toEqual({ open: true, from: '2026-09-14', to: '2026-10-25' });
    expect(startWindow('2026-10-25', TERM, 6).open).toBe(true);
    expect(startWindow('2026-10-26', TERM, 6).open).toBe(false);
  });

  it('counts the days before term as last year’s', () => {
    expect(startWindow('2026-09-13', TERM, 6)).toEqual({ open: false, from: '2025-09-14', to: '2025-10-25' });
    expect(startWindow('2027-03-01', TERM, 6).from).toBe('2026-09-14');
  });
});

describe('nextDated', () => {
  const events = [
    { id: 'a', date: '2025-11-01', title: 'UoL application deadline', sample: false },
    { id: 'c', date: '2027-11-01', title: 'UoL Application Deadline', sample: true },
    { id: 'b', date: '2026-11-01', title: 'UoL application deadline', sample: true },
    { id: 'x', date: '2026-10-20', title: 'Business mock exam', sample: false },
  ];

  it('finds the next matching date, ignoring case and past ones', () => {
    expect(nextDated(events, 'uol application deadline', '2026-10-14')?.id).toBe('b');
    expect(nextDated(events, 'UoL application deadline', '2026-11-01')?.id).toBe('b');
  });

  it('is null when nothing matches', () => {
    expect(nextDated(events, 'Graduation', '2026-10-14')).toBeNull();
    expect(nextDated(events, '  ', '2026-10-14')).toBeNull();
  });
});

describe('ticks', () => {
  it('keeps only ids that are steps', () => {
    expect([...doneSteps(['portal', 'gone', 3, 'exams'], ['portal', 'exams'])]).toEqual(['portal', 'exams']);
    expect(doneSteps('nonsense', ['portal']).size).toBe(0);
  });

  it('ticks and unticks', () => {
    expect(toggleStep(['a'], 'b')).toEqual(['a', 'b']);
    expect(toggleStep(['a', 'b'], 'a')).toEqual(['b']);
    expect(toggleStep(null, 'a')).toEqual(['a']);
  });
});

describe('latestWithin', () => {
  const events = [
    { id: 'may', date: '2026-08-04', title: 'UoL results released', sample: false },
    { id: 'oct', date: '2027-01-07', title: 'UoL results released', sample: true },
    { id: 'old', date: '2026-07-30', title: 'UoL Results Released', sample: false },
    { id: 'x', date: '2026-08-05', title: 'Business mock exam', sample: false },
  ];

  it('finds the latest results date for two weeks from it', () => {
    expect(latestWithin(events, 'UoL results released', '2026-08-04', 2)?.id).toBe('may');
    expect(latestWithin(events, 'uol results released', '2026-08-17', 2)?.id).toBe('may');
    expect(latestWithin(events, 'UoL results released', '2026-08-18', 2)).toBeNull();
  });

  it('ignores dates still to come and empty titles', () => {
    expect(latestWithin(events, 'UoL results released', '2027-01-06', 2)).toBeNull();
    expect(latestWithin(events, ' ', '2026-08-04', 2)).toBeNull();
  });
});
