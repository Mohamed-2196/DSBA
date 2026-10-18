// What the student added to the full page's questions (AddContext.tsx): one subject (a module, or a lesson in it),
// one past paper's question and one note at most. Labels are what the chips show.
export type Subject =
  | { kind: 'module'; moduleId: string; label: string }
  | { kind: 'lesson'; moduleId: string; lessonId: string; label: string };
export interface PaperPick {
  itemId: string;
  page: number;
  question: string;
  label: string;
}
export interface NotePick {
  noteId: string;
  label: string;
}
export interface Added {
  subject: Subject | null;
  paper: PaperPick | null;
  note: NotePick | null;
}
export const NOTHING_ADDED: Added = { subject: null, paper: null, note: null };
