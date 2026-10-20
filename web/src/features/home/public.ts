// Public interface of Home. Other features import from here only.
//   HOME_BLOCKS, ALL_HOME_BLOCKS   Home's blocks: what each is called and shows (Site settings' default for a new student)
//   EXAM_WEEK_PARTS, ALL_EXAM_WEEK_PARTS
//                                  what can lead Home on a phone in exam week (Site settings' examWeek.lead)
//   prefetchHome(qc)               Home's first request (GET /home), started with the page's code (routes.tsx)
export { ALL_BLOCKS as ALL_HOME_BLOCKS, BLOCKS as HOME_BLOCKS, type HomeBlock } from './blocks';
export { ALL_EXAM_WEEK_PARTS, EXAM_WEEK_PARTS, type ExamWeekPart } from './examWeek';
export { prefetchHome } from './api';
