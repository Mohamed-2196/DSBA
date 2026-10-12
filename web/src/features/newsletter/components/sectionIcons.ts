// The icons a section's label may carry (IssueSection.icon names one of them: the API lists the same names). Only
// these are bundled.
import {
  Books,
  CalendarCheck,
  ChartLineUp,
  ChatsCircle,
  Lightbulb,
  ListBullets,
  Megaphone,
  Microphone,
  Newspaper,
  NotePencil,
  RocketLaunch,
  Sparkle,
  Student,
  UsersThree,
  type Icon,
} from '@phosphor-icons/react';
import type { SectionIcon } from '../types';

export const SECTION_ICONS: Record<SectionIcon, Icon> = {
  NotePencil,
  ListBullets,
  CalendarCheck,
  Sparkle,
  Megaphone,
  UsersThree,
  Lightbulb,
  Student,
  ChatsCircle,
  Books,
  ChartLineUp,
  Microphone,
  RocketLaunch,
  Newspaper,
};

export const sectionIcon = (name: SectionIcon | null | undefined): Icon => (name ? SECTION_ICONS[name] : Newspaper);
