// The shell shows a feature's entry only while the feature is on for the person, and a personal one (notes) only
// to signed-in people. While the account is still loading, it shows what it showed last time in this browser, so
// the tab bar doesn't grow under the thumb once it arrives (UX-77).
import type { Feature } from '../auth';
import type { NavItem } from './nav';

export function visibleNav(items: NavItem[], isOn: (f: Feature) => boolean, signedIn = false): NavItem[] {
  return items.filter((n) => (!n.feature || isOn(n.feature)) && (!n.signedIn || signedIn));
}

/** Where the entries shown last time are kept (ids only: nothing personal). */
export const SHOWN_NAV_KEY = 'hub.shownNav';

/** The ids remembered, or null when there are none (or they can't be read). */
export function rememberedNav(raw: unknown): string[] | null {
  return Array.isArray(raw) && raw.every((x) => typeof x === 'string') ? (raw as string[]) : null;
}

/**
 * The entries to show while the account loads: the ones shown last time, or, on a first visit, every entry that
 * doesn't need an account (most features are on, and a missing one is less jarring than tabs popping in).
 */
export function loadingNav(items: NavItem[], remembered: string[] | null): NavItem[] {
  return remembered ? items.filter((n) => remembered.includes(n.id)) : items.filter((n) => !n.signedIn);
}
