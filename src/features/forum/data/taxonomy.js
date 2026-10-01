// Forum categories ("where a thread lives") and tags. Every thread lives in exactly one category,
// so category counts add up to the total. The URL uses the category id (?cohort=year-2).
import { getModulesForYear } from '../../../data/modules.js';

const codesFor = (year) => getModulesForYear(year).map((m) => m.unitCode || m.shortName);

export const CATEGORIES = [
  { id: 'year-1', label: 'Year 1', short: 'Year 1', year: 1, modules: codesFor(1), blurb: 'Maths, statistics, economics and business' },
  { id: 'year-2', label: 'Year 2', short: 'Year 2', year: 2, modules: codesFor(2), blurb: 'Distribution theory, inference, programming and more' },
  { id: 'year-3', label: 'Year 3', short: 'Year 3', year: 3, modules: codesFor(3), blurb: 'Machine learning, asset pricing and more' },
  { id: 'study-groups', label: 'Study groups', short: 'Study group', year: null, modules: [], blurb: 'Find people to revise with' },
  { id: 'general', label: 'General', short: 'General', year: null, modules: [], blurb: 'Exams, campus and everything else' },
];

const CAT_BY_ID = new Map(CATEGORIES.map((c) => [c.id, c]));

export function getCategory(id) {
  return CAT_BY_ID.get(id) || null;
}

/** 'year-2' for 2, null otherwise. */
export function categoryForYear(year) {
  const y = Number(year);
  return y === 1 || y === 2 || y === 3 ? `year-${y}` : null;
}

export const TAGS = [
  { id: 'exam-prep', label: 'Exam prep' },
  { id: 'past-papers', label: 'Past papers' },
  { id: 'coursework', label: 'Coursework' },
  { id: 'formula-sheet', label: 'Formula sheets' },
  { id: 'r', label: 'R' },
  { id: 'python', label: 'Python' },
  { id: 'excel', label: 'Excel' },
  { id: 'exams', label: 'Exam rules' },
  { id: 'calculators', label: 'Calculators' },
  { id: 'module-choice', label: 'Module choice' },
  { id: 'campus', label: 'Campus' },
  { id: 'lost-and-found', label: 'Lost and found' },
];

const TAG_BY_ID = new Map(TAGS.map((t) => [t.id, t]));

export function getTag(id) {
  return TAG_BY_ID.get(id) || null;
}

export const MAX_TAGS = 3;
