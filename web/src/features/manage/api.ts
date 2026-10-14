// The hub's numbers for Manage. The queues (forum reports, library uploads) invalidate ADMIN_STATS_KEY after a
// decision, so they follow. A count is null while its feature is switched off. Mini Noora's AI usage and limits
// have their own query.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import { ADMIN_STATS_KEY } from '../../api/keys';
import type { NooraLimitsIn } from '../../api/types';
import type { CohortYear } from '../../state';

const NOORA_USAGE_KEY = ['admin', 'noora'] as const;

export function useAdminStats(enabled: boolean) {
  return useQuery({ queryKey: ADMIN_STATS_KEY, queryFn: () => call(api.GET('/api/v1/admin/stats')), refetchInterval: 60_000, enabled });
}

/** Mini Noora's AI: the limits, and the questions and estimated cost today and this month. */
export function useNooraUsage(enabled: boolean) {
  return useQuery({ queryKey: NOORA_USAGE_KEY, queryFn: () => call(api.GET('/api/v1/admin/noora')), refetchInterval: 60_000, enabled });
}

/** Admins set the questions per student per day and the monthly budget. */
export function useSetNooraLimits() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: NooraLimitsIn) => call(api.PUT('/api/v1/admin/noora', { body })),
    onSuccess: (out) => qc.setQueryData(NOORA_USAGE_KEY, out),
  });
}

/** A year's Sunday summary for this week: the text reps paste into the group. */
export function useSummaryPreview(year: CohortYear) {
  return useQuery({
    queryKey: ['summary', 'preview', year] as const,
    queryFn: () => call(api.GET('/api/v1/summary/preview', { params: { query: { year } } })),
  });
}
