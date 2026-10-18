import { describe, expect, it } from 'vitest';
import { tourParts } from './tourParts';

describe('tourParts', () => {
  it('shows text between backticks as keys, and {mod} as the platform’s key', () => {
    expect(tourParts('Press `{mod}``K` or `/` from any page.', '⌘')).toEqual([
      { text: 'Press ', key: false },
      { text: '⌘', key: true },
      { text: 'K', key: true },
      { text: ' or ', key: false },
      { text: '/', key: true },
      { text: ' from any page.', key: false },
    ]);
    expect(tourParts('Hold {mod} and click.', 'Ctrl')).toEqual([{ text: 'Hold Ctrl and click.', key: false }]);
  });
});
