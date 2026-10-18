// Mini Noora's words (GET /mini-noora/script): what she says from her script, the questions she offers on each page
// and the cards of her full page. Admins edit them in Manage → Mini Noora; they change rarely, so one load every ten
// minutes is plenty.
import { useQuery } from '@tanstack/react-query';
import { api, call } from '../../api/client';

export const SCRIPT_KEY = ['mini-noora', 'script'] as const;

export function useNooraScript() {
  return useQuery({
    queryKey: SCRIPT_KEY,
    queryFn: ({ signal }) => call(api.GET('/api/v1/mini-noora/script', { signal })),
    staleTime: 10 * 60_000,
  });
}
