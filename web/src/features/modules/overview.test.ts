import { describe, expect, it } from 'vitest';
import { sharedBy, showsProgress } from './overview';

describe('sharedBy', () => {
  it('prefers the named author, then the uploader', () => {
    const user = { id: 'u', displayName: 'Test Student', year: 2 as const, badge: null };
    expect(sharedBy({ authorName: 'A. Writer', uploadedBy: user })).toBe('A. Writer');
    expect(sharedBy({ authorName: '  ', uploadedBy: user })).toBe('Test Student');
    expect(sharedBy({ authorName: null, uploadedBy: null })).toBeNull();
  });
});

describe('showsProgress', () => {
  it('needs tracking and a lesson begun', () => {
    expect(showsProgress(false, { c: 0, v: 1, at: 1, kind: 'resume' })).toBe(false);
    expect(showsProgress(true, { c: 0, v: 0, at: null, kind: 'start' })).toBe(false);
    expect(showsProgress(true, null)).toBe(false);
    expect(showsProgress(true, { c: 1, v: 0, at: 1, kind: 'next' })).toBe(true);
  });
});
