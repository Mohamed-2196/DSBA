// A guest's papers (the modules they sit) as this browser keeps them; an account keeps its own. Read by the papers
// feature, and by Home's first request, which starts before any page code (features/home/api.ts).
import { readStored } from '../state/storedValue';

/** localStorage: `{ papers: string[], zone }`. */
export const GUEST_PAPERS_KEY = 'hub.papers';

/** Picks as stored in a browser, or anything else: only well-formed ids, once each, at most 20. */
export function cleanPicks(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const ids = raw.filter((x): x is string => typeof x === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(x));
  return [...new Set(ids)].slice(0, 20);
}

/** The picks in what is stored under GUEST_PAPERS_KEY (anything at all). */
export function guestPicksOf(stored: unknown): string[] {
  return stored && typeof stored === 'object' ? cleanPicks((stored as Record<string, unknown>).papers) : [];
}

/** The guest's picks in this browser, read now. */
export function readGuestPicks(): string[] {
  return guestPicksOf(readStored<unknown>(GUEST_PAPERS_KEY, () => null));
}
