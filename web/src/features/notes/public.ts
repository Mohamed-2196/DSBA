// Public API of the notes feature (R-5): each student's private notes. Other features import from here only.
//   <LessonNotes moduleId lessonId />        a lesson page's "Your notes": its notes and a quick add (signed-in
//                                            students while notes are on; nothing otherwise)
//   useOpenNote()                            the note open in the editor right now ({ id, title, body, moduleId,
//                                            lessonId }), or null: what Mini Noora may send when the student
//                                            ticks "Include my note" (R-6)
//
// Pages: /notes (the list) and /notes/:id (the editor; /notes/new starts a note, ?module=&lesson= says
// what it's about).
export { LessonNotes } from './LessonNotes';
export { useOpenNote } from './current';
export type { OpenNote } from './current';
