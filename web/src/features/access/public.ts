// The Access screen's parts other features use.
//   <PeopleList />            Manage's People section; `withRoles` adds each person's roles (the Access screen)
//   <ActivityLog />           Manage's Activity section
//   ADMIN_USERS_KEY, AUDIT_KEY  the people list's and the activity log's query keys
export { ADMIN_USERS_KEY, AUDIT_KEY } from './api';

export function PeopleList(_: { withRoles?: boolean }) {
  return null;
}
export function ActivityLog() {
  return null;
}
