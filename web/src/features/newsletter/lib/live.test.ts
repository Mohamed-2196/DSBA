import { describe, expect, it } from 'vitest';
import { liveSectionOn } from './live';

describe('liveSectionOn', () => {
  it('follows the switch of the feature each live section reads', () => {
    const isOn = (f: string) => f !== 'calendar';
    expect(liveSectionOn('deadlines', isOn)).toBe(false);
    expect(liveSectionOn('forum', isOn)).toBe(true);
    expect(liveSectionOn('library', (f) => f !== 'library')).toBe(false);
  });
});
