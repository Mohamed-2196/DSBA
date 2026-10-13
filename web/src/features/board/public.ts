// Public API of the study board. Other features import from here only.
//   <AddToBoard link={{ type, id }} />   "Add to my board" for a calendar event, a lesson ('<module>:<chapter>:<video>'),
//                                        a module or a library item; "On your board" once it's there. Gate it with
//                                        featureOn('board'). Guests are asked to sign in.
export { AddToBoard } from './AddToBoard';
