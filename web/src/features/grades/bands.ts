// Names and bands used by the grades UI, with the bands' marks from the rules.
import type { BandId, ClassKind, Rules } from './classify';

/** Display names for headlines (the result itself uses classify.ts RESULT). */
export const CLASS_NAME: Record<ClassKind, string> = {
  first: 'First Class Honours',
  upper: 'Upper Second Class Honours',
  lower: 'Lower Second Class Honours',
  third: 'Third Class Honours',
  none: 'Not classified',
  resit: 'Resit required',
};
export const CLASS_SHORT: Record<ClassKind, string> = {
  first: 'First',
  upper: '2:1',
  lower: '2:2',
  third: 'Third',
  none: 'None',
  resit: 'Resit',
};

export interface Band {
  id: BandId;
  label: string;
  /** '70 and above', '60 to 69' */
  range: string;
  /** '70–100' */
  span: string;
  short: string;
  gpa: string;
}

/** The bands, best first, with their marks. */
export function bandsOf(rules: Rules): Band[] {
  const { first, upper, lower, third } = rules.bands;
  const between = (from: number, below: number) => ({ range: `${from} to ${below - 1}`, span: `${from}–${below - 1}` });
  return [
    {
      id: 'first',
      label: 'First class',
      range: `${first.floor} and above`,
      span: `${first.floor}–100`,
      short: 'First',
      gpa: first.gpa,
    },
    { id: 'upper', label: 'Upper second', ...between(upper.floor, first.floor), short: '2:1', gpa: upper.gpa },
    { id: 'lower', label: 'Lower second', ...between(lower.floor, upper.floor), short: '2:2', gpa: lower.gpa },
    { id: 'third', label: 'Third', ...between(third.floor, lower.floor), short: 'Third', gpa: third.gpa },
    { id: 'fail', label: 'Fail', range: `under ${third.floor}`, span: `0–${third.floor - 1}`, short: 'Fail', gpa: '–' },
  ];
}

export const bandMeta = (id: BandId, rules: Rules): Band =>
  bandsOf(rules).find((b) => b.id === id) ?? (bandsOf(rules)[4] as Band);
