// Public API of the notes feature (R-5): each student's private notes. Other features import from here only.
//   <LessonNotes moduleId chapter video />   a lesson page's "Your notes": its notes and a quick add (signed-in
//                                            students while notes are on; nothing otherwise)
//
// Pages: /notes (the list) and /notes/:id (the editor; /notes/new starts a note, ?module=&chapter=&video= says
// what it's about).
export { LessonNotes } from './LessonNotes';
