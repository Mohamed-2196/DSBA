import { expect, it } from 'vitest';
import { withPaperPicks } from './subjects';

it('fills the calculator’s choices from your papers, never over its own', () => {
  expect(withPaperPicks({}, ['econometrics', 'asset-pricing', 'microeconomics'])).toEqual({ year2Option: 'econometrics', elective1: 'microeconomics', elective2: 'asset-pricing' });
  expect(withPaperPicks({ year2Option: 'information-systems', elective2: 'marketing-management' }, ['econometrics', 'asset-pricing'])).toEqual({
    year2Option: 'information-systems',
    elective2: 'marketing-management',
  });
  expect(withPaperPicks({}, [])).toEqual({});
});
