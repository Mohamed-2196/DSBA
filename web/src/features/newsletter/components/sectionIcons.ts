// The icons a section's label may carry (section.icon is one of these names). Only these are bundled.
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

export const SECTION_ICONS: Record<string, Icon> = {
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

export const sectionIcon = (name: string | undefined): Icon => (name ? SECTION_ICONS[name] : undefined) ?? Newspaper;
