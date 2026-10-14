import { describe, expect, it } from 'vitest';
import { postAuthorName, unnamed } from './authors';

const sara = { id: 'u1', displayName: 'Sara M.', year: 2 as const, badge: null };

describe('postAuthorName', () => {
  it('names the author of a named post', () => {
    expect(postAuthorName({ author: sara, authorYear: 2, anonymous: false })).toBe('Sara M.');
  });
  it('shows an anonymous post by its cohort', () => {
    const post = { author: null, authorYear: 1 as const, anonymous: true };
    expect(postAuthorName(post)).toBe('A Year 1 student');
    expect(unnamed(post)).toBe(true);
    expect(postAuthorName({ ...post, authorYear: null })).toBe('A student');
  });
  it('tells its author and the moderators that no name is shown', () => {
    expect(postAuthorName({ author: sara, authorYear: 2, anonymous: true })).toBe('Sara M. (no name shown)');
  });
});
