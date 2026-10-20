// Where the browsed year is kept (YearProvider.tsx): the year chosen in this browser (localStorage), and a signed-in
// student's detour to another year for this visit (sessionStorage). Read before the first render too, by requests that
// start before the session is known (Home's, features/home/api.ts).
import { normalizeYear, type CohortYear } from './cohort';

export const YEAR_KEY = 'selectedYear'; // raw '1' | '2' | '3' (not JSON)
export const VISIT_YEAR_KEY = 'hub.browseYear';

export const local = () => window.localStorage;
export const session = () => window.sessionStorage;

export function readYear(storage: () => Storage, key: string): CohortYear | null {
  try {
    return normalizeYear(storage().getItem(key));
  } catch {
    return null;
  }
}

/** The year this browser will show, as best it can tell before the session is known: a detour this visit, else the
 *  year chosen here (which is a signed-in student's own once they have signed in here); null when none is. */
export function storedBrowseYear(): CohortYear | null {
  return readYear(session, VISIT_YEAR_KEY) ?? readYear(local, YEAR_KEY);
}
