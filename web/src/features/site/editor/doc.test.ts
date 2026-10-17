import { describe, expect, it } from 'vitest';
import { newItemId } from './doc';

describe('newItemId', () => {
  it('is the first free one after the ones there are', () => {
    expect(newItemId('step', [])).toBe('step-1');
    expect(newItemId('step', ['portal', 'register'])).toBe('step-3');
    expect(newItemId('step', ['step-2', 'step-3'])).toBe('step-4');
    expect(newItemId('person', ['a', 'person-2'])).toBe('person-3');
  });
});
