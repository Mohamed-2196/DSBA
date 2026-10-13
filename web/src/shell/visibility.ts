// The shell shows a feature's entry only while the feature is on for the person.
import type { Feature } from '../auth';
import type { NavItem } from './nav';

export function visibleNav(items: NavItem[], isOn: (f: Feature) => boolean): NavItem[] {
  return items.filter((n) => !n.feature || isOn(n.feature));
}
