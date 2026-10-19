import { describe, expect, it } from 'vitest';
import { scrollAction } from './scrollMemory';

describe('scrollAction', () => {
  it('goes back to where the page was left on Back and Forward', () => {
    expect(scrollAction('POP', { samePath: false, saved: 4500 })).toEqual({ to: 'saved', y: 4500 });
  });
  it('starts a new page at the top', () => {
    expect(scrollAction('PUSH', { samePath: false, saved: 4500 })).toEqual({ to: 'top' });
    expect(scrollAction('POP', { samePath: false, saved: undefined })).toEqual({ to: 'top' });
  });
  it('stays put when only the query changes', () => {
    expect(scrollAction('PUSH', { samePath: true, saved: undefined })).toEqual({ to: 'stay' });
    expect(scrollAction('REPLACE', { samePath: true, saved: 10 })).toEqual({ to: 'stay' });
  });
});
