// Site-wide search: GET /api/v1/search?q= (threads, library items, newsletter issues, modules and calendar
// events, each list ranked by the API; the last word matches as a prefix, for search-as-you-type).
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { api, call } from '../../api/client';

export const SEARCH_KEY = ['search'] as const;

/** Results per type: the palette shows the first few and "Show more" reveals the rest. */
export const PER_TYPE = 10;

export function useSearch(query: string) {
  const q = query.trim().slice(0, 200);
  return useQuery({
    queryKey: [...SEARCH_KEY, q] as const,
    queryFn: ({ signal }) => call(api.GET('/api/v1/search', { params: { query: { q, limit: PER_TYPE } }, signal })),
    enabled: q.length > 0,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });
}

/** `value`, once it has stopped changing for `ms`. */
export function useDebouncedValue<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(t);
  }, [value, ms]);
  return settled;
}
