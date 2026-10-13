// The hub's numbers for Manage. The queues (forum reports, library uploads) invalidate ADMIN_STATS_KEY after a
// decision, so they follow. A count is null while its feature is switched off.
import { useQuery } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import { ADMIN_STATS_KEY } from '../../api/keys';

export function useAdminStats(enabled: boolean) {
  return useQuery({ queryKey: ADMIN_STATS_KEY, queryFn: () => call(api.GET('/api/v1/admin/stats')), refetchInterval: 60_000, enabled });
}
