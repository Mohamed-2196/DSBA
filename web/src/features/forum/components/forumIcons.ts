// The pictures a guideline, or a category for every year, can have beside it in the forum's sidebar (the API's
// ForumIcon), and what each is called in Manage → Forum.
import type { ForumIcon } from '../types';
import { glyph, type Glyph } from '../../../ui';

export const FORUM_ICONS: Readonly<Record<ForumIcon, { icon: Glyph; label: string }>> = {
  search: { icon: glyph.search, label: 'Magnifying glass' },
  tag: { icon: glyph.tag, label: 'Tag' },
  check: { icon: glyph.success, label: 'Tick' },
  shield: { icon: glyph.shieldCheck, label: 'Shield' },
  heart: { icon: glyph.heart, label: 'Heart' },
  chat: { icon: glyph.forum, label: 'Speech bubbles' },
  people: { icon: glyph.people, label: 'People' },
  book: { icon: glyph.book, label: 'Book' },
  calendar: { icon: glyph.calendar, label: 'Calendar' },
  flag: { icon: glyph.flag, label: 'Flag' },
  info: { icon: glyph.info, label: 'Information' },
  briefcase: { icon: glyph.briefcase, label: 'Briefcase' },
};
