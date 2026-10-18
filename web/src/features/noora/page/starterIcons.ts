// The pictures of her full page's starter cards (the API's StarterIcon), and what each is called in Manage →
// Mini Noora.
import { Briefcase, ChalkboardTeacher, Exam, Lightbulb, ListChecks, MagnifyingGlass, NotePencil, PencilLine, type Icon } from '@phosphor-icons/react';
import type { NooraStarter } from '../../../api/types';

export const STARTER_ICONS: Readonly<Record<NooraStarter['icon'], { icon: Icon; label: string }>> = {
  lightbulb: { icon: Lightbulb, label: 'Light bulb' },
  teacher: { icon: ChalkboardTeacher, label: 'Teacher at a board' },
  checklist: { icon: ListChecks, label: 'Checklist' },
  notepad: { icon: NotePencil, label: 'Notepad' },
  exam: { icon: Exam, label: 'Exam paper' },
  briefcase: { icon: Briefcase, label: 'Briefcase' },
  pencil: { icon: PencilLine, label: 'Pencil' },
  magnifier: { icon: MagnifyingGlass, label: 'Magnifying glass' },
};
