import { useMemo } from 'react';
import type { ThreadSummary } from '../../../api/types';
import { useDebouncedValue } from '../../../state';
import { useSimilarThreads } from '../api';
import { rankSimilar } from './search';

export interface SimilarState {
  /** the threads most like the title, best first */
  threads: ThreadSummary[];
  /** the title is long enough to look for similar threads */
  searching: boolean;
  /** a search is running */
  loading: boolean;
}

/** Threads like a title being typed ("Similar threads" in the composer), once typing pauses and the title says enough. */
export function useSimilar(title: string): SimilarState {
  const settled = useDebouncedValue(title, 350);
  const searching = settled.trim().length >= 6;
  const query = useSimilarThreads(searching ? settled : '');
  const threads = useMemo(
    () => (searching ? rankSimilar(query.data ?? [], settled) : []),
    [searching, query.data, settled],
  );
  return { threads, searching, loading: query.isFetching };
}
