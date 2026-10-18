import { describe, expect, it } from 'vitest';
import { notEligible } from './seniors';

describe('notEligible', () => {
  it('says when a new Year 3 account can list itself', () => {
    expect(notEligible({ eligibleFrom: '2026-11-13T09:00:00Z' })).toBe(
      'New accounts can answer as seniors after 30 days. You can list yourself from 13 Nov 2026.',
    );
  });
  it('sends anyone else to their year', () => {
    expect(notEligible({ eligibleFrom: null })).toBe('Seniors are Year 3 students. Check your year under Profile.');
  });
});
