import { describe, expect, it } from 'vitest';
import { idFromLabel, withSavedIds } from './ids';

describe('idFromLabel', () => {
  it('makes a link-safe id from a label', () => {
    expect(idFromLabel('Study groups', [])).toBe('study-groups');
    expect(idFromLabel('  Exam rules & calculators! ', [])).toBe('exam-rules-calculators');
    expect(idFromLabel('Café R', [])).toBe('cafe-r');
    expect(idFromLabel('مرحبا', [], 'tag')).toBe('tag');
  });

  it('keeps to 32 characters and never takes an id in use', () => {
    expect(idFromLabel('a'.repeat(40), [])).toHaveLength(32);
    expect(idFromLabel('General', ['general'])).toBe('general-2');
    expect(idFromLabel('General', ['general', 'general-2'])).toBe('general-3');
    expect(idFromLabel('b'.repeat(40), ['b'.repeat(32)])).toBe(`${'b'.repeat(30)}-2`);
  });
});

describe('withSavedIds', () => {
  it('gives new items an id from their label and leaves saved ones alone', () => {
    const items = [
      { id: 'year-1', label: 'Year 1' },
      { id: 'category-6', label: 'Year 1' },
      { id: 'category-7', label: 'Careers' },
    ];
    expect(withSavedIds(items, new Set(['year-1']), (i) => i.label, 'category').map((i) => i.id)).toEqual([
      'year-1',
      'year-1-2',
      'careers',
    ]);
  });

  it('never gives a reserved id', () => {
    expect(
      withSavedIds([{ id: 'category-2', label: 'All' }], new Set(), (i) => i.label, 'category', ['all']).map(
        (i) => i.id,
      ),
    ).toEqual(['all-2']);
  });
});
