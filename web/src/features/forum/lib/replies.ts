// A thread's replies as the page shows them, and what can be said about them. Plain functions (unit-tested).
import type { Reply, ThreadDetail, UserPublic } from '../../../api/types';
import type { ReplyNode, ReplyOrder } from '../types';

/**
 * Replies as [{ ...reply, children }] (one level of nesting), ordered for display: the accepted answer first, then by
 * votes ('top', oldest first among equals) or by time ('oldest'). Nested replies stay in time order. A deleted reply
 * only keeps its place while replies under it still need it; a deleted nested reply goes.
 */
export function nestReplies(replies: readonly Reply[], order: ReplyOrder, acceptedId: string | null): ReplyNode[] {
  const ids = new Set(replies.map((r) => r.id));
  const top: Reply[] = [];
  const byParent = new Map<string, Reply[]>();
  for (const r of replies) {
    if (r.parentId && ids.has(r.parentId)) byParent.set(r.parentId, [...(byParent.get(r.parentId) ?? []), r]);
    else top.push(r);
  }
  const rank = (r: Reply) => (r.accepted || r.id === acceptedId ? 1 : 0);
  const time = (r: Reply) => Date.parse(r.createdAt) || 0;
  if (order === 'top') top.sort((a, b) => rank(b) - rank(a) || b.voteCount - a.voteCount || time(a) - time(b));
  else top.sort((a, b) => rank(b) - rank(a) || time(a) - time(b));
  return top
    .map((r) => ({ ...r, children: (byParent.get(r.id) ?? []).filter((c) => c.status !== 'deleted').sort((a, b) => time(a) - time(b)) }))
    .filter((r) => r.status !== 'deleted' || r.children.length > 0);
}

/** The replies the page shows (nestReplies leaves out deleted ones nobody answered): what a #reply-<id> link can reach. */
export function shownReplyIds(replies: readonly Reply[]): Set<string> {
  const ids = new Set<string>();
  for (const r of nestReplies(replies, 'oldest', null)) {
    ids.add(r.id);
    for (const c of r.children) ids.add(c.id);
  }
  return ids;
}

/** The reply a link points at: '#reply-<id>' gives '<id>'; anything else, null. */
export function replyTargetId(hash: string): string | null {
  const m = /^#reply-([0-9A-Za-z-]{1,64})$/.exec(hash);
  return m ? m[1] : null;
}

export interface Participants {
  /** the people who replied (visible replies), in the order they first replied; the thread's author only when they
   *  replied too (student test ST-11: "1 reply from 2 people") */
  people: UserPublic[];
  /** how many people that is, counting replies from deleted accounts as one more */
  count: number;
  /** the latest visible reply */
  last: Reply | null;
}

export function participants(replies: readonly Reply[]): Participants {
  const visible = replies.filter((r) => r.status === 'visible');
  const seen = new Map<string, UserPublic>();
  let unknown = false;
  for (const r of visible) {
    if (!r.author) unknown = true;
    else if (!seen.has(r.author.id)) seen.set(r.author.id, r.author);
  }
  const people = [...seen.values()];
  const last = visible.reduce<Reply | null>((latest, r) => (!latest || Date.parse(r.createdAt) >= Date.parse(latest.createdAt) ? r : latest), null);
  return { people, count: people.length + (unknown ? 1 : 0), last };
}

/**
 * A hidden post whose text was deleted (while it was hidden, or before): it stays hidden, and unhiding it brings it
 * back as a deleted post (security review SEC-15). Only moderators see such a post, and it is the only hidden post
 * they can't edit, so `canEdit` tells it apart.
 */
export function textDeleted(post: Pick<Reply, 'status' | 'canEdit'>, viewerModerates: boolean): boolean {
  return post.status === 'hidden' && viewerModerates && !post.canEdit;
}

/** The author of a hidden thread can still open it (decision D3), with nothing they can change: read-only for them. */
export function readOnlyFor(thread: Pick<ThreadDetail, 'status' | 'canModerate'>): boolean {
  return thread.status === 'hidden' && !thread.canModerate;
}

/** Whether the thread takes new replies from this viewer: a visible thread, unlocked (reps reply to locked ones). */
export function takesReplies(thread: Pick<ThreadDetail, 'status' | 'locked' | 'canModerate'>): boolean {
  return thread.status === 'visible' && (!thread.locked || thread.canModerate);
}

/**
 * Editing and accepting on a post the API lets you change (canEdit, canAccept): the author while they hold the
 * forum.post box, or anyone who moderates the forum.
 */
export function mayChange(allowed: boolean, moderates: boolean, posts: boolean): boolean {
  return allowed && (moderates || posts);
}

/** Edit and Delete in a post's menu: deleting your own post needs no box, editing it needs forum.post. */
export function postMenuActions(canEdit: boolean, moderates: boolean, posts: boolean): { edit: boolean; remove: boolean } {
  return { edit: mayChange(canEdit, moderates, posts), remove: canEdit };
}
