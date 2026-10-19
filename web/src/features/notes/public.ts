// Public API of the notes feature: each student's private notes. Other features import from here only.
//   <LessonNotes moduleId lessonId />        a lesson page's "Your notes": its notes and a quick add (signed-in
//                                            students while notes are on; nothing otherwise)
//   useOpenNote()                            the note open in the editor right now ({ id, title, body, moduleId,
//                                            lessonId }), or null: what Mini Noora may send when the student
//                                            ticks "Include my note"
//   useNotes(filters), useNote(id)           the student's notes, a page at a time, and one note with its body
//                                            (Noora's full page adds a note to a question)
//   useModuleNotes(moduleId, { limit, enabled })
//                                            a module's notes from every notebook, last edited first ({ items,
//                                            total }): a module page's "Your notes" (enable it for signed-in students
//                                            while notes are on; each links to /notes/:id, "All" to
//                                            /notes?module=<id>)
//   useStartNote()                           { start({ moduleId, lessonId }), starting }: a new note about a module
//                                            (or lesson), opened in the editor
//
// Pages: /notes (the list; ?notebook=, ?module= for a module's notes, ?module=&lesson= for one lesson's) and
// /notes/:id (the editor).
export { LessonNotes } from './LessonNotes';
export { useOpenNote } from './current';
export { useAnnotate, useModuleNotes, useNote, useNotes } from './api';
export { useStartNote } from './useStartNote';
export type { OpenNote } from './current';
