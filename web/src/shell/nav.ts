// Navigation config for the shell (rail, mobile tab bar, More drawer).
import { glyph, type Glyph } from '../ui';
import type { Feature } from '../auth';

/** A section's colours (tokens.css --sec-<section>-*): its icon, its active pill and its labels. */
export type NavSection = 'home' | 'library' | 'modules' | 'notebook' | 'forum' | 'calendar' | 'search' | 'tools';

export interface NavItem {
  id: string;
  label: string;
  to: string;
  /** a brand icon; Noora shows her face instead */
  icon: Glyph;
  section: NavSection;
  /** 'tools' items sit under the rail's Tools heading */
  group: 'main' | 'tools';
  /** match the path exactly (Home) */
  end?: boolean;
  /** a "New" badge (rail) or dot (icon rail, tab bar) */
  isNew?: boolean;
  /** shown only while this feature is on for the person */
  feature?: Feature;
  /** shown only to signed-in people */
  signedIn?: true;
}

export const NAV: NavItem[] = [
  { id: 'home', label: 'Home', to: '/', icon: glyph.home, section: 'home', group: 'main', end: true },
  { id: 'modules', label: 'Modules', to: '/modules', icon: glyph.modules, section: 'modules', group: 'main' },
  {
    id: 'library',
    label: 'Library',
    to: '/library',
    icon: glyph.library,
    section: 'library',
    group: 'main',
    feature: 'library',
  },
  {
    id: 'notes',
    label: 'Notebook',
    to: '/notes',
    icon: glyph.notebook,
    section: 'notebook',
    group: 'main',
    feature: 'notes',
    signedIn: true,
  },
  {
    id: 'forum',
    label: 'Forum',
    to: '/forum',
    icon: glyph.forum,
    section: 'forum',
    group: 'main',
    isNew: true,
    feature: 'forum',
  },
  {
    id: 'calendar',
    label: 'Calendar',
    to: '/calendar',
    icon: glyph.calendar,
    section: 'calendar',
    group: 'main',
    feature: 'calendar',
  },
  {
    id: 'noora',
    label: 'Noora',
    to: '/noora',
    icon: glyph.sparkle,
    section: 'home',
    group: 'main',
    isNew: true,
    feature: 'noora',
  },
  {
    id: 'board',
    label: 'Boards',
    to: '/board',
    icon: glyph.boards,
    section: 'tools',
    group: 'tools',
    feature: 'board',
    signedIn: true,
  },
  {
    id: 'grades',
    label: 'Grades',
    to: '/grades',
    icon: glyph.grades,
    section: 'tools',
    group: 'tools',
    feature: 'grades',
  },
  {
    id: 'career',
    label: 'Career Navigator',
    to: '/career',
    icon: glyph.career,
    section: 'tools',
    group: 'tools',
    feature: 'career',
  },
  {
    id: 'newsletter',
    label: 'Newsletter',
    to: '/newsletter',
    icon: glyph.newsletter,
    section: 'tools',
    group: 'tools',
    feature: 'newsletter',
  },
  {
    id: 'daily',
    label: 'Daily puzzles',
    to: '/daily',
    icon: glyph.daily,
    section: 'tools',
    group: 'tools',
    feature: 'daily',
    isNew: true,
  },
  {
    id: 'requests',
    label: 'Requests',
    to: '/requests',
    icon: glyph.question,
    section: 'tools',
    group: 'tools',
    feature: 'requests',
  },
];

/** Mobile bottom tabs (+ "More"). */
export const MOBILE_TAB_IDS = ['home', 'modules', 'noora', 'library', 'forum'];
/** Routes that live under "More" on mobile. */
export const MORE_IDS = ['daily', 'newsletter', 'career', 'calendar', 'grades', 'notes', 'board', 'requests'];
