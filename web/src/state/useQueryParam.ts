import { useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';

type ParamValue = string | number | null | undefined;
type SetOptions = { replace?: boolean };

export type SetQueryParam = (next: ParamValue, opts?: SetOptions) => void;
export type SetQueryParams = (updates: Readonly<Record<string, ParamValue>>, opts?: SetOptions) => void;

/**
 * A copy of `prev` with `updates` applied: null, undefined and '' remove a param, anything else sets it.
 * Params not named in `updates` are kept.
 */
export function withQueryParams(prev: URLSearchParams, updates: Readonly<Record<string, ParamValue>>): URLSearchParams {
  const p = new URLSearchParams(prev);
  for (const [key, next] of Object.entries(updates)) {
    if (next === null || next === undefined || next === '') p.delete(key);
    else p.set(key, String(next));
  }
  return p;
}

/**
 * Sets several URL query params in one address update, e.g. `set({ module: id, lesson: null })`.
 * Use it whenever two params change together: React Router's setters don't queue, so two `useQueryParam`
 * setters called in a row each start from the same address and the second undoes the first.
 */
export function useSetQueryParams(): SetQueryParams {
  const [, setParams] = useSearchParams();
  return useCallback<SetQueryParams>(
    (updates, { replace = false } = {}) => setParams((prev) => withQueryParams(prev, updates), { replace }),
    [setParams],
  );
}

/**
 * One URL query param as state, e.g. tabs: `?tab=lessons`.
 * Setting the default value (or null) removes the param. Other params are kept.
 */
export function useQueryParam(key: string): [string | null, SetQueryParam];
export function useQueryParam(key: string, defaultValue: string): [string, SetQueryParam];
export function useQueryParam(key: string, defaultValue: string | null = null): [string | null, SetQueryParam] {
  const [params] = useSearchParams();
  const setParams = useSetQueryParams();
  const value = params.get(key) ?? defaultValue;
  const setValue = useCallback<SetQueryParam>(
    (next, opts) => setParams({ [key]: next === defaultValue ? null : next }, opts),
    [key, defaultValue, setParams],
  );
  return [value, setValue];
}
