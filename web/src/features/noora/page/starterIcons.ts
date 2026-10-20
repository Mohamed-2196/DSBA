// The pictures of her full page's starter cards (the API's StarterIcon), and what each is called in Manage →
// Mini Noora.
import type { NooraStarter } from '../../../api/types';
import { glyph, type Glyph } from '../../../ui';

export const STARTER_ICONS: Readonly<Record<NooraStarter['icon'], { icon: Glyph; label: string }>> = {
  lightbulb: { icon: glyph.bulb, label: 'Light bulb' },
  teacher: { icon: glyph.teacher, label: 'Teacher at a board' },
  checklist: { icon: glyph.checklist, label: 'Checklist' },
  notepad: { icon: glyph.notepad, label: 'Notepad' },
  exam: { icon: glyph.exam, label: 'Exam paper' },
  briefcase: { icon: glyph.briefcase, label: 'Briefcase' },
  pencil: { icon: glyph.edit, label: 'Pencil' },
  magnifier: { icon: glyph.search, label: 'Magnifying glass' },
};
