import { describe, expect, it } from 'vitest';
import type { ModuleSummary, NooraDoc } from '../../../api/types';
import { readSeed } from '../../../testing/seed';
import { fill, starters } from './starters';

const CARDS = readSeed<NooraDoc>('noora').script.starters;

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

  it('starts with every kind of help, each with something to fill in', () => {
    const list = starters(CARDS, [], null);
    expect(list.map((s) => s.id)).toEqual(['explain', 'solve', 'quiz', 'plan', 'summarise', 'career', 'write', 'find']);
    for (const s of list) expect(s.template).toMatch(/\[[^\]]+\]/);
  });

  it('starts with whole rows of four or of two', () => {
    expect(CARDS.length % 4).toBe(0);
  });

  it('uses a module of the student’s year for {module}', () => {
    expect(starters(CARDS, [st], 2).find((s) => s.id === 'plan')?.template).toContain('[ST2133]');
    expect(starters(CARDS, [st], 2).find((s) => s.id === 'plan')?.example).toBe('A plan for ST2133 around my exams');
    expect(starters(CARDS, [st], 1).find((s) => s.id === 'plan')?.template).toContain('[my next exam]');
    expect(starters(CARDS, [st], 2).find((s) => s.id === 'find')?.template).toBe('Where are [the past papers for ST2133]?');
  });
});
