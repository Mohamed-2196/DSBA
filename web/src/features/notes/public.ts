// Public API of the notes feature (R-5): each student's private notes. Other features import from here only.
//   <LessonNotes moduleId chapter video />   a lesson page's "Your notes": its notes and a quick add (signed-in
//                                            students while notes are on; nothing otherwise)
//   useOpenNote()                            the note open in the editor right now ({ id, title, body, moduleId,
//                                            chapter, video }), or null: what Mini Noora can read (R-6)
//   getOpenNote()                            the same, read once, outside React
//
// Pages: /notes (the list) and /notes/:id (the editor; /notes/new starts a note, ?module=&chapter=&video= says
// what it's about).
export { LessonNotes } from './LessonNotes';
export type { LessonNotesProps } from './LessonNotes';
export { getOpenNote, useOpenNote } from './current';
export type { OpenNote } from './current';
