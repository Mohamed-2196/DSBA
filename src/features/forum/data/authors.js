// Forum authors. Everyone is a dummy student (spec: common Bahraini first names + initial):
// the shared DUMMY_STUDENTS plus a few forum regulars, the student-run "DSBA Pulse" account that
// owns the pinned guidelines, and the signed-in prototype user (CURRENT_USER, id 'me').
// Never attribute forum content to real tutors or staff.
import { CURRENT_USER, DUMMY_STUDENTS } from '../../../data/people.js';

const FORUM_REGULARS = [
  { id: 'abdulla-r', name: 'Abdulla R.', year: 3 },
  { id: 'layla-f', name: 'Layla F.', year: 1 },
  { id: 'ebrahim-d', name: 'Ebrahim D.', year: 2 },
  { id: 'sara-m', name: 'Sara M.', year: 3 },
  { id: 'jassim-k', name: 'Jassim K.', year: 1 },
  { id: 'reem-a', name: 'Reem A.', year: 2 },
  { id: 'khalid-n', name: 'Khalid N.', year: 1 },
];

/** The student team account that posts the guidelines. Rendered with the pulse mark as its avatar. */
export const TEAM_AUTHOR = { id: 'pulse', name: 'DSBA Pulse', year: null, kind: 'team' };
/** Only used by the hidden reveal reply (see ThreadPage, ?reveal=1 on the easter-egg thread). */
export const EVERYONE_AUTHOR = { id: 'everyone', name: 'Every DSBA student', year: null, kind: 'everyone' };

export const ME_ID = CURRENT_USER.id;

/** Students who can appear as authors (used to pick classmates for simulated replies). */
export const FORUM_STUDENTS = [...DUMMY_STUDENTS, ...FORUM_REGULARS].map((s) => ({ ...s, kind: 'student' }));

const BY_ID = new Map([...FORUM_STUDENTS, TEAM_AUTHOR, EVERYONE_AUTHOR].map((p) => [p.id, p]));

/**
 * { id, name, year, kind: 'student'|'team'|'everyone'|'me'|'unknown' }.
 * `year` overrides the cohort for the current user (their year is whatever useYear() said when they posted).
 */
export function getAuthor(id, year = null) {
  if (id === ME_ID) return { id, name: CURRENT_USER.name, year: year ?? null, kind: 'me' };
  return BY_ID.get(id) || { id: id || 'unknown', name: 'Former student', year: null, kind: 'unknown' };
}

/** Display name: the current user reads as "You". */
export function authorLabel(author) {
  return author?.kind === 'me' ? 'You' : author?.name || 'Former student';
}
