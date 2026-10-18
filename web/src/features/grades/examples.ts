// Example records for "Try an example" and ?example=<id> links: marks by subject id, as the starting rules name the
// subjects (a subject an admin adds later starts blank). Invented numbers, no real student.
import type { Picks, Rules } from './classify';
import type { GradesRecord } from './record';

interface Example {
  label: string;
  marks: Record<string, string>;
  picks: Picks;
}

const IDS = [
  'economics',
  'mathematics',
  'business',
  'statistics',
  'advanced-stats-inferential',
  'advanced-stats-distribution',
  'business-analytics',
  'programming-data-science',
  'year-2-option',
  'market-research',
  'machine-learning',
  'elective-1',
  'elective-2',
];
const byId = (marks: string[]): Record<string, string> => Object.fromEntries(IDS.flatMap((id, i) => (marks[i] ? [[id, marks[i]]] : [])));

export const EXAMPLES: Record<string, Example> = {
  first: {
    label: 'A first-class record',
    marks: byId(['74', '68', '71', '77', '71', '65', '72', '78', '69', '70', '74', '66', '71']),
    picks: { year2Option: 'econometrics', elective1: 'microeconomics', elective2: 'asset-pricing' },
  },
  upper: {
    label: 'A 2:1, close to a First',
    marks: byId(['68', '64', '70', '66', '67', '72', '69', '74', '63', '68', '71', '62', '65']),
    picks: { year2Option: 'information-systems', elective1: 'marketing-management', elective2: 'microeconomics' },
  },
  resit: {
    label: 'A record with a resit',
    marks: byId(['62', '55', '58', '64', '58', '35', '61', '66', '57', '63', '60', '59', '54']),
    picks: { year2Option: 'econometrics', elective1: 'asset-pricing', elective2: 'further-maths-economists' },
  },
  partial: {
    label: 'Halfway through Year 2',
    marks: byId(['71', '66', '69', '74', '64', '68', '72', '70']),
    picks: { year2Option: 'econometrics' },
  },
};

/** An example as a record of the rules' subjects. */
export function exampleRecord(id: string, rules: Rules): GradesRecord | null {
  const ex = EXAMPLES[id];
  if (!ex) return null;
  return { marks: rules.subjects.map((s) => ex.marks[s.id] ?? ''), picks: { ...ex.picks } };
}

export const emptyRecord = (rules: Rules): GradesRecord => ({ marks: rules.subjects.map(() => ''), picks: {} });
