// Who has a student rep's or an admin's powers, decided the way the API decides it (api/app/core/security.py,
// is_moderator and is_admin): the role, on an active account. A suspended rep or admin keeps the role but has no
// powers left: they see and do what any student does (security review SEC-1).
import type { Me } from '../api/types';

type Account = Pick<Me, 'role' | 'status'>;

/** A student rep or an admin, not suspended. */
export function canModerate(me: Account | null | undefined): boolean {
  return !!me && me.status === 'active' && (me.role === 'moderator' || me.role === 'admin');
}

/** An admin, not suspended. */
export function canAdminister(me: Account | null | undefined): boolean {
  return !!me && me.status === 'active' && me.role === 'admin';
}

/** Holds the role a page is for, suspended or not: says whether "you're suspended" is the reason it's closed. */
export function holdsRole(me: Account | null | undefined, need: 'moderator' | 'admin'): boolean {
  if (!me) return false;
  return need === 'admin' ? me.role === 'admin' : me.role === 'moderator' || me.role === 'admin';
}
