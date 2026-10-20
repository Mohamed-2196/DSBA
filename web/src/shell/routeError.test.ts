import { describe, expect, it } from 'vitest';
import { codeMissing } from './routeError';

describe('a page whose code could not be fetched (ST-70)', () => {
  it('is told apart from a bug, in every browser’s words', () => {
    for (const message of [
      'Failed to fetch dynamically imported module: http://127.0.0.1:5173/src/features/forum/ThreadPage.tsx',
      'Importing a module script failed.',
      'error loading dynamically imported module',
      'Loading chunk 12 failed.',
      'Unable to preload CSS for /assets/ThreadPage.css',
    ])
      expect(codeMissing(new TypeError(message))).toBe(true);
  });

  it('is not any other crash', () => {
    expect(codeMissing(new TypeError('Cannot read properties of undefined'))).toBe(false);
    expect(codeMissing('Failed to fetch dynamically imported module')).toBe(false);
  });
});
