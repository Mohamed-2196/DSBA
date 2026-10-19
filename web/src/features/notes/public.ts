// Public API of the notes feature: each student's private notes. Other features import from here only.
//   <LessonNotes moduleId lessonId />        a lesson page's "Your notes": its notes and a quick add (signed-in
//                                            students while notes are on; nothing otherwise)
//   useOpenNote()                            the note open in the editor right now ({ id, title, body, moduleId,
//                                            lessonId }), or null: what Mini Noora may send when the student
//                                            ticks "Include my note"
//   useNotes(filters), useNote(id)           the student's notes, a page at a time, and one note with its body
//                                            (Noora's full page adds a note to a question)
//
// Pages: /notes (the list; ?notebook=, or ?module=&lesson= for one lesson's notes) and /notes/:id (the editor).
export { LessonNotes } from './LessonNotes';
export { useOpenNote } from './current';
export { useAnnotate, useNote, useNotes } from './api';
export type { OpenNote } from './current';
