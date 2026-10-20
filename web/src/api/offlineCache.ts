// What the hub keeps for reading offline, and for how long: the rules, as plain functions so they are unit-tested.
// The wiring (IndexedDB, the query cache) is in offline.ts.
//
// Only read-only screens a student would want on the bus are kept: the module catalogue and module pages, library
// lists and a file's details, past papers, the forum's lists and the threads they opened, the calendar and Home's
// cards. Nothing else: no sessions or codes, no account or admin screens, no review queues, no notifications, no
// search, no short-lived file links and no private calendar feed address. The signed-in person is kept without
// their email or phone, so the app still knows who it is while offline.
/** An entry older than this is never shown: a week, so last week's timetable doesn't pass for this week's. */
export const OFFLINE_MAX_AGE = 7 * 24 * 60 * 60_000;
/** An account's own entries are shown offline only this long after the app last heard, online, that its session
 *  is live: a day. A session that ended elsewhere (signed out from another device, or expired) can't be seen from
 *  an offline computer, so the next person there sees nothing personal after that (SEC-53). */
export const OWNER_LIVE_MAX_AGE = 24 * 60 * 60_000;
/** The whole snapshot stays under this many characters of JSON (about 4 MB); the oldest entries go first. */
export const OFFLINE_MAX_SIZE = 4_000_000;
/** And under this many entries. */
export const OFFLINE_MAX_ENTRIES = 400;

/**
 * Whose a kept query is:
 *   'shared'  the same for everyone (the module catalogue and module pages): kept whoever signs in next
 *   'owner'   it may carry the person's own marks (stars, votes, "yours"): it belongs to one account's snapshot
 *   null      never kept
 */
export type OfflineScope = 'shared' | 'owner' | null;

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/** The forum's families that are read-only pages ('similar' is a search while typing). */
const FORUM_FAMILIES = new Set(['list', 'hot', 'below', 'thread', 'related', 'meta', 'stats']);

export function offlineScope(key: readonly unknown[]): OfflineScope {
  const [root, family, ...rest] = key;
  switch (root) {
    case 'me':
      return key.length === 1 ? 'owner' : null;
    case 'modules':
      // the catalogue and a module's page are the same for everyone; its file lists carry stars
      if (key.length === 1 || family === 'detail') return 'shared';
      return family === 'files' ? 'owner' : null;
    case 'library': {
      if (family === 'list') {
        // a review queue (status) and someone's own uploads (mine) are not reading
        const query = rest[1];
        return isObject(query) && !query.status && !query.mine ? 'owner' : null;
      }
      if (family === 'facets' || family === 'item' || family === 'papers') return 'owner';
      // a paper's questions and a module's questions; the flagged list is the moderators' queue
      if (family === 'questions') return rest[0] === 'paper' || rest[0] === 'module' ? 'owner' : null;
      return null; // 'file': short-lived signed links
    }
    case 'forum':
      // never the student's own lists (yours, mine): they say which questions they asked, anonymous ones too
      if (family === 'list' && isObject(rest[0]) && (rest[0].yours || rest[0].mine)) return null;
      return typeof family === 'string' && FORUM_FAMILIES.has(family) ? 'owner' : null;
    case 'calendar':
      // the programme dates; never the student's own events or settings (the private feed address)
      return family === 'events' || family === 'upcoming' ? 'owner' : null;
    case 'papers':
      return family === 'choices' ? 'owner' : null;
    case 'progress':
      return key.length === 2 && family !== 'write' ? 'owner' : null; // ['progress', userId]
    case 'newsletter':
      // the published issues Home's card reads, never the drafts list
      return family === 'list' && isObject(rest[0]) && rest[0].drafts === false ? 'owner' : null;
    case 'guides':
    case 'site':
      return key.length === 1 ? 'owner' : null;
    default:
      return null;
  }
}

/** The data as it is kept, or undefined when there is nothing to keep (a guest's null, data that isn't JSON). */
export function keptData(key: readonly unknown[], data: unknown): unknown {
  if (data === undefined) return undefined;
  if (key[0] === 'me') {
    if (!isObject(data)) return undefined;
    return { ...data, email: null, phone: null };
  }
  // an anonymous thread is never kept: on the asker's computer, keeping it would say who asked it
  if (key[0] === 'forum' && key[1] === 'thread' && isObject(data) && data.anonymous === true) return undefined;
  return data;
}

/** One kept query. */
export interface OfflineEntry {
  hash: string;
  key: readonly unknown[];
  data: unknown;
  /** when its data was read from the API (the query's dataUpdatedAt) */
  updatedAt: number;
  /** its data's size as JSON, in characters */
  size: number;
}

/** What is stored: one account's entries ('guest' when nobody is signed in), and when the app last heard online
 *  that the account's session is live. */
export interface OfflineSnapshot {
  v: 1;
  owner: string;
  liveAt: number;
  entries: OfflineEntry[];
}

/** Whether a snapshot's own entries may be shown offline: always a guest's; an account's only for a day after its
 *  session was last seen live. */
export const ownerShown = (snapshot: Pick<OfflineSnapshot, 'owner' | 'liveAt'>, now: number): boolean =>
  snapshot.owner === 'guest' || now - snapshot.liveAt <= OWNER_LIVE_MAX_AGE;

/** The snapshot's owner for the session's answer (GET /auth/session's Me, or null for a guest). */
export const ownerOf = (me: unknown): string => (isObject(me) && typeof me.id === 'string' ? me.id : 'guest');

/** An entry for a query, or null when it isn't kept. */
export function entryFor(hash: string, key: readonly unknown[], data: unknown, updatedAt: number): OfflineEntry | null {
  if (!offlineScope(key)) return null;
  const kept = keptData(key, data);
  if (kept === undefined) return null;
  let size: number;
  try {
    size = JSON.stringify(kept)?.length ?? 0;
  } catch {
    return null;
  }
  if (!size || size > OFFLINE_MAX_SIZE) return null;
  return { hash, key, data: kept, updatedAt, size };
}

/** The entries to keep: none older than the max age, the newest first, within the size and count caps. */
export function prune(entries: Iterable<OfflineEntry>, now: number): OfflineEntry[] {
  const fresh = [...entries]
    .filter((e) => now - e.updatedAt <= OFFLINE_MAX_AGE && e.updatedAt <= now + 60_000)
    .sort((a, b) => b.updatedAt - a.updatedAt);
  const out: OfflineEntry[] = [];
  let total = 0;
  for (const e of fresh) {
    if (out.length >= OFFLINE_MAX_ENTRIES) break;
    if (total + e.size > OFFLINE_MAX_SIZE) continue;
    total += e.size;
    out.push(e);
  }
  return out;
}

const isEntry = (v: unknown): v is OfflineEntry =>
  isObject(v) &&
  typeof v.hash === 'string' &&
  Array.isArray(v.key) &&
  typeof v.updatedAt === 'number' &&
  typeof v.size === 'number' &&
  v.data !== undefined &&
  offlineScope(v.key) !== null;

/** A stored snapshot as read back, pruned, or null when it is missing, malformed or from another shape. */
export function readSnapshot(raw: unknown, now: number): OfflineSnapshot | null {
  if (!isObject(raw) || raw.v !== 1 || typeof raw.owner !== 'string' || !Array.isArray(raw.entries)) return null;
  const liveAt = typeof raw.liveAt === 'number' ? raw.liveAt : 0;
  return { v: 1, owner: raw.owner, liveAt, entries: prune(raw.entries.filter(isEntry), now) };
}
