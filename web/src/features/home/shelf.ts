// Home's desk shelf: one tile per core section, each with its deskmate and a live line ("12 new", "Exam Thu"). Pure,
// so the words are tested (shelf.test.ts); HomeShelf.tsx gathers the numbers.
import { formatDayMonth, weekdayOf } from '../../lib/dates';
import type { MateSection } from '../../ui';

export type ShelfSection = Extract<MateSection, 'library' | 'modules' | 'notebook' | 'forum' | 'calendar'>;

export interface ShelfTile {
  section: ShelfSection;
  label: string;
  to: string;
  /** the live line under the label, or null while it loads */
  line: string | null;
  /** the line is news (new files, unread replies, an exam this week): it takes the section's colour */
  news: boolean;
}

export interface ShelfFacts {
  /** files students shared in the last 7 days; null while loading */
  newFiles: number | null;
  /** the modules the student studies (their year's, or their papers) */
  modules: number;
  /** the student's notes; null for a guest or while loading */
  notes: number | null;
  signedIn: boolean;
  /** unread replies to the student in the forum */
  replies: number;
  /** days to the next exam (0 today), and its date; null when none is coming */
  exam: { days: number; date: Date } | null;
  /** sections switched on */
  on: (section: ShelfSection) => boolean;
}

/** "Exam today", "Exam tomorrow", "Exam Thu" within the week, "Exam 3 Nov" after. */
export function examLine(days: number, date: Date): string {
  if (days <= 0) return 'Exam today';
  if (days === 1) return 'Exam tomorrow';
  if (days < 7) return `Exam ${weekdayOf(date).short}`;
  return `Exam ${formatDayMonth(date)}`;
}

export function shelfTiles(f: ShelfFacts): ShelfTile[] {
  const tiles: ShelfTile[] = [
    {
      section: 'library',
      label: 'Library',
      to: '/library',
      line: f.newFiles == null ? null : f.newFiles > 0 ? `${f.newFiles} new` : 'Papers and notes',
      news: (f.newFiles ?? 0) > 0,
    },
    {
      section: 'modules',
      label: 'Modules',
      to: '/modules',
      line: f.modules ? `${f.modules} ${f.modules === 1 ? 'module' : 'modules'}` : 'Lessons and files',
      news: false,
    },
    {
      section: 'notebook',
      label: 'Notebook',
      to: '/notes',
      line: !f.signedIn
        ? 'Your notes'
        : f.notes == null
          ? null
          : f.notes
            ? `${f.notes} ${f.notes === 1 ? 'note' : 'notes'}`
            : 'Start a note',
      news: false,
    },
    {
      section: 'forum',
      label: 'Forum',
      to: '/forum',
      line: f.replies > 0 ? `${f.replies} ${f.replies === 1 ? 'reply' : 'replies'}` : 'Ask a question',
      news: f.replies > 0,
    },
    {
      section: 'calendar',
      label: 'Calendar',
      to: '/calendar',
      line: f.exam ? examLine(f.exam.days, f.exam.date) : 'Your dates',
      news: !!f.exam && f.exam.days < 7,
    },
  ];
  return tiles.filter((t) => f.on(t.section));
}
