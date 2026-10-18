// Public API of the papers feature: the modules a student sits and their exam zone. Other features import from here
// only.
//
//   usePapers()     { picks, zone, home, year, papers, choices, save, saving }: `papers` is the set of module ids
//                   the student sits in the browsed year, or null for every module of it; `choices` the option and
//                   the electives each year offers, from the grades calculator's rules.
//   PAPER_CHOICES_KEY            the choices' query, for whatever changes the grades calculator's rules
//   isMine(e, year, papers)      does a calendar event count for the student
//   modulesFor(year, papers, catalogue)   the modules to list for them
//   <PapersDialog open onClose />, <PapersButton />   pick them ("Your modules", with the exam zone)
//   papersNote(home, picks, papers, choices)   what Home says under the modules it lists, and its button's words
export { usePapers } from './usePapers';
export { PAPER_CHOICES_KEY } from './api';
export { isMine, modulesFor, papersNote } from './papers';
export { PapersDialog, PapersButton } from './PapersDialog';
