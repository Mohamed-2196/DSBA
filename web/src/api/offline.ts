// Reading offline: the last library, forum, calendar and module screens a student saw stay readable without a
// connection. What is kept and for how long is in offlineCache.ts.
//
//   startOfflineCache(qc, store)   main.tsx, once, before the first render: reads the stored snapshot, then keeps it
//                                  up to date as queries answer (written at most every 1.5 s, and when the page is left or hidden)
//
// Kept data is shown only while offline: a query that has no data while the browser is offline (a page opened, or a
// fetch cut off when the connection went) gets the kept copy, marked stale, so it is read again once the connection
// is back. Online, the app reads the API as it always does.
//
// The snapshot belongs to one account. When the session says someone else is here (signing out, signing in as
// another person, a session that ended) everything but the shared module pages is dropped, in memory and in storage.
import { hydrate, onlineManager, type Query, type QueryClient, type QueryState } from '@tanstack/react-query';
import {
  entryFor,
  offlineScope,
  ownerOf,
  prune,
  readSnapshot,
  type OfflineEntry,
  type OfflineSnapshot,
} from './offlineCache';

/** Where the snapshot lives: IndexedDB in the app, a plain object in the tests. */
export interface SnapshotStore {
  read(): Promise<unknown>;
  write(snapshot: OfflineSnapshot): Promise<void>;
  clear(): Promise<void>;
}

const DB_NAME = 'dsba-hub-offline';
const STORE_NAME = 'snapshot';
const RECORD = 'current';

/** The snapshot in IndexedDB. Every failure (a private window, storage full or blocked) means nothing is kept. */
export function indexedDbStore(): SnapshotStore {
  let opening: Promise<IDBDatabase> | null = null;
  /** the open database, once it is: a write then starts at once, which matters when the page is being left */
  let db: IDBDatabase | null = null;
  const open = (): Promise<IDBDatabase> => {
    opening ??= new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE_NAME);
      req.onsuccess = () => {
        db = req.result;
        resolve(req.result);
      };
      req.onerror = () => reject(req.error ?? new Error('IndexedDB did not open'));
    });
    return opening;
  };
  const inTransaction = <T>(
    database: IDBDatabase,
    mode: IDBTransactionMode,
    act: (store: IDBObjectStore) => IDBRequest<T>,
  ): Promise<T> => {
    const tx = database.transaction(STORE_NAME, mode);
    const req = act(tx.objectStore(STORE_NAME));
    tx.commit(); // nothing else goes in: commit now rather than when the task ends
    return new Promise<T>((resolve, reject) => {
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB failed'));
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB aborted'));
    });
  };
  const run = <T>(mode: IDBTransactionMode, act: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> => {
    try {
      if (db) return inTransaction(db, mode, act);
    } catch (e) {
      return Promise.reject(e instanceof Error ? e : new Error('IndexedDB failed'));
    }
    return open().then((database) => inTransaction(database, mode, act));
  };
  return {
    read: () => run('readonly', (s) => s.get(RECORD) as IDBRequest<unknown>),
    write: async (snapshot) => {
      await run('readwrite', (s) => s.put(snapshot, RECORD));
    },
    clear: async () => {
      await run('readwrite', (s) => s.delete(RECORD));
    },
  };
}

/** A kept entry as a query's state: successful, never fetching, and stale so it is read again when it can be. */
function restoredState(entry: OfflineEntry): QueryState {
  return {
    data: entry.data,
    dataUpdateCount: 1,
    dataUpdatedAt: entry.updatedAt,
    error: null,
    errorUpdateCount: 0,
    errorUpdatedAt: 0,
    fetchFailureCount: 0,
    fetchFailureReason: null,
    fetchMeta: null,
    isInvalidated: true,
    status: 'success',
    fetchStatus: 'idle',
  };
}

export interface OfflineCache {
  /** write what is pending now */
  flush(): Promise<void>;
  /** stop listening (tests) */
  stop(): void;
}

export interface OfflineCacheOptions {
  /** how long writes are gathered before one goes to storage */
  delay?: number;
  now?: () => number;
}

export async function startOfflineCache(
  qc: QueryClient,
  store: SnapshotStore,
  { delay = 1500, now = Date.now }: OfflineCacheOptions = {},
): Promise<OfflineCache> {
  let raw: unknown;
  try {
    raw = await store.read();
  } catch {
    raw = undefined;
  }
  const snapshot = readSnapshot(raw, now());
  /** whose snapshot this is; null until the session says (nothing is written before) */
  let owner: string | null = snapshot?.owner ?? null;
  /** personal data read before this moment belongs to the previous account, so it is never written */
  let ownerSince = 0;
  const entries = new Map<string, OfflineEntry>((snapshot?.entries ?? []).map((e) => [e.hash, e]));
  let timer: ReturnType<typeof setTimeout> | undefined;
  /** one write at a time, in order */
  let writing: Promise<void> = Promise.resolve();

  /** What is kept now, pruned; null before the session has said whose it is. */
  const take = (): OfflineSnapshot | null => {
    if (owner === null) return null;
    const kept = prune(entries.values(), now());
    entries.clear();
    for (const e of kept) entries.set(e.hash, e);
    return { v: 1, owner, entries: kept };
  };
  const save = async (snapshot: OfflineSnapshot | null): Promise<void> => {
    if (!snapshot) return;
    try {
      if (snapshot.entries.length) await store.write(snapshot);
      else await store.clear();
    } catch {
      /* storage full or blocked: nothing is kept */
    }
  };
  const write = (): Promise<void> => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    writing = writing.then(() => save(take()));
    return writing;
  };
  /** The page is going: write at once, without waiting for the writes before (it won't be around to). */
  const writeNow = () => {
    if (timer === undefined) return; // nothing new since the last write
    clearTimeout(timer);
    timer = undefined;
    void save(take());
  };
  const schedule = () => {
    timer ??= setTimeout(() => void write(), delay);
  };

  /** Someone else is here (as of `since`, when the session said so): forget what was the previous account's, keep
   *  the shared module pages. */
  const noteOwner = (next: string, since: number) => {
    if (owner === next) return;
    const hadOwner = owner !== null;
    owner = next;
    if (!hadOwner) {
      schedule(); // the first answer since the page opened: whatever is in memory was read for them
      return;
    }
    ownerSince = since;
    for (const [hash, e] of entries) if (offlineScope(e.key) !== 'shared') entries.delete(hash);
    writing = writing.then(() => store.clear().catch(() => undefined));
    schedule();
  };

  /** Offline and nothing to show: the kept copy, if there is one. */
  const fill = (query: Query) => {
    if (query.state.data !== undefined) return;
    const entry = entries.get(query.queryHash);
    if (!entry) return;
    hydrate(qc, {
      mutations: [],
      queries: [
        { queryHash: entry.hash, queryKey: [...entry.key], state: restoredState(entry), dehydratedAt: entry.updatedAt },
      ],
    });
  };

  /** A query that answered: kept, if it is kept at all and was read for the person here now. */
  const note = (query: Query) => {
    const { queryKey, state } = query;
    if (queryKey.length === 1 && queryKey[0] === 'me') noteOwner(ownerOf(state.data), state.dataUpdatedAt);
    const scope = offlineScope(queryKey);
    if (!scope || (scope === 'owner' && state.dataUpdatedAt < ownerSince)) return;
    const entry = entryFor(query.queryHash, queryKey, state.data, state.dataUpdatedAt);
    if (!entry) return;
    entries.set(entry.hash, entry);
    schedule();
  };

  const cache = qc.getQueryCache();
  const stopCache = cache.subscribe((event) => {
    if (event.type === 'added') {
      if (!onlineManager.isOnline()) fill(event.query);
    } else if (event.type === 'updated' && event.action.type === 'success') {
      note(event.query);
    }
  });
  // The app may have started before storage answered (main.tsx waits half a second at most): catch up on the
  // session and the answers so far, and fill what is waiting when offline. The session first, so it decides whose
  // snapshot this is.
  const all = cache.getAll().sort((a, b) => Number(b.queryKey[0] === 'me') - Number(a.queryKey[0] === 'me'));
  for (const query of all) {
    if (query.state.data !== undefined) note(query);
    else if (!onlineManager.isOnline()) fill(query);
  }
  const stopOnline = onlineManager.subscribe((online) => {
    if (!online) for (const query of cache.getAll()) fill(query);
  });
  // Leaving the page (a reload, another address, the tab closed or put away): write what is waiting now.
  const onHide = () => {
    if (document.visibilityState === 'hidden') writeNow();
  };
  const onLeave = () => writeNow();
  const hasDocument = typeof document !== 'undefined';
  if (hasDocument) {
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onLeave);
  }

  return {
    flush: write,
    stop: () => {
      stopCache();
      stopOnline();
      if (timer !== undefined) clearTimeout(timer);
      if (hasDocument) {
        document.removeEventListener('visibilitychange', onHide);
        window.removeEventListener('pagehide', onLeave);
      }
    },
  };
}
