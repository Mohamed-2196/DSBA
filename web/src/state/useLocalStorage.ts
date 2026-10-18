import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { bindStored, type StoredUpdate } from './storedValue';

export { removeStored, writeStored } from './storedValue';

export type SetStored<T> = (next: StoredUpdate<T>) => void;

/**
 * JSON-backed localStorage state. SSR-safe, never throws (private mode / quota / bad JSON),
 * synced across hooks using the same key in this tab and across tabs, and reset by removeStored(key).
 * Setting `undefined` removes the key (the value goes back to `initial`).
 * Stored JSON is not validated: check its shape before trusting it.
 */
export function useLocalStorage<T>(key: string, initial: T | (() => T)): [T, SetStored<T>] {
  const initialRef = useRef(initial);
  const source = useId();
  const binding = useMemo(
    () =>
      bindStored<T>(
        key,
        () => (typeof initialRef.current === 'function' ? (initialRef.current as () => T)() : initialRef.current),
        source,
      ),
    [key, source],
  );
  const [value, setValue] = useState<T>(() => binding.get());

  useEffect(() => {
    // The key may have changed, or the value since the first render: read it again, then follow the others.
    setValue(binding.refresh());
    return binding.subscribe(() => setValue(binding.get()));
  }, [binding]);

  const set = useCallback<SetStored<T>>(
    (next) => {
      binding.set(next);
      setValue(binding.get());
    },
    [binding],
  );

  return [value, set];
}
