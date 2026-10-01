import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

/**
 * One URL query param as state (HashRouter-aware), e.g. tabs: `?tab=lessons`.
 * Setting the default value (or null) removes the param. Other params are kept.
 * @returns {[string, (next: string|null, opts?: { replace?: boolean }) => void]}
 */
export function useQueryParam(key, defaultValue = null) {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? defaultValue;
  const setValue = useCallback(
    (next, { replace = false } = {}) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          if (next === null || next === undefined || next === '' || next === defaultValue) p.delete(key);
          else p.set(key, String(next));
          return p;
        },
        { replace },
      );
    },
    [key, defaultValue, setParams],
  );
  return [value, setValue];
}
