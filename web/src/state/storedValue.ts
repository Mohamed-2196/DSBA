// A JSON value kept in localStorage under one key, shared by every holder of that key: in this tab (the
// 'hub:storage' event) and in other tabs (the browser's 'storage' event). useLocalStorage() is the React face of
// it; this module has no React in it, so its rules are unit-tested (state/storedValue.test.ts).

const SYNC_EVENT = 'hub:storage';

interface SyncDetail {
  key: string;
  /** who changed it: a binding's id, or 'external' (removeStored), which every binding follows */
  source: string;
}

export type StoredUpdate<T> = T | undefined | ((prev: T) => T | undefined);

/** The value stored under `key`, or `fallback()` when there is none, it isn't JSON, or storage is unavailable. */
export function readStored<T>(key: string, fallback: () => T): T {
  if (typeof window === 'undefined') return fallback();
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback() : (JSON.parse(raw) as T);
  } catch {
    return fallback();
  }
}

function announce(key: string, source: string): void {
  try {
    window.dispatchEvent(new CustomEvent<SyncDetail>(SYNC_EVENT, { detail: { key, source } }));
  } catch {
    /* no window (tests, SSR): nothing is listening */
  }
}

/**
 * Remove `key`, and make every mounted useLocalStorage(key) fall back to its initial value at once (code quality
 * review CQ-1). Removing with localStorage.removeItem() alone leaves mounted holders on the old value, and their
 * next update writes it back.
 */
export function removeStored(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    /* storage unavailable: nothing was kept */
  }
  announce(key, 'external');
}

/** One holder of a stored value. */
export interface StoredBinding<T> {
  /** the value as this holder last read or wrote it */
  get(): T;
  /** read the stored value again (after mounting: it may have changed since the first read) */
  refresh(): T;
  /** store a value (undefined removes the key: the value goes back to the initial one); functional updates get
   *  the current value, never one another holder or removeStored() has replaced */
  set(next: StoredUpdate<T>): void;
  /** `onChange` runs when another holder, another tab or removeStored() changed the key; returns the unsubscribe */
  subscribe(onChange: () => void): () => void;
}

/** A holder of the value under `key`. `source` tells this holder's own changes from the others'. */
export function bindStored<T>(key: string, initial: () => T, source: string): StoredBinding<T> {
  let value = readStored(key, initial);
  const refresh = () => (value = readStored(key, initial));
  return {
    get: () => value,
    refresh,
    set(next) {
      const v = typeof next === 'function' ? (next as (prev: T) => T | undefined)(value) : next;
      try {
        if (v === undefined) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, JSON.stringify(v));
      } catch {
        /* storage unavailable or full: keep the value in memory */
      }
      value = v === undefined ? readStored(key, initial) : v;
      announce(key, source);
    },
    subscribe(onChange) {
      if (typeof window === 'undefined') return () => undefined;
      const onStorage = (e: Event) => {
        // key null: another tab cleared the whole storage
        const changed = (e as StorageEvent).key;
        if (changed === key || changed === null) {
          refresh();
          onChange();
        }
      };
      const onSync = (e: Event) => {
        const detail = (e as CustomEvent<SyncDetail>).detail;
        if (detail?.key === key && detail.source !== source) {
          refresh();
          onChange();
        }
      };
      window.addEventListener('storage', onStorage);
      window.addEventListener(SYNC_EVENT, onSync);
      return () => {
        window.removeEventListener('storage', onStorage);
        window.removeEventListener(SYNC_EVENT, onSync);
      };
    },
  };
}
