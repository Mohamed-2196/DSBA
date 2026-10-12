// What deleting a post does, in words for its confirmation dialog (student test ST-12, security review SEC-15).
import type { Reply, ThreadDetail } from '../../../api/types';

/**
 * A visible thread without replies leaves the forum. With replies, its title and its replies stay, so they can still be
 * read (ST-12). A hidden thread stays hidden without its text, and comes back deleted if it is unhidden (SEC-15).
 */
export function threadDeleteCopy(thread: Pick<ThreadDetail, 'status' | 'replyCount'>): string {
  if (thread.status === 'hidden') {
    return 'Its text is deleted for good. The thread stays hidden; if you unhide it later, it comes back as a deleted thread.';
  }
  const n = thread.replyCount;
  if (n > 0) {
    const theirs = n === 1 ? 'its reply' : `its ${n} replies`;
    return `Its text is deleted, but its title and ${theirs} stay in the forum, so ${n === 1 ? 'the reply' : 'the replies'} can still be read. This can’t be undone.`;
  }
  return 'It is removed from the forum and its text is deleted. This can’t be undone.';
}

/** A reply keeps its place for the replies under it; a hidden one stays hidden (SEC-15). */
export function replyDeleteCopy(reply: Pick<Reply, 'status'>, hasReplies: boolean): string {
  if (reply.status === 'hidden') {
    return 'Its text is deleted for good. The reply stays hidden; if you unhide it later, it comes back as a deleted reply.';
  }
  return `Its text is deleted for everyone.${hasReplies ? ' The replies to it stay, under a “Deleted reply” note.' : ''} This can’t be undone.`;
}
