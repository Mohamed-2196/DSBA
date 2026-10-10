import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { getCategory } from '../data/taxonomy';

const DEFAULTS = { cohort: 'all', tag: '', sort: 'hot', q: '', status: '', module: '' };
const SORT_VALUES = new Set(['hot', 'new', 'top']);

/**
 * All forum list filters live in the URL (?cohort=year-2&tag=r&sort=new&q=mgf&status=no-replies&module=…).
 * One setter for several params at once (react-router's functional setter reads render-time params,
 * so separate setters in one tick would overwrite each other).
 * @returns {[filters, update(patch, { replace }), clear()]}
 */
export function useForumFilters() {
  const [params, setParams] = useSearchParams();
  const filters = useMemo(() => {
    const cohort = params.get('cohort');
    const sort = params.get('sort');
    return {
      cohort: cohort && getCategory(cohort) ? cohort : 'all',
      tag: params.get('tag') || '',
      sort: SORT_VALUES.has(sort) ? sort : 'hot',
      q: params.get('q') || '',
      status: params.get('status') === 'no-replies' ? 'no-replies' : '',
      module: params.get('module') || '',
    };
  }, [params]);

  const update = useCallback(
    (patch, { replace = true } = {}) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          for (const [k, v] of Object.entries(patch)) {
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
    (keep = []) => {
      setParams(
        (prev) => {
          const p = new URLSearchParams();
          for (const k of keep) if (prev.get(k)) p.set(k, prev.get(k));
          return p;
        },
        { replace: true },
      );
    },
    [setParams],
  );

  return [filters, update, clear];
}
