import { describe, expect, it } from 'vitest';
import { moduleLabel } from './modules';

describe('moduleLabel', () => {
  it('names a module by its code and name, or its name when it has no code', () => {
    const st2133 = { unitCode: 'ST2133', name: 'Advanced statistics' };
    expect(moduleLabel(st2133)).toBe('ST2133 Advanced statistics');
    expect(moduleLabel({ ...st2133, unitCode: null })).toBe('Advanced statistics');
    expect(moduleLabel(null)).toBe('');
  });
});
