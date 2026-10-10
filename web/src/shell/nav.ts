// Navigation config for the shell (rail, mobile tab bar, More drawer).
import { Books, Calculator, CalendarDots, ChatsCircle, Compass, GraduationCap, House, Newspaper, SquaresFour, Bank, type Icon } from '@phosphor-icons/react';
import { MYCLASS_URL, UOL_PORTAL_URL } from '../data/people';
import type { BrandLogoName } from '../ui';

export interface NavItem {
  id: string;
  label: string;
  to: string;
  icon: Icon;
  /** match the path exactly (Home) */
  end?: boolean;
  /** a "New" badge (rail) or dot (icon rail, tab bar) */
  isNew?: boolean;
}

export interface ExternalLink {
  id: string;
  label: string;
  href: string;
  icon: Icon;
  logo: BrandLogoName;
  logoHeight: number;
}

export const NAV: NavItem[] = [
  { id: 'home', label: 'Home', to: '/', icon: House, end: true },
  { id: 'modules', label: 'Modules', to: '/modules', icon: SquaresFour },
  { id: 'library', label: 'Library', to: '/library', icon: Books },
  { id: 'newsletter', label: 'Newsletter', to: '/newsletter', icon: Newspaper },
  { id: 'forum', label: 'Forum', to: '/forum', icon: ChatsCircle, isNew: true },
  // No isNew: "Career Navigator" + the New badge + the active mark is 266px in the 232px rail, which widens the whole nav grid.
  { id: 'career', label: 'Career Navigator', to: '/career', icon: Compass },
  { id: 'calendar', label: 'Calendar', to: '/calendar', icon: CalendarDots },
  { id: 'grades', label: 'Grades', to: '/grades', icon: Calculator },
];

export const EXTERNAL_LINKS: ExternalLink[] = [
  { id: 'myclass', label: 'MyClass', href: MYCLASS_URL, icon: GraduationCap, logo: 'myclass', logoHeight: 38 },
  { id: 'uol', label: 'UoL portal', href: UOL_PORTAL_URL, icon: Bank, logo: 'uol', logoHeight: 40 },
];

/** Mobile bottom tabs (+ "More"). */
export const MOBILE_TAB_IDS = ['home', 'modules', 'library', 'forum'];
/** Routes that live under "More" on mobile. */
export const MORE_IDS = ['newsletter', 'career', 'calendar', 'grades'];
