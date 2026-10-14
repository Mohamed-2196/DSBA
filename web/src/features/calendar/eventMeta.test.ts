import { describe, expect, it } from 'vitest';
import { applicationLine, sourceLine, windowLeft } from './eventMeta';

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
  expect(sourceLine({ source: 'UoL exam timetable', checkedOn: '2026-10-10' })).toMatch(/^Source: UoL exam timetable\. Checked .*10 October 2026\.$/);
});
