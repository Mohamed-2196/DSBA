import { describe, expect, it } from 'vitest';
import { replyDeleteCopy, threadDeleteCopy } from './deleting';

describe('threadDeleteCopy', () => {
  it('says a thread with replies keeps its title and its replies (ST-12)', () => {
    expect(threadDeleteCopy({ status: 'visible', replyCount: 3 })).toBe(
      'Its text is deleted, but its title and its 3 replies stay in the forum, so the replies can still be read. This can’t be undone.',
    );
    expect(threadDeleteCopy({ status: 'visible', replyCount: 1 })).toContain(
      'its title and its reply stay in the forum, so the reply can still be read',
    );
  });

  it('says a thread without replies leaves the forum', () => {
    expect(threadDeleteCopy({ status: 'visible', replyCount: 0 })).toBe(
      'It is removed from the forum and its text is deleted. This can’t be undone.',
    );
  });

  it('says a hidden thread stays hidden, and comes back deleted if it is unhidden (SEC-15)', () => {
    const copy = threadDeleteCopy({ status: 'hidden', replyCount: 4 });
    expect(copy).toContain('stays hidden');
    expect(copy).toContain('comes back as a deleted thread');
    expect(copy).not.toContain('stay in the forum');
  });
});

describe('replyDeleteCopy', () => {
  it('says the replies under it keep their place', () => {
    expect(replyDeleteCopy({ status: 'visible' }, true)).toBe(
      'Its text is deleted for everyone. The replies to it stay, under a “Deleted reply” note. This can’t be undone.',
    );
    expect(replyDeleteCopy({ status: 'visible' }, false)).toBe(
      'Its text is deleted for everyone. This can’t be undone.',
    );
  });

  it('says a hidden reply stays hidden (SEC-15)', () => {
    expect(replyDeleteCopy({ status: 'hidden' }, true)).toContain('comes back as a deleted reply');
  });
});
