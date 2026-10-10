// Counts for the moderation page. The queues (forum reports, library uploads) invalidate ADMIN_STATS_KEY after
// a decision, so these numbers follow.
import { useQuery } from '@tanstack/react-query';
import { api, call } from '../../api/client';

export const ADMIN_STATS_KEY = ['admin', 'stats'] as const;

export function useAdminStats() {
  return useQuery({
    queryKey: ADMIN_STATS_KEY,
    queryFn: () => call(api.GET('/api/v1/admin/stats')),
    refetchInterval: 60_000,
  });
}
