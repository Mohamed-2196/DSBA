import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ForumFilters, ThreadSort } from '../types';
import { isCategoryId } from './taxonomy';

const DEFAULTS: ForumFilters = { cohort: 'all', tag: '', sort: 'hot', q: '', status: '', module: '' };
const SORTS: readonly ThreadSort[] = ['hot', 'new', 'top'];
const isSort = (v: string | null): v is ThreadSort => v !== null && (SORTS as readonly string[]).includes(v);

export type FilterPatch = Partial<Record<keyof ForumFilters, string | null>>;

/**
 * All forum list filters live in the URL (?cohort=year-2&tag=r&sort=new&q=mgf&status=no-replies&module=…).
 * One setter for several params at once (react-router's functional setter reads render-time params,
 * so separate setters in one tick would overwrite each other).
 */
export function useForumFilters(): [ForumFilters, (patch: FilterPatch, opts?: { replace?: boolean }) => void, (keep?: (keyof ForumFilters)[]) => void] {
  const [params, setParams] = useSearchParams();
  const filters = useMemo<ForumFilters>(() => {
    const cohort = params.get('cohort');
    const sort = params.get('sort');
    return {
      cohort: cohort && isCategoryId(cohort) ? cohort : 'all',
      tag: params.get('tag') || '',
      sort: isSort(sort) ? sort : 'hot',
      q: params.get('q') || '',
      status: params.get('status') === 'no-replies' ? 'no-replies' : '',
      module: params.get('module') || '',
    };
  }, [params]);

  const update = useCallback(
    (patch: FilterPatch, { replace = true }: { replace?: boolean } = {}) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch) as [keyof ForumFilters, string | null | undefined][]) {
            if (v === null || v === undefined || v === '' || v === DEFAULTS[k]) p.delete(k);
            else p.set(k, String(v));
          }
          return p;
        },
        { replace },
      );
    },
    [setParams],
  );

  const clear = useCallback(
    (keep: (keyof ForumFilters)[] = []) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams();
          for (const k of keep) {
            const v = prev.get(k);
            if (v) p.set(k, v);
          }
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return [filters, update, clear];
}
