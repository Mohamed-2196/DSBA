import { describe, expect, it } from 'vitest';
import type { SearchResults } from '../../api/types';
import { runSearch, type SearchInput } from './search';

const base: SearchInput = {
  query: '',
  year: 2,
  theme: 'light',
  expanded: new Set(),
  recent: [],
  results: undefined,
  getModule: () => null,
  getModulesForYear: () => [],
  isOn: () => true,
  now: new Date('2026-10-13T09:00:00+03:00'),
};

const ids = (r: ReturnType<typeof runSearch>) => r.groups.flatMap((g) => g.items.map((i) => i.id));

const thread = { type: 'thread', id: 't1', title: 'MGF help', snippet: null, url: '/forum/mgf-help', meta: null, date: null } as const;
const file = { type: 'library', id: 'f1', title: 'MGF notes', snippet: null, url: '/library/f1', meta: null, date: null } as const;
const results = (over: Partial<SearchResults> = {}): SearchResults => ({ query: 'mgf', threads: [], library: [], issues: [], modules: [], events: [], ...over });

describe('runSearch', () => {
  it('shows every page and quick action while every feature is on', () => {
    const r = ids(runSearch(base));
    expect(r).toContain('page:/calendar');
    expect(r).toContain('action:new-thread');
    expect(r).toContain('action:upload');
  });

  it('leaves out pages and actions of switched-off features', () => {
    const r = ids(runSearch({ ...base, isOn: (f) => f !== 'calendar' && f !== 'forum' }));
    expect(r).not.toContain('page:/calendar');
    expect(r).not.toContain('page:/forum');
    expect(r).not.toContain('action:new-thread');
    expect(r).toContain('page:/library');
  });

  it('leaves out the upload action while library uploads are off', () => {
    const r = ids(runSearch({ ...base, isOn: (f) => f !== 'library.uploads' }));
    expect(r).not.toContain('action:upload');
    expect(r).toContain('page:/library');
  });

  it('leaves out matching actions of switched-off features', () => {
    const r = ids(runSearch({ ...base, query: 'noora', isOn: (f) => f !== 'noora' }));
    expect(r).not.toContain('action:noora');
  });

  it('leaves out search hits of switched-off features', () => {
    const r = runSearch({ ...base, query: 'mgf', isOn: (f) => f !== 'forum', results: results({ threads: [thread], library: [file] }) });
    expect(r.groups.find((g) => g.id === 'threads')).toBeUndefined();
    expect(r.groups.find((g) => g.id === 'files')?.items.map((i) => i.id)).toEqual(['library:f1']);
  });

  it('offers only the fallbacks of features that are on', () => {
    const r = ids(runSearch({ ...base, query: 'zzzz', isOn: (f) => f !== 'forum', results: results() }));
    expect(r).toEqual(['fallback:library']);
  });
});
