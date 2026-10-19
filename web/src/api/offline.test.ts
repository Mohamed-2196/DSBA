import { QueryClient, onlineManager } from '@tanstack/react-query';
import { afterEach, describe, expect, it } from 'vitest';
import { startOfflineCache, type OfflineCache, type SnapshotStore } from './offline';
import type { OfflineSnapshot } from './offlineCache';

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

let running: OfflineCache | null = null;
afterEach(() => {
  running?.stop();
  running = null;
  onlineManager.setOnline(true);
});

async function start(store: SnapshotStore) {
  const qc = new QueryClient();
  running = await startOfflineCache(qc, store, { delay: 60_000 });
  return { qc, cache: running };
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

  it('drops a stored snapshot when the session belongs to someone else', async () => {
    const now = Date.now();
    const store = memoryStore({
      v: 1,
      owner: 'u1',
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
      entries: [{ hash: JSON.stringify(list), key: list, data: [], updatedAt: now, size: 2 }],
    });
    const { qc } = await start(store);
    const query = qc.getQueryCache().build(qc, { queryKey: list });
    expect(query.state.data).toBeUndefined();
    onlineManager.setOnline(false);
    expect(query.state.data).toEqual([]);
  });
});
