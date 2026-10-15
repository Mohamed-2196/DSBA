// Public API of the papers feature: the modules a student sits and their exam zone. Other features import from here
// only.
//
//   usePapers()     { picks, zone, home, year, papers, save, saving }: `papers` is the set of module ids the student
//                   sits in the browsed year, or null for every module of it.
//   isMine(e, year, papers)      does a calendar event count for the student
//   modulesFor(year, papers, catalogue)   the modules to list for them
//   <PapersDialog open onClose />, <PapersButton />   pick them ("Your modules", with the exam zone)
export { usePapers } from './usePapers';
export { isMine, modulesFor } from './papers';
export { PapersDialog, PapersButton } from './PapersDialog';
