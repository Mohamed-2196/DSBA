import { describe, expect, it } from 'vitest';
import type { Reply, UserPublic } from '../../../api/types';
import { nestReplies, participants, readOnlyFor, takesReplies, textDeleted } from './replies';

const person = (id: string, displayName = id): UserPublic => ({ id, displayName, year: 2, role: 'student' });
let n = 0;
function reply(over: Partial<Reply> = {}): Reply {
  n += 1;
  return {
    id: `r${n}`,
    threadId: 't1',
    parentId: null,
    author: person('ali'),
    authorYear: 2,
    body: 'text',
    createdAt: new Date(Date.UTC(2026, 9, 1, 10, n)).toISOString(),
    editedAt: null,
    voteCount: 0,
    voted: false,
    status: 'visible',
    accepted: false,
    isMine: false,
    canEdit: false,
    ...over,
  };
}

describe('nestReplies', () => {
  it('puts the accepted answer first, then the most voted, and nests one level', () => {
    const a = reply({ voteCount: 1 });
    const b = reply({ voteCount: 5 });
    const c = reply({ voteCount: 0, accepted: true });
    const a1 = reply({ parentId: a.id });
    const nested = nestReplies([a, b, c, a1], 'top', c.id);
    expect(nested.map((r) => r.id)).toEqual([c.id, b.id, a.id]);
    expect(nested[2].children.map((r) => r.id)).toEqual([a1.id]);
    expect(nestReplies([a, b, c], 'oldest', null).map((r) => r.id)).toEqual([c.id, a.id, b.id]);
  });

  it('keeps a deleted reply only while replies under it need it', () => {
    const gone = reply({ status: 'deleted', body: '' });
    const lonely = reply({ status: 'deleted', body: '' });
    const child = reply({ parentId: gone.id });
    const goneChild = reply({ parentId: gone.id, status: 'deleted', body: '' });
    const nested = nestReplies([gone, lonely, child, goneChild], 'oldest', null);
    expect(nested.map((r) => r.id)).toEqual([gone.id]);
    expect(nested[0].children.map((r) => r.id)).toEqual([child.id]);
  });
});

describe('participants (ST-11)', () => {
  it('counts the people who replied, not the thread author who did not', () => {
    const p = participants([reply({ author: person('fatima', 'Fatima Ahmed') })]);
    expect(p.count).toBe(1);
    expect(p.people.map((u) => u.displayName)).toEqual(['Fatima Ahmed']);
  });

  it('counts each person once, deleted accounts as one more, and only visible replies', () => {
    const replies = [reply({ author: person('sara') }), reply({ author: person('ali') }), reply({ author: null }), reply({ status: 'hidden', author: person('omar') })];
    const last = reply({ author: person('sara') });
    const p = participants([...replies, last]);
    expect(p.people.map((u) => u.id)).toEqual(['sara', 'ali']);
    expect(p.count).toBe(3);
    expect(p.last?.id).toBe(last.id);
    expect(participants([]).last).toBeNull();
  });
});

describe('hidden posts', () => {
  it('knows a hidden post whose text was deleted (SEC-15): reps see it and cannot edit it', () => {
    expect(textDeleted({ status: 'hidden', canEdit: false }, true)).toBe(true);
    expect(textDeleted({ status: 'hidden', canEdit: true }, true)).toBe(false);
    expect(textDeleted({ status: 'hidden', canEdit: false }, false)).toBe(false);
    expect(textDeleted({ status: 'visible', canEdit: false }, true)).toBe(false);
  });

  it('is read-only for the author of a hidden thread (D3), not for the reps', () => {
    expect(readOnlyFor({ status: 'hidden', canModerate: false })).toBe(true);
    expect(readOnlyFor({ status: 'hidden', canModerate: true })).toBe(false);
    expect(readOnlyFor({ status: 'visible', canModerate: false })).toBe(false);
  });

  it('takes replies while visible and unlocked; reps reply to locked threads', () => {
    expect(takesReplies({ status: 'visible', locked: false, canModerate: false })).toBe(true);
    expect(takesReplies({ status: 'visible', locked: true, canModerate: false })).toBe(false);
    expect(takesReplies({ status: 'visible', locked: true, canModerate: true })).toBe(true);
    expect(takesReplies({ status: 'hidden', locked: false, canModerate: true })).toBe(false);
    expect(takesReplies({ status: 'deleted', locked: false, canModerate: true })).toBe(false);
  });
});
