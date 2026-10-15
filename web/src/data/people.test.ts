import { describe, expect, it } from 'vitest';
import { CONTRIBUTORS, contributorLine } from './people';

describe('contributorLine', () => {
  it('is the role, with the affiliation when there is one', () => {
    expect(contributorLine({ role: 'Lecture recordings', affiliation: 'BIBF faculty' })).toBe('Lecture recordings, BIBF faculty');
    expect(contributorLine({ role: 'Creator and maintainer', affiliation: null })).toBe('Creator and maintainer');
  });
  it('is null without a role', () => {
    expect(contributorLine({ role: null, affiliation: 'BIBF faculty' })).toBeNull();
  });
});

describe('CONTRIBUTORS', () => {
  it('lists the current contributors in order', () => {
    expect(CONTRIBUTORS.map((c) => c.name)).toEqual(['Mohamed Alnooh', 'Feras Alsadadi', 'Mohamed Hujairi']);
  });
});
