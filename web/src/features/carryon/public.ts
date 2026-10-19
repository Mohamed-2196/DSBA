// Public API of "Carry on" (pick up where you left off). Other features import from here only.
//   <CarryOn moduleId? n? />        the paper being timed, then the last papers, files, notes and lessons opened in
//                                   this browser (one list per account), each a link back; with moduleId, that
//                                   module's only. Renders nothing while there is nothing to pick up.
//   useCarryOn({ moduleId?, n? })   what it would show ({ timed, rows, any, clear }): Home shows the block only when
//                                   `any`
//   useRecordVisit(visit | null)    notes that a paper, file, note or lesson was opened (the library's file page)
//   <VisitRecorder />               notes the notes and lessons opened, from the address (the shell mounts it once)
export { CarryOn } from './CarryOn';
export { useCarryOn } from './useCarryOn';
export { useRecordVisit } from './useRecent';
export { VisitRecorder } from './VisitRecorder';
