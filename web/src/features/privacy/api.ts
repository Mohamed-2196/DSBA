// GET /privacy: the outside services the notice names only while they handle students' data.
import { useQuery } from '@tanstack/react-query';
import { api, call } from '../../api/client';

export const PRIVACY_KEY = ['privacy'] as const;

export function usePrivacyServices() {
  return useQuery({
    queryKey: PRIVACY_KEY,
    queryFn: ({ signal }) => call(api.GET('/api/v1/privacy', { signal })),
    staleTime: 10 * 60_000,
  });
}
