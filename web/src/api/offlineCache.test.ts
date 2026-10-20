import { describe, expect, it } from 'vitest';
import {
  OFFLINE_MAX_AGE,
  OFFLINE_MAX_ENTRIES,
  OFFLINE_MAX_SIZE,
  entryFor,
  keptData,
  offlineScope,
  ownerOf,
  prune,
  readSnapshot,
  type OfflineEntry,
} from './offlineCache';

describe('offlineScope: what is kept for reading offline', () => {
  it.each([
    [['modules'], 'shared'],
    [['modules', 'detail', 'm1'], 'shared'],
    [['modules', 'files', 'm1', 'paper', 6], 'owner'],
    [['library', 'list', 'pages', {}, 20], 'owner'],
    [['library', 'list', 'page', { moduleId: 'm1', starred: true }, 6], 'owner'],
    [['library', 'facets'], 'owner'],
    [['library', 'item', 'some-paper'], 'owner'],
    [['library', 'papers', 'm1'], 'owner'],
    [['library', 'questions', 'paper', 'i1'], 'owner'],
    [['library', 'questions', 'module', 'm1', false], 'owner'],
    [['forum', 'list', { sort: 'hot' }, 20], 'owner'],
    [['forum', 'thread', 'a-thread'], 'owner'],
    [['forum', 'hot', { n: 5, year: 2 }], 'owner'],
    [['forum', 'meta'], 'owner'],
    [['calendar', 'events', {}], 'owner'],
    [['calendar', 'upcoming', { n: 5, year: null }], 'owner'],
    [['papers', 'choices'], 'owner'],
    [['progress', 'u1'], 'owner'],
    [['newsletter', 'list', { drafts: false }], 'owner'],
    [['guides'], 'owner'],
    [['site'], 'owner'],
    [['home', { year: 2, picks: '' }], 'owner'],
    [['me'], 'owner'],
  ])('keeps %j (%s)', (key, scope) => {
    expect(offlineScope(key)).toBe(scope);
  });

  it.each([
    // sessions, the account, admin screens and queues
    [['account', 'sessions']],
    [['admin', 'stats']],
    [['admin', 'users']],
    [['reports', 'open']],
    [['library', 'list', 'pages', { status: 'pending' }, 20]],
    [['library', 'list', 'pages', { mine: true }, 20]],
    [['library', 'questions', 'flagged']],
    [['features']],
    // short-lived signed file links and the private calendar feed address
    [['library', 'file', 'i1']],
    [['calendar', 'mine', 'settings']],
    // the student's own events and forum lists: they say what they asked, anonymous questions too (SEC-53)
    [['calendar', 'mine', 'events']],
    [['forum', 'list', { yours: true }, 20]],
    [['forum', 'list', { mine: true }, 20]],
    // personal tools with their own storage, searches, notifications
    [['notes', 'one', 'n1']],
    [['notifications']],
    [['search', 'q']],
    [['forum', 'similar', 'how do i']],
    [['newsletter', 'list', { drafts: true }]],
    [['newsletter', 'issue', 'issue-1']],
    [['site', 'edit']],
    [['guides', 'edit']],
    [['progress', 'write']],
    [['me', 'extra']],
    [['modules', 'something-else']],
    [['boards']],
    [[]],
  ])('never keeps %j', (key) => {
    expect(offlineScope(key)).toBeNull();
  });
});

describe('keptData', () => {
  it('keeps the signed-in person without their email or phone', () => {
    const me = { id: 'u1', displayName: 'Test Student', email: 'student@example.com', phone: '+97300000000', year: 2 };
    expect(keptData(['me'], me)).toEqual({ id: 'u1', displayName: 'Test Student', email: null, phone: null, year: 2 });
  });

  it('keeps nothing for a guest or missing data', () => {
    expect(keptData(['me'], null)).toBeUndefined();
    expect(keptData(['forum', 'meta'], undefined)).toBeUndefined();
  });
});

describe('ownerOf', () => {
  it('is the account id, or guest', () => {
    expect(ownerOf({ id: 'u1' })).toBe('u1');
    expect(ownerOf(null)).toBe('guest');
    expect(ownerOf(undefined)).toBe('guest');
  });
});

describe('entryFor', () => {
  it('measures what it keeps and refuses what is never kept', () => {
    expect(entryFor('h', ['forum', 'meta'], { a: 1 }, 5)).toEqual({
      hash: 'h',
      key: ['forum', 'meta'],
      data: { a: 1 },
      updatedAt: 5,
      size: 7,
    });
    expect(entryFor('h', ['account'], { a: 1 }, 5)).toBeNull();
  });

  it('refuses data that is not JSON or too big to keep', () => {
    const loop: Record<string, unknown> = {};
    loop.self = loop;
    expect(entryFor('h', ['forum', 'meta'], loop, 5)).toBeNull();
    expect(entryFor('h', ['forum', 'meta'], 'x'.repeat(OFFLINE_MAX_SIZE + 1), 5)).toBeNull();
  });
});

const entry = (hash: string, updatedAt: number, size = 10): OfflineEntry => ({
  hash,
  key: ['forum', 'thread', hash],
  data: {},
  updatedAt,
  size,
});

describe('prune', () => {
  const now = 1_000_000_000_000;

  it('drops entries older than a week, newest first', () => {
    const kept = prune([entry('old', now - OFFLINE_MAX_AGE - 1), entry('a', now - 10), entry('b', now - 5)], now);
    expect(kept.map((e) => e.hash)).toEqual(['b', 'a']);
  });

  it('keeps within the size cap, the newest first', () => {
    const big = OFFLINE_MAX_SIZE / 2;
    const kept = prune([entry('a', now - 3, big), entry('b', now - 2, big), entry('c', now - 1, big)], now);
    expect(kept.map((e) => e.hash)).toEqual(['c', 'b']);
  });

  it('keeps within the count cap', () => {
    const many = Array.from({ length: OFFLINE_MAX_ENTRIES + 5 }, (_, i) => entry(`e${i}`, now - i));
    expect(prune(many, now)).toHaveLength(OFFLINE_MAX_ENTRIES);
  });
});

describe('readSnapshot', () => {
  const now = 1_000_000_000_000;

  it('reads a stored snapshot back, pruned', () => {
    const raw = {
      v: 1,
      owner: 'u1',
      liveAt: now - 5,
      entries: [entry('a', now - 1), entry('old', now - OFFLINE_MAX_AGE - 1)],
    };
    expect(readSnapshot(raw, now)).toEqual({ v: 1, owner: 'u1', liveAt: now - 5, entries: [entry('a', now - 1)] });
    // a snapshot without liveAt was never seen live: its own entries don't show offline
    expect(readSnapshot({ ...raw, liveAt: undefined }, now)?.liveAt).toBe(0);
  });

  it('drops entries whose keys are no longer kept, and malformed ones', () => {
    const raw = {
      v: 1,
      owner: 'u1',
      entries: [{ ...entry('a', now - 1), key: ['account', 'sessions'] }, { hash: 'b' }, entry('c', now - 1)],
    };
    expect(readSnapshot(raw, now)?.entries.map((e) => e.hash)).toEqual(['c']);
  });

  it('refuses anything that is not a snapshot', () => {
    expect(readSnapshot(undefined, now)).toBeNull();
    expect(readSnapshot({ v: 2, owner: 'u1', entries: [] }, now)).toBeNull();
    expect(readSnapshot({ v: 1, entries: [] }, now)).toBeNull();
  });
});
