// The shell shows a feature's entry only while the feature is on for the person, and a personal one (notes) only
// to signed-in people.
import type { Feature } from '../auth';
import type { NavItem } from './nav';

export function visibleNav(items: NavItem[], isOn: (f: Feature) => boolean, signedIn = false): NavItem[] {
  return items.filter((n) => (!n.feature || isOn(n.feature)) && (!n.signedIn || signedIn));
}
