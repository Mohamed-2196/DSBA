// Example records for "Try an example" and ?example=<id> links (marks in v1 subject order:
// EC1002, MT1186, MN1178, ST1215, ST2134, ST2133, ST2187, ST2195, Year 2 option, Market research,
// Machine learning, Elective 1, Elective 2). Invented numbers, no real student.
import type { Picks } from './classify';

export interface GradesRecord {
  marks: string[];
  picks: Picks;
}

export const EXAMPLES: Record<string, GradesRecord & { label: string }> = {
  first: {
    label: 'A first-class record',
    marks: ['74', '68', '71', '77', '71', '65', '72', '78', '69', '70', '74', '66', '71'],
    picks: { year2Option: 'econometrics', elective1: 'microeconomics', elective2: 'asset-pricing' },
  },
  upper: {
    label: 'A 2:1, close to a First',
    marks: ['68', '64', '70', '66', '67', '72', '69', '74', '63', '68', '71', '62', '65'],
    picks: { year2Option: 'information-systems', elective1: 'marketing-management', elective2: 'microeconomics' },
  },
  resit: {
    label: 'A record with a resit',
    marks: ['62', '55', '58', '64', '58', '35', '61', '66', '57', '63', '60', '59', '54'],
    picks: { year2Option: 'econometrics', elective1: 'asset-pricing', elective2: 'further-maths-economists' },
  },
  partial: {
    label: 'Halfway through Year 2',
    marks: ['71', '66', '69', '74', '64', '68', '72', '70', '', '', '', '', ''],
    picks: { year2Option: 'econometrics' },
  },
};

export const EMPTY_RECORD: GradesRecord = { marks: Array<string>(13).fill(''), picks: {} };
