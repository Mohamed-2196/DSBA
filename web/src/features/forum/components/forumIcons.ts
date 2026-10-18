// The pictures a guideline, or a category for every year, can have beside it in the forum's sidebar (the API's
// ForumIcon), and what each is called in Manage → Forum.
import {
  BookOpenText,
  Briefcase,
  CalendarDots,
  ChatsCircle,
  CheckCircle,
  Flag,
  HandHeart,
  Info,
  MagnifyingGlass,
  ShieldCheck,
  Tag,
  UsersThree,
  type Icon,
} from '@phosphor-icons/react';
import type { ForumIcon } from '../types';

export const FORUM_ICONS: Readonly<Record<ForumIcon, { icon: Icon; label: string }>> = {
  search: { icon: MagnifyingGlass, label: 'Magnifying glass' },
  tag: { icon: Tag, label: 'Tag' },
  check: { icon: CheckCircle, label: 'Tick' },
  shield: { icon: ShieldCheck, label: 'Shield' },
  heart: { icon: HandHeart, label: 'Heart' },
  chat: { icon: ChatsCircle, label: 'Speech bubbles' },
  people: { icon: UsersThree, label: 'People' },
  book: { icon: BookOpenText, label: 'Book' },
  calendar: { icon: CalendarDots, label: 'Calendar' },
  flag: { icon: Flag, label: 'Flag' },
  info: { icon: Info, label: 'Information' },
  briefcase: { icon: Briefcase, label: 'Briefcase' },
};
