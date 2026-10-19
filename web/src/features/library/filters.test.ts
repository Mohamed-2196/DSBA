import { describe, expect, it } from 'vitest';
import { CLEAR_ALL, activeFilters, defaultSort, readSort, type FilterState } from './filters';

const none: FilterState = {
  year: 2,
  defaultYear: 2,
  module: null,
  kind: null,
  starred: false,
  mine: false,
  source: null,
};

describe('activeFilters', () => {
  it('lists nothing while the page is as it opens', () => {
    expect(activeFilters(none)).toEqual([]);
  });

  it('lists each filter that is set, with what removing it changes', () => {
    const set = activeFilters({ ...none, module: 'ST2133', kind: 'past-paper', starred: true, source: 'link' });
    expect(set.map((f) => [f.id, f.label])).toEqual([
      ['module', 'ST2133'],
      ['type', 'Past papers'],
      ['starred', 'Starred'],
      ['source', 'Links only'],
    ]);
    expect(set[0].patch).toEqual({ module: null });
  });

  it('counts the year only when it isn’t the one the page opens with', () => {
    expect(activeFilters({ ...none, year: null }).map((f) => f.label)).toEqual(['All years']);
    expect(activeFilters({ ...none, year: 3 }).map((f) => f.label)).toEqual(['Year 3']);
    expect(activeFilters({ ...none, year: null, defaultYear: null })).toEqual([]);
    expect(activeFilters({ ...none, year: 1, module: 'EC1002' }).map((f) => f.label)).toEqual(['EC1002']);
  });

  it('clears every filter but the search', () => {
    expect(Object.keys(CLEAR_ALL)).not.toContain('q');
    expect(Object.values(CLEAR_ALL).every((v) => v === null)).toBe(true);
  });
});

describe('sorts', () => {
  it('opens past papers at the newest sitting, searches at the best match, the rest at the most downloaded', () => {
    expect(defaultSort(false, 'past-paper')).toBe('sitting');
    expect(defaultSort(false, 'examiners-report')).toBe('sitting');
    expect(defaultSort(true, 'past-paper')).toBe('relevance');
    expect(defaultSort(false, 'notes')).toBe('popular');
    expect(defaultSort(false, null)).toBe('popular');
  });

  it('reads the URL’s sort, falling back when it doesn’t fit', () => {
    const plain = { searching: false, kind: null, module: false };
    expect(readSort(null, plain)).toBe('popular');
    expect(readSort('title', plain)).toBe('title');
    expect(readSort('relevance', plain)).toBe('popular');
    expect(readSort('sitting', plain)).toBe('popular');
    expect(readSort('sitting', { ...plain, module: true })).toBe('sitting');
    expect(readSort('nonsense', { ...plain, kind: 'past-paper' })).toBe('sitting');
    expect(readSort('relevance', { ...plain, searching: true })).toBe('relevance');
  });
});
