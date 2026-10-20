import { QueryClient, onlineManager } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import { ApiError } from './errors';
import { startOfflineCache, type OfflineCache, type SnapshotStore } from './offline';
import { OWNER_LIVE_MAX_AGE, entryFor, type OfflineSnapshot } from './offlineCache';

/** The store as a plain value, so a test reads what would be in IndexedDB. */
function memoryStore(initial?: OfflineSnapshot) {
  let value: OfflineSnapshot | undefined = initial;
  const store: SnapshotStore & { value: () => OfflineSnapshot | undefined } = {
    read: () => Promise.resolve(value),
    write: (s) => {
      value = structuredClone(s);
      return Promise.resolve();
    },
    clear: () => {
      value = undefined;
      return Promise.resolve();
    },
    value: () => value,
  };
  return store;
}

const ME = { id: 'u1', displayName: 'Test Student', email: 'student@example.com', phone: null };
const keys = (s: OfflineSnapshot | undefined) => (s?.entries ?? []).map((e) => JSON.stringify(e.key)).sort();

let running: OfflineCache[] = [];
afterEach(() => {
  for (const r of running) r.stop();
  running = [];
  onlineManager.setOnline(true);
});

async function start(store: SnapshotStore, now?: () => number) {
  const qc = new QueryClient();
  const cache = await startOfflineCache(qc, store, { delay: 60_000, now });
  running.push(cache);
  return { qc, cache };
}

describe('startOfflineCache', () => {
  it('keeps the reading screens, and nothing personal or administrative', async () => {
    const store = memoryStore();
    const { qc, cache } = await start(store);
    qc.setQueryData(['me'], ME);
    qc.setQueryData(['library', 'list', 'pages', {}, 20], { pages: [], pageParams: [] });
    qc.setQueryData(['forum', 'thread', 'a-thread'], { id: 't1' });
    qc.setQueryData(['calendar', 'events', {}], []);
    qc.setQueryData(['account', 'sessions'], [{ id: 's1' }]);
    qc.setQueryData(['admin', 'stats'], { users: 3 });
    qc.setQueryData(['calendar', 'mine', 'settings'], { feedUrl: 'secret' });
    qc.setQueryData(['library', 'file', 'i1'], { url: 'https://bucket/f.pdf?sig=1' });
    qc.setQueryData(['notifications'], []);
    await cache.flush();

    const saved = store.value();
    expect(saved?.owner).toBe('u1');
    expect(keys(saved)).toEqual(
      [
        '["calendar","events",{}]',
        '["forum","thread","a-thread"]',
        '["library","list","pages",{},20]',
        '["me"]',
      ].sort(),
    );
    const me = saved?.entries.find((e) => e.key[0] === 'me')?.data;
    expect(me).toMatchObject({ id: 'u1', email: null, phone: null });
  });

  it('forgets everything personal on sign-out, in storage too', async () => {
    const store = memoryStore();
    const { qc, cache } = await start(store);
    qc.setQueryData(['me'], ME);
    qc.setQueryData(['modules'], [{ id: 'm1' }]);
    qc.setQueryData(['forum', 'thread', 'a-thread'], { id: 't1', voted: 1 });
    await cache.flush();
    expect(keys(store.value())).toHaveLength(3);

    // what AuthProvider.signOut does: the session is a guest's now
    qc.setQueryData(['me'], null);
    await cache.flush();
    expect(store.value()?.owner).toBe('guest');
    expect(keys(store.value())).toEqual(['["modules"]']);

    // the thread as it was cached for the old account never comes back under the guest
    qc.setQueryData(['forum', 'thread', 'a-thread'], { id: 't1', voted: 1 }, { updatedAt: 1 });
    await cache.flush();
    expect(keys(store.value())).toEqual(['["modules"]']);
  });

  it('forgets the previous account when another one signs in', async () => {
    const store = memoryStore();
    const { qc, cache } = await start(store);
    qc.setQueryData(['me'], ME);
    qc.setQueryData(['calendar', 'mine', 'events'], [{ id: 'e1' }]);
    await cache.flush();
    qc.setQueryData(['me'], { ...ME, id: 'u2' });
    await cache.flush();
    expect(store.value()?.owner).toBe('u2');
    expect(keys(store.value())).toEqual(['["me"]']);
  });

  it("keeps the new account's own answer when the clock ticks while the account changes", async () => {
    const store = memoryStore();
    const { qc, cache } = await start(store, () => Date.now() + 5); // the switch is noted a few ms after the answer
    qc.setQueryData(['me'], ME);
    await cache.flush();
    qc.setQueryData(['me'], { ...ME, id: 'u2' });
    await cache.flush();
    expect(store.value()?.owner).toBe('u2');
    expect(keys(store.value())).toEqual(['["me"]']);
  });

  it('drops a stored snapshot when the session belongs to someone else', async () => {
    const now = Date.now();
    const store = memoryStore({
      v: 1,
      owner: 'u1',
      liveAt: now,
      entries: [{ hash: 'x', key: ['forum', 'thread', 'x'], data: { id: 'x' }, updatedAt: now, size: 10 }],
    });
    const { qc, cache } = await start(store);
    qc.setQueryData(['me'], null); // the session ended
    await cache.flush();
    expect(keys(store.value())).toEqual([]);
  });

  it('shows the kept copy only while offline, marked to be read again', async () => {
    const now = Date.now();
    const thread = ['forum', 'thread', 'kept'];
    const store = memoryStore({
      v: 1,
      owner: 'u1',
      liveAt: now,
      entries: [{ hash: JSON.stringify(thread), key: thread, data: { id: 'kept' }, updatedAt: now - 1000, size: 13 }],
    });
    const { qc } = await start(store);

    // online: the API is read as usual
    qc.getQueryCache().build(qc, { queryKey: thread });
    expect(qc.getQueryData(thread)).toBeUndefined();
    qc.clear();

    onlineManager.setOnline(false);
    const query = qc.getQueryCache().build(qc, { queryKey: thread });
    expect(query.state.data).toEqual({ id: 'kept' });
    expect(query.state.status).toBe('success');
    expect(query.state.isInvalidated).toBe(true);
  });

  it('fills a screen that lost its connection mid-load', async () => {
    const now = Date.now();
    const list = ['calendar', 'events', {}];
    const store = memoryStore({
      v: 1,
      owner: 'guest',
      liveAt: 0,
      entries: [{ hash: JSON.stringify(list), key: list, data: [], updatedAt: now, size: 2 }],
    });
    const { qc } = await start(store);
    const query = qc.getQueryCache().build(qc, { queryKey: list });
    expect(query.state.data).toBeUndefined();
    onlineManager.setOnline(false);
    expect(query.state.data).toEqual([]);
  });

  it('keeps no own events, no Yours list and no anonymous thread', async () => {
    const store = memoryStore();
    const { qc, cache } = await start(store);
    qc.setQueryData(['me'], ME);
    qc.setQueryData(['calendar', 'mine', 'events'], [{ id: 'e1', title: 'Clinic appointment' }]);
    qc.setQueryData(['forum', 'list', { yours: true }, 20], { pages: [[{ anonymous: true }]] });
    qc.setQueryData(['forum', 'thread', 'asked'], { id: 'asked', anonymous: true });
    qc.setQueryData(['forum', 'thread', 'open'], { id: 'open', anonymous: false });
    await cache.flush();
    expect(keys(store.value())).toEqual(['["forum","thread","open"]', '["me"]']);
  });
});

describe('a session that ended elsewhere (SEC-53)', () => {
  const now = Date.now();
  const entry = (key: unknown[], data: unknown) => entryFor(JSON.stringify(key), key, data, now - 60_000)!;
  const kept = (liveAt: number): OfflineSnapshot => ({
    v: 1,
    owner: 'student-a',
    liveAt,
    entries: [
      entry(['me'], { id: 'student-a', displayName: 'A', email: null, phone: null }),
      entry(['forum', 'thread', 't1'], { id: 't1', voted: 1 }),
      entry(['modules'], [{ id: 'm1' }]),
    ],
  });

  it('shows nothing of the last account offline a day after its session was last seen live', async () => {
    onlineManager.setOnline(false);
    const { qc } = await start(memoryStore(kept(now - OWNER_LIVE_MAX_AGE - 60_000)), () => now);
    qc.getQueryCache().build(qc, { queryKey: ['me'] });
    qc.getQueryCache().build(qc, { queryKey: ['forum', 'thread', 't1'] });
    qc.getQueryCache().build(qc, { queryKey: ['modules'] });
    expect(qc.getQueryData(['me'])).toBeUndefined();
    expect(qc.getQueryData(['forum', 'thread', 't1'])).toBeUndefined();
    expect(qc.getQueryData(['modules'])).toEqual([{ id: 'm1' }]); // the shared pages are the same for everyone
  });

  it('shows them within the day', async () => {
    onlineManager.setOnline(false);
    const { qc } = await start(memoryStore(kept(now - 60 * 60_000)), () => now);
    qc.getQueryCache().build(qc, { queryKey: ['me'] });
    expect(qc.getQueryData(['me'])).toMatchObject({ id: 'student-a' });
  });

  it('forgets the account at any answer of 401, in storage too', async () => {
    const store = memoryStore(kept(now));
    const { qc, cache } = await start(store, () => now);
    await qc
      .fetchQuery({
        queryKey: ['library', 'facets'],
        queryFn: () => Promise.reject(new ApiError({ status: 401, code: 'unauthenticated', message: 'Sign in.' })),
        retry: false,
      })
      .catch(() => undefined);
    await cache.flush();
    expect(store.value()?.owner).toBe('guest');
    expect(keys(store.value())).toEqual(['["modules"]']);
  });

  it('tells the other open tabs, which then write nothing of the previous account (SEC-62)', async () => {
    const first = memoryStore();
    const second = memoryStore();
    const a = await start(first);
    const b = await start(second);
    for (const { qc, cache } of [a, b]) {
      qc.setQueryData(['me'], ME);
      qc.setQueryData(['forum', 'thread', 't1'], { id: 't1', voted: 1 });
      await cache.flush();
    }
    expect(keys(second.value())).toHaveLength(2);
    b.qc.setQueryData(['forum', 'thread', 't2'], { id: 't2', voted: 1 }); // waiting to be written in the second tab
    a.qc.setQueryData(['me'], null); // signed out in the first tab
    await a.cache.flush();
    await new Promise((resolve) => setTimeout(resolve, 20)); // the message reaches the second tab
    await b.cache.flush();
    expect(second.value()).toBeUndefined(); // the second tab cleared its copy and wrote nothing back
  });
});
