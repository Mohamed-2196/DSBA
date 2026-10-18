import { describe, expect, it } from 'vitest';
import type { GradeRules } from '../../api/types';
import { readSeed } from '../../testing/seed';
import { countsSentence, countsSummary, listed } from './rulesText';

const RULES = readSeed<GradeRules>('grades');
const code: Record<string, string> = {
  'advanced-stats-inferential': 'ST2134',
  'advanced-stats-distribution': 'ST2133',
};
const nameOf = (s: { id: string; name: string }) => code[s.id] ?? s.name;

describe('countsSentence', () => {
  it('says what the starting rules count, in one sentence', () => {
    expect(countsSentence(countsSummary(RULES, nameOf))).toBe(
      'Year 1 counts as one average worth 2 classification marks, ST2134 and ST2133 count 1 each, and every other module counts 2: 18 marks in all.',
    );
  });

  it('follows the rules an admin saves', () => {
    const rules: GradeRules = {
      ...RULES,
      averageCounts: 1,
      subjects: RULES.subjects.map((s) => (s.counts === 1 ? { ...s, counts: 2 } : s)),
    };
    expect(countsSentence(countsSummary(rules, nameOf))).toBe(
      'Year 1 counts as one average worth 1 classification mark, and every other module counts 2: 19 marks in all.',
    );
    const plain: GradeRules = { ...RULES, subjects: RULES.subjects.map((s) => ({ ...s, counts: 2 as const })) };
    expect(countsSentence(countsSummary(plain, nameOf))).toBe('Every module counts 2: 26 marks in all.');
  });
});

describe('listed', () => {
  it('joins names the way a sentence does', () => {
    expect(listed(['A'])).toBe('A');
    expect(listed(['A', 'B'])).toBe('A and B');
    expect(listed(['A', 'B', 'C'])).toBe('A, B and C');
  });
});
