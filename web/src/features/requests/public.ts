// Public interface of the requests feature. Other features import from here only.
//
//   <AskLink kind? lead? />   "Can't find it? Ask for it": opens /requests with "New request" on that kind (a paper by
//                             default). Nothing while requests are off or the account is suspended.
//   <RequestsQueue />         Manage's requests section: open and planned requests with the reps' answer form.
//
// Request links are /requests/<id>.
export { AskLink } from './AskLink';
export type { AskLinkProps } from './AskLink';
export { RequestsQueue } from './RequestsQueue';
