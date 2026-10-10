import { useCallback, useEffect, useId, useRef, useState } from 'react';

const SYNC_EVENT = 'hub:storage';

function readKey(key, initial) {
  const fallback = typeof initial === 'function' ? initial() : initial;
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}

/**
 * JSON-backed localStorage state. SSR-safe, never throws (private mode / quota / bad JSON),
 * synced across hooks using the same key in this tab and across tabs.
 * Setting `undefined` removes the key.
 * @returns {[any, (next: any | ((prev: any) => any)) => void]}
 */
export function useLocalStorage(key, initial) {
  const initialRef = useRef(initial);
  const [value, setValue] = useState(() => readKey(key, initial));
  const valueRef = useRef(value);
  const source = useId();

  useEffect(() => {
    const v = readKey(key, initialRef.current);
    valueRef.current = v;
    setValue(v);
  }, [key]);

  const set = useCallback(
    (next) => {
      const v = typeof next === 'function' ? next(valueRef.current) : next;
      valueRef.current = v;
      setValue(v);
      try {
        if (v === undefined) window.localStorage.removeItem(key);
        else window.localStorage.setItem(key, JSON.stringify(v));
      } catch {
        /* storage unavailable: keep in-memory state */
      }
      try {
        window.dispatchEvent(new CustomEvent(SYNC_EVENT, { detail: { key, source } }));
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
    const onStorage = (e) => { if (e.key === key) reread(); };
    const onSync = (e) => { if (e.detail?.key === key && e.detail.source !== source) reread(); };
    window.addEventListener('storage', onStorage);
    window.addEventListener(SYNC_EVENT, onSync);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(SYNC_EVENT, onSync);
    };
  }, [key, source]);

  return [value, set];
}
