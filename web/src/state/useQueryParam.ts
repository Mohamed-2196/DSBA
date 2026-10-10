import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

export type SetQueryParam = (next: string | number | null | undefined, opts?: { replace?: boolean }) => void;

/**
 * One URL query param as state, e.g. tabs: `?tab=lessons`.
 * Setting the default value (or null) removes the param. Other params are kept.
 */
export function useQueryParam(key: string): [string | null, SetQueryParam];
export function useQueryParam(key: string, defaultValue: string): [string, SetQueryParam];
export function useQueryParam(key: string, defaultValue: string | null = null): [string | null, SetQueryParam] {
  const [params, setParams] = useSearchParams();
  const value = params.get(key) ?? defaultValue;
  const setValue = useCallback<SetQueryParam>(
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
