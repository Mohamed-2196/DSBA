// DSBA Hub — people. v1 footer contributors (src/legacy/components/Footer/Footer.jsx),
// every named note contributor (from MODULES[].notes[].author), and the seeded dummy
// students that feature agents use for forum posts, library uploads, etc.
// Public-repo rule: never invent quotes or content attributed to real tutors/staff.
import { MODULES } from './modules.js';

export const REPO_URL = 'https://github.com/Mohamed-2196/DSBA';
export const CONTRIBUTE_URL = `${REPO_URL}/issues/new`;
export const MYCLASS_URL = 'https://myclass.bibf.com';
export const UOL_PORTAL_URL = 'https://my.london.ac.uk/group/student';
export const LAUNCH_YEAR = 2024;
export const COPYRIGHT_HOLDER = 'Mohamed Alnooh';
export const DISCLAIMER =
  'A student-run project. Not affiliated with or endorsed by the University of London. All linked materials belong to their respective owners.';

/** v1 footer contributors, in v1 order. `v1Role` is the exact v1 string. */
export const CONTRIBUTORS = [
  {
    id: 'mohamed-alnooh',
    name: 'Mohamed Alnooh',
    role: 'Creator and maintainer',
    v1Role: 'Creator & maintainer',
    affiliation: null,
    url: 'https://github.com/Mohamed-2196',
  },
  {
    id: 'feras-alsadadi',
    name: 'Feras Alsadadi',
    role: 'Historical past exams',
    v1Role: 'Historical past exams',
    affiliation: null,
    url: null,
  },
  {
    id: 'yaser-alghsara',
    name: 'Yaser Alghsara',
    role: 'Lecture recordings',
    v1Role: 'BIBF faculty — lecture recordings',
    affiliation: 'BIBF faculty',
    url: null,
  },
  {
    id: 'sayed-hasan-kadhem',
    name: 'Dr. Sayed Hasan Kadhem',
    role: 'Lecture recordings',
    v1Role: 'BIBF faculty — lecture recordings',
    affiliation: 'BIBF faculty',
    url: null,
  },
];

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');

/**
 * Students who shared notes in v1, derived from the module data so it can never drift.
 * [{ id, name, notes: [{ moduleId, name, url }] }] — order of first appearance.
 */
export const NOTE_CONTRIBUTORS = (() => {
  const map = new Map();
  for (const m of MODULES) {
    for (const n of m.notes) {
      if (!n.author) continue;
      if (!map.has(n.author)) map.set(n.author, { id: slug(n.author), name: n.author, notes: [] });
      map.get(n.author).notes.push({ moduleId: m.id, name: n.name, url: n.url });
    }
  }
  return [...map.values()];
})();

/**
 * Seeded dummy students (spec: common Bahraini first names + initial). Use these for
 * forum authors, library uploaders, newsletter bylines etc. so names stay consistent.
 * `year` is the cohort they are in. The signed-in prototype user is CURRENT_USER (not in this list).
 * Any person object may also carry a `flair` string (a small label shown next to the name where a year
 * would go): the forum renders it as a neutral pill (see features/forum/data/authors.js).
 */
export const DUMMY_STUDENTS = [
  { id: 'ali-h', name: 'Ali H.', year: 2 },
  { id: 'fatima-a', name: 'Fatima A.', year: 1 },
  { id: 'hussain-m', name: 'Hussain M.', year: 3 },
  { id: 'zainab-k', name: 'Zainab K.', year: 2 },
  { id: 'ahmed-j', name: 'Ahmed J.', year: 1 },
  { id: 'noor-e', name: 'Noor E.', year: 2 },
  { id: 'sayed-ali-m', name: 'Sayed Ali M.', year: 3 },
  { id: 'hawra-t', name: 'Hawra T.', year: 1 },
  { id: 'yusuf-b', name: 'Yusuf B.', year: 2 },
];

/**
 * The signed-in prototype user: the student representative. We do not know which cohort he is in, so the UI never
 * prints a year next to him (the year switcher only chooses which cohort's content you browse): wherever a year
 * would go it shows `role` instead. In the forum he is also the author of his own posts (id 'me').
 */
export const CURRENT_USER = { id: 'me', name: 'Mohamed Alnooh', role: 'Student rep' };

export function getStudent(id) {
  if (id === CURRENT_USER.id) return CURRENT_USER;
  return DUMMY_STUDENTS.find((s) => s.id === id) || null;
}
