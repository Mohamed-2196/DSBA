// The choices a student makes inside a year (GET /modules/choices): the Year 2 option and the electives, with how many
// to pick, as the grades calculator's rules have them. Served whether or not the calculator is on.
import { useQuery } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import { PAPER_CHOICES_KEY } from '../../api/keys';

/** The rules change a few times a year at most; saving them refreshes this (grades/api.ts). */
export function usePaperChoices() {
  return useQuery({
    queryKey: PAPER_CHOICES_KEY,
    queryFn: ({ signal }) => call(api.GET('/api/v1/modules/choices', { signal })),
    staleTime: 10 * 60_000,
  });
}
