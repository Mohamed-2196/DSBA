// How people appear next to their posts. Authors are UserPublic ({ id, displayName, year, role }) or null when the
// account was deleted.
import type { UserPublic } from '../../../api/types';
import type { CohortYear } from '../types';

export const DELETED_ACCOUNT = 'Deleted account';

export function authorName(user: UserPublic | null | undefined): string {
  return user?.displayName?.trim() || DELETED_ACCOUNT;
}

/** The small pill next to a name that replaces the year: student reps and admins. */
export function roleFlair(user: UserPublic | null | undefined): string | null {
  if (user?.role === 'moderator') return 'Student rep';
  if (user?.role === 'admin') return 'Admin';
  return null;
}

/** The cohort to show for a post: the author's year when they posted, else their year now. */
export function postYear(authorYear: CohortYear | null | undefined, user: UserPublic | null | undefined): CohortYear | null {
  return authorYear ?? user?.year ?? null;
}

export function sameAuthor(a: UserPublic | null | undefined, b: UserPublic | null | undefined): boolean {
  return !!a && !!b && a.id === b.id;
}
