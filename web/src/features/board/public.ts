// Public API of boards. Other features import from here only.
//   <AddToBoard link={{ type, id }} />   "Add to my board" for a calendar event, a lesson, a module or a library item;
//                                        "On your board" once it's there. Gate it with featureOn('board'). Guests are
//                                        asked to sign in.
//   <PlanRevision moduleId moduleName examDate />
//                                        "Plan my revision": the module's unwatched lessons and past papers, spread to
//                                        the exam on the board. Gate it with featureOn('board').
//   <BoardTodo n />                      Home's "To-do": the first n cards overdue or due in the next 7 days on the
//                                        active boards (cards without a date stay there), and "N more on your boards",
//                                        which opens Today. Signed in, with featureOn('board').
//   useTodayAgenda({ enabled })          those cards: Home shows the block only while there are some
//   <SittingsDone papers />              "4 of 12 sittings done" from the board (nothing until one is done)
//   <PaperDone itemId />                 a "Done" badge, with the private score, for a paper done on the board or
//                                        scored
//   <PaperScoreDialog itemId title onSaved? onClose />
//                                        "How did it go?": saves the student's practice score on a past paper
//                                        (signed in, with featureOn('board'))
export { AddToBoard } from './AddToBoard';
export { BoardTodo } from './BoardTodo';
export { useTodayAgenda } from './api';
export { PlanRevision } from './PlanDialog';
export { PaperDone, SittingsDone } from './PaperProgress';
export { PaperScoreDialog } from './ScoreDialog';
