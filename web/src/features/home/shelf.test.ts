import { describe, expect, it } from 'vitest';
import { parseDay } from '../../lib/dates';
import { examLine, shelfTiles, type ShelfFacts } from './shelf';

const facts = (patch: Partial<ShelfFacts> = {}): ShelfFacts => ({
  modules: 4,
  notes: 2,
  signedIn: true,
  replies: 3,
  exam: { days: 3, date: parseDay('2026-10-22') },
  on: () => true,
  ...patch,
});

describe('examLine', () => {
  it('names the day within the week, the date after it', () => {
    const thu = parseDay('2026-10-22');
    expect(examLine(0, thu)).toBe('Exam today');
    expect(examLine(1, thu)).toBe('Exam tomorrow');
    expect(examLine(3, thu)).toBe('Exam Thu');
    expect(examLine(14, parseDay('2026-11-03'))).toBe('Exam 3 Nov');
  });
});

describe('shelfTiles', () => {
  it('gives each section its live line, news in its colour', () => {
    const tiles = shelfTiles(facts());
    expect(tiles.map((t) => [t.label, t.line, t.news])).toEqual([
      ['Modules', '4 modules', false],
      ['Notebook', '2 notes', false],
      ['Forum', '3 replies', true],
      ['Calendar', 'Exam Thu', true],
    ]);
  });

  it('says what a section is for when there is nothing new', () => {
    const tiles = shelfTiles(facts({ notes: 0, replies: 0, exam: null, modules: 1 }));
    expect(tiles.map((t) => t.line)).toEqual(['1 module', 'Start a note', 'Ask a question', 'Your dates']);
    expect(tiles.some((t) => t.news)).toBe(false);
  });

  it('waits for counts, asks nothing of a guest, and leaves out sections that are off', () => {
    const tiles = shelfTiles(facts({ signedIn: false, notes: null, on: (s) => s !== 'forum' }));
    expect(tiles.find((t) => t.section === 'notebook')?.line).toBe('Your notes');
    expect(shelfTiles(facts({ notes: null })).find((t) => t.section === 'notebook')?.line).toBeNull();
    expect(tiles.map((t) => t.section)).not.toContain('forum');
  });

  it('does not count an exam two weeks off as news', () => {
    const [cal] = shelfTiles(facts({ exam: { days: 14, date: parseDay('2026-11-03') }, on: (s) => s === 'calendar' }));
    expect(cal?.news).toBe(false);
  });
});
