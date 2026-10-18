import { expect, it } from 'vitest';
import type { GradeRules } from '../../api/types';
import { readSeed } from '../../testing/seed';
import { withPaperPicks } from './subjects';

const RULES = readSeed<GradeRules>('grades');

it('fills the calculator’s choices from your papers, never over its own', () => {
  expect(withPaperPicks({}, ['econometrics', 'asset-pricing', 'microeconomics'], RULES)).toEqual({ year2Option: 'econometrics', elective1: 'microeconomics', elective2: 'asset-pricing' });
  expect(withPaperPicks({ year2Option: 'information-systems', elective2: 'marketing-management' }, ['econometrics', 'asset-pricing'], RULES)).toEqual({
    year2Option: 'information-systems',
    elective2: 'marketing-management',
  });
  expect(withPaperPicks({}, [], RULES)).toEqual({});
});
