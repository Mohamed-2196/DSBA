// Public API of the papers feature. Other features import from here only.
//
//   usePapers()     { picks, zone, home, year, papers, save, saving }: `papers` is the set of module ids the student
//                   sits in the browsed year, or null for every module of it.
//   isMine(e, year, papers)      does a calendar event count for the student
//   modulesFor(year, papers, catalogue)   the modules to list for them
//   <PapersDialog open onClose />, <PapersButton />   pick them
export { usePapers } from './usePapers';
export { isMine, modulesFor, type Zone } from './papers';
export { PapersDialog, PapersButton } from './PapersDialog';
