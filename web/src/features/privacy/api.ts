// GET /privacy: the outside services the notice names only while they handle students' data.
import { useQuery } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import { PRIVACY_KEY } from '../../api/keys';

/** Read again on every visit and every five minutes while the notice is open, and after an admin changes a switch
 *  (access/api.ts), so a service switched on since is never left out by an older answer (COM-280 I5). */
export function usePrivacyServices() {
  return useQuery({
    queryKey: PRIVACY_KEY,
    queryFn: ({ signal }) => call(api.GET('/api/v1/privacy', { signal })),
    staleTime: 0,
    refetchInterval: 5 * 60_000,
  });
}
