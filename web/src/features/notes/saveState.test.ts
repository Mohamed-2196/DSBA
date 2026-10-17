import { describe, expect, it } from 'vitest';
import { combinedState } from './saveState';

describe('the note’s save state', () => {
  it('shows what needs the student most, text or handwriting', () => {
    expect(combinedState('saved', 'saved')).toBe('saved');
    expect(combinedState('saved', 'saving')).toBe('saving');
    expect(combinedState('unsaved', 'saving')).toBe('saving');
    expect(combinedState('saved', 'offline')).toBe('offline');
    expect(combinedState('offline', 'error')).toBe('error');
    expect(combinedState('error', 'conflict')).toBe('conflict');
  });
});
