// Names and bands used by the grades UI.
import type { BandId, ClassKind } from './classify';

/** Display names (v1's labels are kept for the verified result; these are for headlines). */
export const CLASS_NAME: Record<ClassKind, string> = {
  first: 'First Class Honours',
  upper: 'Upper Second Class Honours',
  lower: 'Lower Second Class Honours',
  third: 'Third Class Honours',
  none: 'Not classified',
  resit: 'Resit required',
};
export const CLASS_SHORT: Record<ClassKind, string> = { first: 'First', upper: '2:1', lower: '2:2', third: 'Third', none: 'None', resit: 'Resit' };

export interface Band {
  id: BandId;
  label: string;
  range: string;
  short: string;
}

export const BANDS: Band[] = [
  { id: 'first', label: 'First class', range: '70 and above', short: 'First' },
  { id: 'upper', label: 'Upper second', range: '60 to 69', short: '2:1' },
  { id: 'lower', label: 'Lower second', range: '50 to 59', short: '2:2' },
  { id: 'third', label: 'Third', range: '40 to 49', short: 'Third' },
  { id: 'fail', label: 'Fail', range: 'under 40', short: 'Fail' },
];

export const bandMeta = (id: BandId): Band => BANDS.find((b) => b.id === id) ?? (BANDS[4] as Band);
