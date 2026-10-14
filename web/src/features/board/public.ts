// Public API of the study board. Other features import from here only.
//   <AddToBoard link={{ type, id }} />   "Add to my board" for a calendar event, a lesson, a module or a library item;
//                                        "On your board" once it's there. Gate it with featureOn('board'). Guests are
//                                        asked to sign in.
//   <PlanRevision moduleId moduleName examDate />
//                                        "Plan my revision": the module's unwatched lessons and past papers, spread to
//                                        the exam on the board. Gate it with featureOn('board').
//   <BoardTodo n />                      Home's "My to-do": the In progress and To do cards, due dates, "N more on your
//                                        board". Signed in, with featureOn('board').
//   <SittingsDone papers />              "4 of 12 sittings done" from the board (nothing until one is done)
//   <PaperDone itemId />                 a "Done" badge, with the private score, for a paper done on the board
export { AddToBoard } from './AddToBoard';
export { BoardTodo } from './BoardTodo';
export { PlanRevision } from './PlanDialog';
export { PaperDone, SittingsDone } from './PaperProgress';
