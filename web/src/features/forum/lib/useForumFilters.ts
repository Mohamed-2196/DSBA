import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ForumFilters } from '../types';
import { keepFilters, patchFilters, readFilters, type FilterPatch } from './filters';

export type { FilterPatch } from './filters';

/**
 * All forum list filters live in the URL (lib/filters.ts). One setter for several params at once (react-router's
 * functional setter reads render-time params, so separate setters in one tick would overwrite each other).
 */
export function useForumFilters(): [
  ForumFilters,
  (patch: FilterPatch, opts?: { replace?: boolean }) => void,
  (keep?: (keyof ForumFilters)[]) => void,
] {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => readFilters(params), [params]);

  const update = useCallback(
    (patch: FilterPatch, { replace = true }: { replace?: boolean } = {}) => {
      setParams((prev) => patchFilters(prev, patch), { replace });
    },
    [setParams],
  );

  const clear = useCallback(
    (keep: (keyof ForumFilters)[] = []) => {
      setParams((prev) => keepFilters(prev, keep), { replace: true });
    },
    [setParams],
  );

  return [filters, update, clear];
}
