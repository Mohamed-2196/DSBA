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
  offers: { threads: true, upload: true },
  now: new Date('2026-10-13T09:00:00+03:00'),
};

const ids = (r: ReturnType<typeof runSearch>) => r.groups.flatMap((g) => g.items.map((i) => i.id));

const thread = { type: 'thread', id: 't1', title: 'MGF help', snippet: null, url: '/forum/mgf-help', meta: null, date: null, page: null } as const;
const file = { type: 'library', id: 'f1', title: 'MGF notes', snippet: null, url: '/library/f1', meta: null, date: null, page: null } as const;
const results = (over: Partial<SearchResults> = {}): SearchResults => ({ query: 'mgf', threads: [], library: [], issues: [], modules: [], lessons: [], events: [], ...over });

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

  it('offers Start a thread and Upload a file only when the person may do them', () => {
    const r = ids(runSearch({ ...base, offers: { threads: false, upload: false } }));
    expect(r).not.toContain('action:new-thread');
    expect(r).not.toContain('action:upload');
    expect(r).toContain('page:/forum');
    expect(r).toContain('page:/library');
    const asks = ids(runSearch({ ...base, query: 'zzzz', offers: { threads: false, upload: true }, results: results() }));
    expect(asks).toEqual(['fallback:library', 'fallback:forum']);
  });

  it('leaves out matching actions of switched-off features', () => {
    const r = ids(runSearch({ ...base, query: 'noora', isOn: (f) => f !== 'noora' }));
    expect(r).not.toContain('action:noora');
    expect(r).not.toContain('action:ask-noora');
  });

  it('offers to ask Mini Noora, and to hide or show her', () => {
    expect(ids(runSearch({ ...base, query: 'ask noora' }))).toContain('action:ask-noora');
    expect(ids(runSearch({ ...base, query: 'noora' }))).toContain('action:noora');
  });

  it('opens the sites Site settings name, by their labels', () => {
    const portals = [
      { id: 'myclass', label: 'BIBF MyClass', href: 'https://myclass.bibf.com/' },
      { id: 'uol', label: 'UoL student portal', href: 'https://my.london.ac.uk/' },
    ] as const;
    const found = runSearch({ ...base, query: 'myclass', portals }).groups.flatMap((g) => g.items);
    expect(found.find((i) => i.id === 'action:myclass')).toMatchObject({ title: 'Open BIBF MyClass', href: 'https://myclass.bibf.com/' });
    expect(ids(runSearch({ ...base, query: 'university of london', portals }))).toContain('action:uol');
    expect(ids(runSearch({ ...base, query: 'myclass' }))).not.toContain('action:myclass');
  });

  it('leaves out search hits of switched-off features', () => {
    const r = runSearch({ ...base, query: 'mgf', isOn: (f) => f !== 'forum', results: results({ threads: [thread], library: [file] }) });
    expect(r.groups.find((g) => g.id === 'threads')).toBeUndefined();
    expect(r.groups.find((g) => g.id === 'files')?.items.map((i) => i.id)).toEqual(['library:f1']);
  });

  it('lists chapters and videos under Lessons, after modules', () => {
    const chapter = { type: 'lesson', id: 'c1', title: 'Supply and Demand', snippet: null, url: '/modules/economics/lessons/l1', meta: 'EC1002 · Chapter', date: null, page: null } as const;
    const video = { type: 'lesson', id: 'l9', title: 'Law of Comparative Advantage', snippet: 'The Economic Problem', url: '/modules/economics/lessons/l9', meta: 'EC1002 · Video', date: null, page: null } as const;
    const r = runSearch({ ...base, query: 'supply', results: results({ lessons: [chapter, video] }) });
    const lessons = r.groups.find((g) => g.id === 'lessons');
    expect(lessons?.label).toBe('Lessons');
    expect(lessons?.items.map((i) => [i.id, i.subtitle, 'to' in i ? i.to : null])).toEqual([
      ['lesson:c1', 'EC1002 chapter', '/modules/economics/lessons/l1'],
      ['lesson:l9', 'EC1002 video, in The Economic Problem', '/modules/economics/lessons/l9'],
    ]);
  });

  it('shows the page a file matched on', () => {
    const inside = { ...file, snippet: 'Derive the Cramér–Rao bound', meta: 'ST2133 · Past paper · Page 3', url: '/library/f1?page=3', page: 3 };
    const r = runSearch({ ...base, query: 'cramer', results: results({ library: [inside] }) });
    const hit = r.groups.find((g) => g.id === 'files')?.items[0];
    expect(hit?.subtitle).toBe('ST2133, Past paper, Page 3: Derive the Cramér–Rao bound');
    expect(hit && 'to' in hit ? hit.to : null).toBe('/library/f1?page=3');
  });

  it('offers only the fallbacks of features that are on', () => {
    const r = ids(runSearch({ ...base, query: 'zzzz', isOn: (f) => f !== 'forum', results: results() }));
    expect(r).toEqual(['fallback:library']);
  });
});
