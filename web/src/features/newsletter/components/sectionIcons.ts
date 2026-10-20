// The icons a section's label may carry (IssueSection.icon names one of them: the API lists the same names). Only
// these are bundled.
import type { SectionIcon } from '../types';
import { glyph, type Glyph } from '../../../ui';

export const SECTION_ICONS: Record<SectionIcon, Glyph> = {
  NotePencil: glyph.notepad,
  ListBullets: glyph.list,
  CalendarCheck: glyph.calendarCheck,
  Sparkle: glyph.sparkle,
  Megaphone: glyph.megaphone,
  UsersThree: glyph.people,
  Lightbulb: glyph.bulb,
  Student: glyph.cap,
  ChatsCircle: glyph.forum,
  Books: glyph.library,
  ChartLineUp: glyph.chartLine,
  Microphone: glyph.mic,
  RocketLaunch: glyph.rocket,
  Newspaper: glyph.newsletter,
};

export const sectionIcon = (name: SectionIcon | null | undefined): Glyph =>
  name ? SECTION_ICONS[name] : glyph.newsletter;
