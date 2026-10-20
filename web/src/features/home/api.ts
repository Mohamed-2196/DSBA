// Home's first screen in one request (GET /home): the site settings, the papers' choices, a guide while its card is
// due, the student's dates from today and their next exam, the day's past question for it, and the desk shelf's
// numbers. Its answer fills the queries of the endpoints it stands in for (same keys, same shapes), so the shell and
// Home's blocks read them without asking again.
//
//   useHome(year)        Home's query, for the year shown (a guest's papers come from this browser)
//   prefetchHome(qc)     starts it before the first render on Home's address (routes.tsx), and hands the site settings
//                        and the choices to whatever asks for them before it answers
//   seedFromHome(qc, h)  what an answer fills
import { queryOptions, useQuery, type QueryClient } from '@tanstack/react-query';
import { api, call } from '../../api/client';
import { GUIDES_KEY, HOME_KEY, PAPER_CHOICES_KEY, SITE_KEY } from '../../api/keys';
import type { HomeOut } from '../../api/types';
import { GUEST_PAPERS_KEY, guestPicksOf, readGuestPicks } from '../../lib/guestPapers';
import { storedBrowseYear, useLocalStorage, type CohortYear } from '../../state';

export interface HomeParams {
  year: CohortYear;
  /** a guest's papers, comma-separated ('' for none); an account's own count instead, on the server */
  picks: string;
}

export const homeKey = (p: HomeParams) => [...HOME_KEY, p] as const;

/** The queries an answer stands in for: the site settings, the choices, and the guides when it brings them. */
export function seedFromHome(qc: QueryClient, home: HomeOut): void {
  qc.setQueryData(SITE_KEY, home.site);
  qc.setQueryData(PAPER_CHOICES_KEY, home.choices);
  if (home.guides) qc.setQueryData(GUIDES_KEY, home.guides);
}

export function homeQuery(p: HomeParams) {
  return queryOptions({
    queryKey: homeKey(p),
    queryFn: async ({ client, signal }): Promise<HomeOut> => {
      const home = await call(
        api.GET('/api/v1/home', { params: { query: { year: p.year, picks: p.picks || undefined } }, signal }),
      );
      seedFromHome(client, home);
      return home;
    },
  });
}

/** What Home will ask for, as far as this browser can tell before the session is known. */
export function storedHomeParams(): HomeParams {
  return { year: storedBrowseYear() ?? 1, picks: readGuestPicks().join(',') };
}

/**
 * Home's request, started with the page's code. The site settings and the choices wait for its answer instead of
 * asking for themselves, unless they are already there (if it fails, they show their own error, and trying again
 * asks their own endpoints).
 */
export function prefetchHome(qc: QueryClient): void {
  void qc.prefetchQuery(homeQuery(storedHomeParams()));
  if (qc.getQueryData(SITE_KEY) === undefined) {
    void qc.prefetchQuery({
      queryKey: SITE_KEY,
      queryFn: async ({ client }) => (await client.fetchQuery(homeQuery(storedHomeParams()))).site,
    });
  }
  if (qc.getQueryData(PAPER_CHOICES_KEY) === undefined) {
    void qc.prefetchQuery({
      queryKey: PAPER_CHOICES_KEY,
      queryFn: async ({ client }) => (await client.fetchQuery(homeQuery(storedHomeParams()))).choices,
    });
  }
}

/** Home's first screen for `year` (the year it shows). */
export function useHome(year: CohortYear) {
  const [stored] = useLocalStorage<unknown>(GUEST_PAPERS_KEY, null);
  return useQuery(homeQuery({ year, picks: guestPicksOf(stored).join(',') }));
}
