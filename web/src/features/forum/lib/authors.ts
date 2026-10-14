// How people appear next to their posts. Authors are UserPublic ({ id, displayName, year, badge }) or null when the
// account was deleted, or when the post is anonymous and you are neither its author nor a moderator.
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

/** A post as its byline needs it: a thread, or a reply (anonymous: the anonymous thread's author replying in it). */
export interface PostAuthor {
  author: UserPublic | null;
  authorYear: CohortYear | null;
  anonymous: boolean;
}

/**
 * The name a post shows: "A Year 1 student" for an anonymous post, unless you may see who wrote it (its author and
 * the moderators), who get the name with "(no name shown)".
 */
export function postAuthorName(post: PostAuthor): string {
  if (!post.anonymous) return authorName(post.author);
  if (post.author) return `${authorName(post.author)} (no name shown)`;
  return post.authorYear ? `A Year ${post.authorYear} student` : 'A student';
}

/** An anonymous post whose author you can't see: a neutral avatar, no badge. */
export const unnamed = (post: PostAuthor): boolean => post.anonymous && !post.author;
