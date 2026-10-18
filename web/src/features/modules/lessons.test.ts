import { describe, expect, it } from 'vitest';
import { MODULE_TABS, moduleTabOn } from './lessons';

describe('moduleTabOn', () => {
  it('shows every tab while every feature is on', () => {
    expect(MODULE_TABS.filter((t) => moduleTabOn(t, () => true))).toEqual([
      'overview',
      'lessons',
      'files',
      'discussion',
    ]);
  });

  it('leaves out Files while the library is off and Discussion while the forum is off', () => {
    expect(MODULE_TABS.filter((t) => moduleTabOn(t, (f) => f !== 'library'))).toEqual([
      'overview',
      'lessons',
      'discussion',
    ]);
    expect(MODULE_TABS.filter((t) => moduleTabOn(t, (f) => f !== 'forum'))).toEqual(['overview', 'lessons', 'files']);
  });
});
