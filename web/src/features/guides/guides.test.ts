import { describe, expect, it } from 'vitest';
import { doneSteps, nextDated, toggleStep } from './guides';

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
