// Coming back from Google: the browser left the app for Google's page and returns to the page it left, with
// ?authError=<code> when it didn't work. What the app should say then is decided here (GoogleReturn shows it).

/** Which Google flow this tab started, kept for the trip to Google and back (sessionStorage: this tab only). */
export type GoogleTrip = 'sign-in' | 'link';
const TRIP_KEY = 'hub.google';

export function markGoogleTrip(trip: GoogleTrip): void {
  try {
    window.sessionStorage.setItem(TRIP_KEY, trip);
  } catch {
    /* storage unavailable: the return is quieter, nothing else */
  }
}

/** The trip this tab started, read once. */
export function takeGoogleTrip(): GoogleTrip | null {
  try {
    const trip = window.sessionStorage.getItem(TRIP_KEY);
    window.sessionStorage.removeItem(TRIP_KEY);
    return trip === 'sign-in' || trip === 'link' ? trip : null;
  } catch {
    return null;
  }
}

/** The current page, to come back to from Google. */
export function hereNow(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

/** The ?authError=… Google's return carries, and the address without it (null when there is none). */
export function readAuthError(search: string): { code: string; search: string } | null {
  const params = new URLSearchParams(search);
  const code = params.get('authError');
  if (code === null) return null;
  params.delete('authError');
  const rest = params.toString();
  return { code, search: rest ? `?${rest}` : '' };
}
