// Home's "Replies to you": the forum notifications that are someone answering the student, newest first. Pure, so
// it is tested (replies.test.ts); the notifications come from the bell's own query, so Home asks for nothing more.
import type { NotificationOut } from '../../api/types';

const REPLY_KINDS: ReadonlySet<NotificationOut['kind']> = new Set<NotificationOut['kind']>([
  'thread_reply',
  'reply_reply',
  'answer_accepted',
  'followed_reply',
  'followed_answer',
]);

/** The replies among `items` that lead somewhere, newest first, at most `n`. */
export function repliesToYou(items: readonly NotificationOut[], n = 3): NotificationOut[] {
  return items
    .filter((i) => REPLY_KINDS.has(i.kind) && !!i.url)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, n);
}

/** How many of them are still unread. */
export function unreadReplies(items: readonly NotificationOut[]): number {
  return items.filter((i) => REPLY_KINDS.has(i.kind) && !i.readAt).length;
}
