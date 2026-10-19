import { describe, expect, it } from 'vitest';
import type { NotificationOut } from '../../api/types';
import { repliesToYou, unreadReplies } from './replies';

let seq = 0;
function note(patch: Partial<NotificationOut> = {}): NotificationOut {
  seq += 1;
  return {
    id: `00000000-0000-4000-8000-${String(seq).padStart(12, '0')}`,
    kind: 'thread_reply',
    title: 'Ali replied to your question',
    body: 'Why does the MGF identify the distribution?',
    url: '/forum/mgf',
    actor: null,
    createdAt: `2026-10-${String(10 + seq).padStart(2, '0')}T09:00:00Z`,
    readAt: null,
    ...patch,
  };
}

describe('repliesToYou', () => {
  it('keeps answers to the student that lead somewhere, newest first', () => {
    const a = note();
    const b = note({ kind: 'answer_accepted' });
    const other = note({ kind: 'new_issue' });
    const nowhere = note({ url: null });
    expect(repliesToYou([a, b, other, nowhere]).map((n) => n.id)).toEqual([b.id, a.id]);
  });

  it('stops at n', () => {
    expect(repliesToYou([note(), note(), note(), note()], 2)).toHaveLength(2);
  });

  it('counts the unread ones', () => {
    expect(unreadReplies([note(), note({ readAt: '2026-10-19T10:00:00Z' }), note({ kind: 'system' })])).toBe(1);
  });
});
