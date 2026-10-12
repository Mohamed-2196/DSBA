// Counts for the moderation page. The queues (forum reports, library uploads) invalidate ADMIN_STATS_KEY after
// a decision, so these numbers follow.
import { useQuery } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import { ADMIN_STATS_KEY } from '../../api/keys';

/** Kept for the areas that import it from here; the key's home is src/api/keys.ts. */
export { ADMIN_STATS_KEY };

export function useAdminStats() {
  return useQuery({
    queryKey: ADMIN_STATS_KEY,
    queryFn: () => call(api.GET('/api/v1/admin/stats')),
    refetchInterval: 60_000,
  });
}
