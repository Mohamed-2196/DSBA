"""Who sees which thread and reply, and the lookups that answer 404 for what a person may not see.

- Visible threads and replies are public.
- Hidden ones (a student rep's call, kept for the record) exist for moderators. Their author can still read them
  (decision D3: the thread page shows them a banner); everyone else gets a 404. Reading is all the author can do:
  every write goes through thread_for/reply_for, which leave the author out.
- Deleted ones (by their author, or a rep) lose their text but keep their place: a deleted thread stays listed with
  its title while it has visible replies, and a deleted reply keeps its spot with body ''.
- A hidden post that is deleted stays hidden, with its text gone, and unhiding it gives a deleted post (SEC-15):
  `deleted_at` on the row says its text was deleted."""

from __future__ import annotations

import uuid

from sqlalchemy import ColumnElement, and_, or_, select
from sqlalchemy.orm import Session, defer

from app.core.errors import ApiError, conflict, not_found
from app.core.security import is_moderator
from app.models import ForumReply, ForumThread, PostStatus, User

# search_vector is for the database's search only: never load it into Python.
THREAD_OPTS = (defer(ForumThread.search_vector),)
REPLY_OPTS = (defer(ForumReply.search_vector),)


def gone(post: ForumThread | ForumReply) -> bool:
    """A hidden post whose text was deleted (while it was hidden, or before): unhiding it gives a deleted post
    (security review SEC-15). The row records the deletion itself, not the audit log (code quality review CQ-14)."""
    return post.status == PostStatus.hidden and post.deleted_at is not None


def can_see_thread(t: ForumThread, viewer: User | None) -> bool:
    """May see and act on the thread (vote, reply, edit, report...): the rule for everything but reading it."""
    if t.status == PostStatus.visible or is_moderator(viewer):
        return True
    return t.status == PostStatus.deleted and t.reply_count > 0


def can_read_thread(t: ForumThread, viewer: User | None) -> bool:
    """May open the thread: everyone who can see it, and the author of a hidden one (D3) unless its text was deleted."""
    if can_see_thread(t, viewer):
        return True
    return t.status == PostStatus.hidden and not gone(t) and viewer is not None and t.author_id == viewer.id


def can_see_reply(r: ForumReply, viewer: User | None) -> bool:
    return r.status != PostStatus.hidden or is_moderator(viewer)


def can_read_reply(r: ForumReply, viewer: User | None) -> bool:
    """May read the reply in its thread: everyone who can see it, and its author when a rep hid it (not deleted)."""
    if can_see_reply(r, viewer):
        return True
    return not gone(r) and viewer is not None and r.author_id == viewer.id


def listed(viewer: User | None) -> ColumnElement[bool]:
    """Threads a list shows: visible ones, deleted ones that still have replies, and hidden ones for moderators."""
    conds = [
        ForumThread.status == PostStatus.visible,
        and_(ForumThread.status == PostStatus.deleted, ForumThread.reply_count > 0),
    ]
    if is_moderator(viewer):
        conds.append(ForumThread.status == PostStatus.hidden)
    return or_(*conds)


def get_thread(db: Session, thread_id: uuid.UUID) -> ForumThread | None:
    return db.get(ForumThread, thread_id, options=THREAD_OPTS)


def thread_for(db: Session, thread_id: uuid.UUID, viewer: User | None) -> ForumThread:
    """The thread, or a 404 when it doesn't exist or the viewer may not see it. For every write."""
    t = get_thread(db, thread_id)
    if t is None or not can_see_thread(t, viewer):
        raise not_found("This thread doesn't exist or was removed.")
    return t


def thread_to_read(db: Session, thread_id: uuid.UUID, viewer: User | None) -> ForumThread:
    """The thread, or a 404 when the viewer may not open it (its author may open a hidden one). For reading only."""
    t = get_thread(db, thread_id)
    if t is None or not can_read_thread(t, viewer):
        raise not_found("This thread doesn't exist or was removed.")
    return t


def as_id(value: str) -> uuid.UUID | None:
    """The thread id `value` spells, in any form uuid.UUID reads (with or without dashes, braces, any case)."""
    try:
        return uuid.UUID(value)
    except ValueError:
        return None


def thread_by_slug(db: Session, slug: str, viewer: User | None) -> ForumThread:
    """By slug, for reading (every link uses the slug; the routes that act on a thread take its id)."""
    t = db.scalar(select(ForumThread).where(ForumThread.slug == slug).options(*THREAD_OPTS))
    if t is None or not can_read_thread(t, viewer):
        raise not_found("This thread doesn't exist or was removed.")
    return t


def reply_for(db: Session, reply_id: uuid.UUID, viewer: User | None) -> tuple[ForumReply, ForumThread]:
    """The reply and its thread, or a 404 when the viewer may not see them. For every write."""
    r = db.get(ForumReply, reply_id, options=REPLY_OPTS)
    t = get_thread(db, r.thread_id) if r is not None else None
    if r is None or t is None or not can_see_thread(t, viewer) or not can_see_reply(r, viewer):
        raise not_found("This reply doesn't exist or was removed.")
    return r, t


def unavailable(status: PostStatus) -> ApiError:
    """409 post_unavailable: a deleted or hidden post takes no votes, edits or answers."""
    message = "This post was deleted." if status == PostStatus.deleted else "This post is hidden."
    return conflict("post_unavailable", message)
