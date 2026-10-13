// Public API of the study board. Other features import from here only.
//   <AddToBoard link={{ type, id }} />   "Add to my board" for a calendar event, a lesson ('<module>:<chapter>:<video>'),
//                                        a module or a library item; "On your board" once it's there. Gate it with
//                                        featureOn('board'). Guests are asked to sign in.
//   BOARD_KEY                            the board's query key (GET /board)
export { AddToBoard, type AddToBoardProps } from './AddToBoard';
export { BOARD_KEY } from './api';
