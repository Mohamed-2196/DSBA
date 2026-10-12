// The three roles, in words an admin reads before changing one.
import type { Role } from './api';

export const ROLES: Role[] = ['student', 'moderator', 'admin'];

export const ROLE_POWERS: Record<Role, string> = {
  student: 'Posts, votes and uploads like every student. No moderation.',
  moderator: 'Moderates the forum and the library, and edits the calendar and the newsletter.',
  admin: 'Everything a student rep does, and manages people and roles.',
};

/** "a student rep", "an admin", "a student". */
export function roleWithArticle(role: Role): string {
  return role === 'admin' ? 'an admin' : role === 'moderator' ? 'a student rep' : 'a student';
}
