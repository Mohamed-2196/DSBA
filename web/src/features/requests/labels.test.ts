import { describe, expect, it } from 'vitest';
import { askedBy, awaitsAnswer, examYears, kindLabel, meTooLine, meTooOfMine, needsReply, parseKind, parseSort, parseStatus, statusOf, wantsLine } from './labels';

describe('request labels', () => {
  it('reads kinds, statuses and sorts from the URL, and ignores anything else', () => {
    expect(parseKind('paper')).toBe('paper');
    expect(parseKind('money')).toBeNull();
    expect(parseKind(null)).toBeNull();
    expect(parseStatus('planned')).toBe('planned');
    expect(parseStatus('removed')).toBeNull();
    expect(parseSort('newest')).toBe('newest');
    expect(parseSort('oldest')).toBe('me_too');
  });

  it('names kinds and statuses', () => {
    expect(kindLabel('event')).toBe('An event or a date');
    expect(statusOf('done').label).toBe('Done');
  });

  it('counts the requester with everyone who said me too', () => {
    expect(askedBy(0)).toBe('Asked by 1 student');
    expect(askedBy(4)).toBe('Asked by 5 students');
  });

  it('says who else wants it', () => {
    expect(meTooLine(0, false)).toBeNull();
    expect(meTooLine(1, false)).toBe('1 other wants this too');
    expect(meTooLine(3, false)).toBe('3 others want this too');
    expect(meTooLine(1, true)).toBe('You want this too');
    expect(meTooLine(2, true)).toBe('You and 1 other want this too');
    expect(meTooLine(4, true)).toBe('You and 3 others want this too');
  });

  it('asks for a reason only when declining', () => {
    expect(needsReply('declined')).toBe(true);
    expect(needsReply('planned')).toBe(false);
  });

  it('names the file a paper request wants', () => {
    expect(wantsLine({ wantedKind: 'past-paper', examYear: 2019, zone: 'B' })).toBe('Past paper · 2019 · Zone B');
    expect(wantsLine({ wantedKind: 'notes', examYear: null, zone: null })).toBe('Students’ notes');
    expect(wantsLine({ wantedKind: null, examYear: null, zone: null })).toBeNull();
  });

  it('lists exam years newest first and knows when a found file waits for an answer', () => {
    const years = examYears(new Date(2026, 9, 14));
    expect(years[0]).toBe(2026);
    expect(years.at(-1)).toBe(2010);
    const found = { id: 'x', slug: 'x', title: 'x', kind: 'past-paper' as const, examYear: null, zone: null };
    expect(awaitsAnswer({ found, status: 'open' })).toBe(true);
    expect(awaitsAnswer({ found, status: 'done' })).toBe(false);
    expect(awaitsAnswer({ found: null, status: 'open' })).toBe(false);
  });
});

describe('meTooOfMine', () => {
  it('shows the requester they asked, and how many joined them', () => {
    expect(meTooOfMine(0)).toBe('You asked');
    expect(meTooOfMine(1)).toBe('You and 1 other');
    expect(meTooOfMine(4)).toBe('You and 4 others');
  });
});
