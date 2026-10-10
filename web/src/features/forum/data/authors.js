// Forum authors. Everyone is a dummy student (spec: common Bahraini first names + initial):
// the shared DUMMY_STUDENTS plus a few forum regulars, Nasser (an inside joke, see below), the student-run
// "DSBA Hub" account that owns the pinned guidelines, and the signed-in prototype user (CURRENT_USER, id 'me').
// Never attribute forum content to real tutors or staff.
//
// An author may carry a `flair`: a short label shown as a small neutral pill next to the name, in the place a
// year badge would go (thread row, thread page, reply). A flair replaces the year there.
import { CURRENT_USER, DUMMY_STUDENTS } from '../../../data/people';

const FORUM_REGULARS = [
  { id: 'abdulla-r', name: 'Abdulla R.', year: 3 },
  { id: 'layla-f', name: 'Layla F.', year: 1 },
  { id: 'ebrahim-d', name: 'Ebrahim D.', year: 2 },
  { id: 'sara-m', name: 'Sara M.', year: 3 },
  { id: 'jassim-k', name: 'Jassim K.', year: 1 },
  { id: 'reem-a', name: 'Reem A.', year: 2 },
  { id: 'khalid-n', name: 'Khalid N.', year: 1 },
];

/** The student team account that posts the guidelines. Rendered with the logo mark as its avatar. */
export const TEAM_AUTHOR = { id: 'hub', name: 'DSBA Hub', year: null, kind: 'team' };
/** Only used by the hidden reveal reply (see ThreadPage, ?reveal=1 on the easter-egg thread). */
export const EVERYONE_AUTHOR = { id: 'everyone', name: 'Every DSBA student', year: null, kind: 'everyone' };
/**
 * Nasser: a named student with no year and a joke flair (an inside joke). He is only used where a seed thread names
 * him, so he is deliberately NOT in FORUM_STUDENTS: classmates' simulated replies never pick him.
 */
export const NASSER_AUTHOR = { id: 'nasser', name: 'Nasser', year: null, flair: 'Not Student Council President', kind: 'student' };

export const ME_ID = CURRENT_USER.id;

/** Students who can appear as authors (used to pick classmates for simulated replies). */
export const FORUM_STUDENTS = [...DUMMY_STUDENTS, ...FORUM_REGULARS].map((s) => ({ ...s, kind: 'student' }));

const BY_ID = new Map([...FORUM_STUDENTS, NASSER_AUTHOR, TEAM_AUTHOR, EVERYONE_AUTHOR].map((p) => [p.id, p]));

/**
 * { id, name, year, flair?, kind: 'student'|'team'|'everyone'|'me'|'unknown' }.
 * The signed-in user never gets a year (we do not know his cohort): his flair is his role, 'Student rep'.
 */
export function getAuthor(id) {
  if (id === ME_ID) return { id, name: CURRENT_USER.name, year: null, flair: CURRENT_USER.role, kind: 'me' };
  return BY_ID.get(id) || { id: id || 'unknown', name: 'Former student', year: null, kind: 'unknown' };
}

/** Display name (the signed-in user reads as his own name, with his 'Student rep' flair next to it). */
export function authorLabel(author) {
  return author?.name || 'Former student';
}
