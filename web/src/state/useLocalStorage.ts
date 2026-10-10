import { useCallback, useEffect, useId, useRef, useState } from 'react';

const SYNC_EVENT = 'hub:storage';

interface SyncDetail {
  key: string;
  source: string;
}

export type SetStored<T> = (next: T | undefined | ((prev: T) => T | undefined)) => void;

function readKey<T>(key: string, initial: T | (() => T)): T {
  const fallback = typeof initial === 'function' ? (initial as () => T)() : initial;
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

/**
 * JSON-backed localStorage state. SSR-safe, never throws (private mode / quota / bad JSON),
 * synced across hooks using the same key in this tab and across tabs.
 * Setting `undefined` removes the key (the value goes back to `initial`).
 * Stored JSON is not validated: check its shape before trusting it.
 */
export function useLocalStorage<T>(key: string, initial: T | (() => T)): [T, SetStored<T>] {
  const initialRef = useRef(initial);
  const [value, setValue] = useState<T>(() => readKey(key, initial));
  const valueRef = useRef(value);
  const source = useId();

  useEffect(() => {
    const v = readKey(key, initialRef.current);
    valueRef.current = v;
    setValue(v);
  }, [key]);

  const set = useCallback<SetStored<T>>(
    (next) => {
      const v = typeof next === 'function' ? (next as (prev: T) => T | undefined)(valueRef.current) : next;
      try {
        if (v === undefined) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, JSON.stringify(v));
      } catch {
        /* storage unavailable: keep in-memory state */
      }
      const current = v === undefined ? readKey(key, initialRef.current) : v;
      valueRef.current = current;
      setValue(current);
      try {
        window.dispatchEvent(new CustomEvent<SyncDetail>(SYNC_EVENT, { detail: { key, source } }));
      } catch {
        /* ignore */
      }
    },
    [key, source],
  );

  useEffect(() => {
    const reread = () => {
      const v = readKey(key, initialRef.current);
      valueRef.current = v;
      setValue(v);
    };
    const onStorage = (e: StorageEvent) => {
      if (e.key === key) reread();
    };
    const onSync = (e: Event) => {
      const detail = (e as CustomEvent<SyncDetail>).detail;
      if (detail?.key === key && detail.source !== source) reread();
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(SYNC_EVENT, onSync);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SYNC_EVENT, onSync);
    };
  }, [key, source]);

  return [value, set];
}
