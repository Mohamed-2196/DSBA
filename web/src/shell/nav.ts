// Navigation config for the shell (rail, mobile tab bar, More drawer).
import { Books, Calculator, CalendarDots, ChatsCircle, Compass, GameController, GraduationCap, HandWaving, House, Kanban, Newspaper, NotePencil, SquaresFour, Bank, type Icon } from '@phosphor-icons/react';
import { MYCLASS_URL, UOL_PORTAL_URL } from '../data/people';
import type { Feature } from '../auth';
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
  /** shown only while this feature is on for the person */
  feature?: Feature;
  /** shown only to signed-in people */
  signedIn?: true;
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
  { id: 'library', label: 'Library', to: '/library', icon: Books, feature: 'library' },
  { id: 'newsletter', label: 'Newsletter', to: '/newsletter', icon: Newspaper, feature: 'newsletter' },
  { id: 'forum', label: 'Forum', to: '/forum', icon: ChatsCircle, isNew: true, feature: 'forum' },
  // No isNew: "Career Navigator" + the New badge + the active mark is 266px in the 232px rail, which widens the whole nav grid.
  { id: 'career', label: 'Career Navigator', to: '/career', icon: Compass, feature: 'career' },
  { id: 'calendar', label: 'Calendar', to: '/calendar', icon: CalendarDots, feature: 'calendar' },
  { id: 'grades', label: 'Grades', to: '/grades', icon: Calculator, feature: 'grades' },
  { id: 'notes', label: 'Notes', to: '/notes', icon: NotePencil, feature: 'notes', signedIn: true },
  { id: 'board', label: 'Study board', to: '/board', icon: Kanban, feature: 'board', signedIn: true },
  { id: 'daily', label: 'Daily', to: '/daily', icon: GameController, feature: 'daily', isNew: true },
  { id: 'requests', label: 'Requests', to: '/requests', icon: HandWaving, feature: 'requests' },
];

export const EXTERNAL_LINKS: ExternalLink[] = [
  { id: 'myclass', label: 'MyClass', href: MYCLASS_URL, icon: GraduationCap, logo: 'myclass', logoHeight: 38 },
  { id: 'uol', label: 'UoL portal', href: UOL_PORTAL_URL, icon: Bank, logo: 'uol', logoHeight: 40 },
];

/** Mobile bottom tabs (+ "More"). */
export const MOBILE_TAB_IDS = ['home', 'modules', 'library', 'forum'];
/** Routes that live under "More" on mobile. */
export const MORE_IDS = ['daily', 'newsletter', 'career', 'calendar', 'grades', 'notes', 'board', 'requests'];
