import { describe, expect, it } from 'vitest';
import { weekRange, weeksAway } from './weeks';

describe('weeksAway', () => {
  it('says how far a week is', () => {
    expect([0, 1, 3].map(weeksAway)).toEqual(['This week', 'Next week', 'In 3 weeks']);
  });
});

describe('weekRange', () => {
  it('names a week from Sunday to Saturday', () => {
    expect(weekRange('2026-10-18')).toBe('18–24 Oct');
    expect(weekRange('2026-10-25')).toBe('25–31 Oct');
    expect(weekRange('2026-11-29')).toBe('29 Nov – 5 Dec');
  });
});
