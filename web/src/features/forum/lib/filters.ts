// The list filters as they live in the URL (?cohort=year-2&tag=r&sort=new&q=mgf&status=no-replies&module=…), as
// plain functions over URLSearchParams (lib/useForumFilters.ts is the React face of them).
import type { ForumFilters, ThreadSort } from '../types';
import { isCategoryId } from './categories';

export const DEFAULT_FILTERS: ForumFilters = { cohort: 'all', tag: '', sort: 'hot', q: '', status: '', module: '' };

const SORTS: readonly ThreadSort[] = ['hot', 'new', 'top'];
const isSort = (v: string | null): v is ThreadSort => v !== null && (SORTS as readonly string[]).includes(v);

export type FilterPatch = Partial<Record<keyof ForumFilters, string | null>>;

/** The filters a URL asks for; anything unknown falls back to the default. */
export function readFilters(params: URLSearchParams): ForumFilters {
  const cohort = params.get('cohort');
  const sort = params.get('sort');
  return {
    cohort: isCategoryId(cohort) ? cohort : 'all',
    tag: params.get('tag') || '',
    sort: isSort(sort) ? sort : 'hot',
    q: params.get('q') || '',
    status: params.get('status') === 'no-replies' ? 'no-replies' : '',
    module: params.get('module') || '',
  };
}

/** The URL's params with `patch` applied: an empty or default value leaves the URL (short links). Other params stay. */
export function patchFilters(prev: URLSearchParams, patch: FilterPatch): URLSearchParams {
  const p = new URLSearchParams(prev);
  for (const [k, v] of Object.entries(patch) as [keyof ForumFilters, string | null | undefined][]) {
    if (v === null || v === undefined || v === '' || v === DEFAULT_FILTERS[k]) p.delete(k);
    else p.set(k, String(v));
  }
  return p;
}

/** Only the filters in `keep` (the others are cleared), and nothing else. */
export function keepFilters(prev: URLSearchParams, keep: readonly (keyof ForumFilters)[] = []): URLSearchParams {
  const p = new URLSearchParams();
  for (const k of keep) {
    const v = prev.get(k);
    if (v) p.set(k, v);
  }
  return p;
}
