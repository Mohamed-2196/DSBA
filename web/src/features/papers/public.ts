// Public API of the papers feature: the modules a student sits and their exam zone. Other features import from here
// only.
//
//   usePapers()     { picks, zone, home, year, papers, choices, save, saving, resits, setResit }: `papers` is the set
//                   of module ids the student sits in the browsed year, or null for every module of it; `choices` the
//                   option and the electives each year offers, from the grades calculator's rules; `resits` the
//                   modules they are resitting ("I'm resitting this", signed in only), set with setResit(id, on).
//   isMine(e, year, papers, resits?)   does a calendar event count for the student (a resit: resitFor)
//   resitFor(e, year, resits?)   is a resit for them: the year after its module's, or they are resitting it
//   modulesFor(year, papers, catalogue)   the modules to list for them
//   <PapersDialog open onClose />, <PapersButton />   pick them ("Your modules", with the exam zone)
//   papersNote(home, picks, papers, choices)   what Home says under the modules it lists, and its button's words
export { usePapers } from './usePapers';
export { isMine, modulesFor, NO_RESITS, papersNote, resitFor } from './papers';
export { PapersDialog, PapersButton } from './PapersDialog';
