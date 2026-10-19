// "New" in the navigation lasts until the person first opens that section: the sections each account (or a guest)
// has opened in this browser, by account. The list isn't personal data and stays after signing out, so the badges
// don't come back.
import type { NavItem } from './nav';

/** localStorage: { [account id or 'guest']: nav ids opened } */
export const SEEN_KEY = 'hub.navSeen';

export type SeenNav = Record<string, string[]>;

const accountKey = (account: string | null): string => account ?? 'guest';

/** Reads the stored value, whatever shape it has. */
export function asSeen(value: unknown): SeenNav {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: SeenNav = {};
  for (const [k, v] of Object.entries(value))
    if (Array.isArray(v)) out[k] = v.filter((x): x is string => typeof x === 'string');
  return out;
}

/** The nav item a path belongs to: its own page or one under it. */
export function navAt(items: readonly NavItem[], pathname: string): NavItem | null {
  return items.find((n) => (n.end ? pathname === n.to : pathname === n.to || pathname.startsWith(`${n.to}/`))) ?? null;
}

/** The seen list with `id` added for this account (the same object when it was there). */
export function markSeen(seen: SeenNav, account: string | null, id: string): SeenNav {
  const key = accountKey(account);
  const mine = seen[key] ?? [];
  return mine.includes(id) ? seen : { ...seen, [key]: [...mine, id] };
}

/** The items with "New" kept only where this account hasn't opened them yet. */
export function withSeen(items: NavItem[], seen: SeenNav, account: string | null): NavItem[] {
  const mine = seen[accountKey(account)] ?? [];
  return items.map((n) => (n.isNew && mine.includes(n.id) ? { ...n, isNew: false } : n));
}
