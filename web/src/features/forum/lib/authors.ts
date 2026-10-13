// How people appear next to their posts. Authors are UserPublic ({ id, displayName, year, badge }) or null when the
// account was deleted.
import type { UserPublic } from '../../../api/types';
import type { CohortYear } from '../../../state';

export const DELETED_ACCOUNT = 'Deleted account';

export function authorName(user: UserPublic | null | undefined): string {
  return user?.displayName?.trim() || DELETED_ACCOUNT;
}

/** The small pill next to a name that replaces the year: the badge of a role such as Student rep or Admin. */
export function roleFlair(user: UserPublic | null | undefined): string | null {
  if (user?.badge) return user.badge;
  return null;
}

/** The cohort to show for a post: the author's year when they posted, else their year now. */
export function postYear(authorYear: CohortYear | null | undefined, user: UserPublic | null | undefined): CohortYear | null {
  return authorYear ?? user?.year ?? null;
}

export function sameAuthor(a: UserPublic | null | undefined, b: UserPublic | null | undefined): boolean {
  return !!a && !!b && a.id === b.id;
}
