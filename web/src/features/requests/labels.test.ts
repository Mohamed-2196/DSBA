import { describe, expect, it } from 'vitest';
import { kindLabel, meTooLine, needsReply, parseKind, parseSort, parseStatus, statusOf } from './labels';

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
});
