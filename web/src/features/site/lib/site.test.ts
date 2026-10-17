import { describe, expect, it } from 'vitest';
import { contributorLine, copyrightYears, httpsHref, notesInLibrary } from './site';

describe('contributorLine', () => {
  it('is the role, with the affiliation when there is one', () => {
    expect(contributorLine({ role: 'Lecture recordings', affiliation: 'BIBF faculty' })).toBe('Lecture recordings, BIBF faculty');
    expect(contributorLine({ role: 'Creator and maintainer', affiliation: null })).toBe('Creator and maintainer');
  });

  it('is null without a role', () => {
    expect(contributorLine({ role: null, affiliation: 'BIBF faculty' })).toBeNull();
  });
});

describe('copyrightYears', () => {
  it('runs from the launch year to this one', () => {
    expect(copyrightYears(2024, new Date('2026-10-17T12:00:00Z'))).toBe('2024–2026');
  });

  it('is one year in the launch year', () => {
    expect(copyrightYears(2026, new Date('2026-10-17T12:00:00Z'))).toBe('2026');
    expect(copyrightYears(2027, new Date('2026-10-17T12:00:00Z'))).toBe('2026');
  });
});

describe('notesInLibrary', () => {
  it('opens the module’s notes in the library', () => {
    expect(notesInLibrary('advanced-stats-distribution')).toBe('/library?module=advanced-stats-distribution&type=notes');
  });
});

describe('httpsHref', () => {
  it('passes https:// addresses and nothing else', () => {
    expect(httpsHref('https://myclass.bibf.com')).toBe('https://myclass.bibf.com/');
    expect(httpsHref('http://myclass.bibf.com')).toBeNull();
    expect(httpsHref('javascript:alert(1)')).toBeNull();
    expect(httpsHref('/about')).toBeNull();
    expect(httpsHref(null)).toBeNull();
  });
});
