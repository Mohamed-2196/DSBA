import { describe, expect, it } from 'vitest';
import type { ModuleSummary } from '../../../api/types';
import { fill, starters } from './starters';

describe('fill', () => {
  it('drops the brackets and selects what was in them', () => {
    const { text, select } = fill('Explain [the CLT] simply.');
    expect(text).toBe('Explain the CLT simply.');
    expect(text.slice(...select)).toBe('the CLT');
  });

  it('puts the cursor at the end when there is nothing to fill in', () => {
    expect(fill('Hello')).toEqual({ text: 'Hello', select: [5, 5] });
  });

  it('fills only the first part', () => {
    const { text, select } = fill('Plan [ST2133] over [three weeks].');
    expect(text).toBe('Plan ST2133 over [three weeks].');
    expect(text.slice(...select)).toBe('ST2133');
  });
});

describe('starters', () => {
  const st = { id: 'st2133', year: 2, unitCode: 'ST2133', shortName: 'Stats', name: 'Advanced statistics' } as ModuleSummary;

  it('offers every kind of help, each with something to fill in', () => {
    const list = starters([], null);
    expect(list.map((s) => s.id)).toEqual(['explain', 'solve', 'quiz', 'plan', 'summarise', 'career', 'write']);
    for (const s of list) expect(s.template).toMatch(/\[[^\]]+\]/);
  });

  it('uses a module of the student’s year', () => {
    expect(starters([st], 2).find((s) => s.id === 'plan')?.template).toContain('[ST2133]');
    expect(starters([st], 1).find((s) => s.id === 'plan')?.template).toContain('[my next exam]');
  });
});
