"""Writing replies: post one (to the thread, or under one of its top-level replies), edit, delete, and a rep's
hide and unhide. The thread's reply_count always counts its visible replies: each status change is one conditional
UPDATE (rules.change), so two requests can't move the counter twice."""

from __future__ import annotations

from typing import Any

from sqlalchemy import update
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import set_committed_value

from app.core.errors import conflict, forbidden, invalid, not_found
from app.core.security import is_moderator
from app.core.time import utcnow
from app.models import ForumReply, ForumThread, PostStatus, User
from app.schemas.forum import ReplyCreate
from app.services.forum import notices
from app.services.forum.images import attach_images, release_images
from app.services.forum.rules import audit, bump_thread, change, hide_reason, limit_replies, valid_body
from app.services.forum.text import media_ids
from app.services.forum.visibility import REPLY_OPTS, can_see_reply, gone, unavailable


def _counted(db: Session, r: ForumReply, t: ForumThread, before: PostStatus, after: PostStatus) -> None:
    """After a status change: reply_count follows the visible replies, and a reply that stops showing is no longer
    the accepted answer."""
    delta = int(after == PostStatus.visible) - int(before == PostStatus.visible)
    if delta:
        bump_thread(db, t, replies=delta)
    if after != PostStatus.visible and t.accepted_reply_id == r.id:
        db.execute(
            update(ForumThread)
            .where(ForumThread.id == t.id, ForumThread.accepted_reply_id == r.id)
            .values(accepted_reply_id=None)
            .execution_options(synchronize_session=False)
        )
        set_committed_value(t, "accepted_reply_id", None)


def create_reply(db: Session, user: User, t: ForumThread, data: ReplyCreate) -> ForumReply:
    """A reply (to the thread, or to one of its top-level replies). Notifies the thread's author and the parent
    reply's author. Moderators may still reply to a locked thread."""
    if t.status != PostStatus.visible:
        what = "was deleted" if t.status == PostStatus.deleted else "is hidden"
        raise conflict("post_unavailable", f"This thread {what}, so it can't take new replies.")
    if t.locked and not is_moderator(user):
        raise conflict("thread_locked", "This thread is locked, so it can't take new replies.")
    body = valid_body(data.body, required=True)
    parent: ForumReply | None = None
    if data.parent_id is not None:
        parent = db.get(ForumReply, data.parent_id, options=REPLY_OPTS)
        if parent is None or parent.thread_id != t.id or not can_see_reply(parent, user):
            raise not_found("The reply you're answering doesn't exist or was removed.")
        if parent.status != PostStatus.visible:
            raise invalid("parentId", "You can't reply to a deleted or hidden reply.")
        if parent.parent_id is not None:
            raise invalid("parentId", "Reply to the first reply in that conversation instead.")
    limit_replies(db, user)
    now = utcnow()
    r = ForumReply(
        thread_id=t.id,
        parent_id=parent.id if parent else None,
        author_id=user.id,
        author_year=user.year,
        body=body,
        status=PostStatus.visible,
        vote_count=0,
        created_at=now,
    )
    db.add(r)
    db.flush()
    bump_thread(db, t, replies=1, activity=now)
    attach_images(db, user.id, body, reply_id=r.id)
    notices.reply_posted(db, t, r, parent, user)
    return r


def update_reply(db: Session, user: User, r: ForumReply, t: ForumThread, body: str, ip: str | None) -> None:
    mine = r.author_id == user.id
    if not (mine or is_moderator(user)):
        raise forbidden("You can only edit your own replies.")
    if r.status == PostStatus.deleted or gone(r):
        raise unavailable(PostStatus.deleted)
    new_body = valid_body(body, required=True)
    if new_body == r.body:
        return
    old_body = r.body
    r.body = new_body
    r.edited_at = utcnow()
    attach_images(db, r.author_id, new_body, reply_id=r.id)
    release_images(db, set(media_ids(old_body)) - set(media_ids(new_body)))
    if not mine:
        audit(db, user, "forum.reply.edit", "reply", r.id, ip, title=t.title, threadId=str(t.id))


def delete_reply(db: Session, user: User, r: ForumReply, t: ForumThread, ip: str | None) -> None:
    """The author or a moderator deletes a reply: it keeps its place with no text. A hidden reply stays hidden (only
    reps reach it), and unhiding it later gives a deleted reply (SEC-15). The notifications about it go (ST-6).
    Idempotent."""
    mine = r.author_id == user.id
    if not (mine or is_moderator(user)):
        raise forbidden("You can only delete your own replies.")
    old_body, now = r.body, utcnow()
    before = r.status
    if before == PostStatus.hidden:
        done = change(db, r, PostStatus.hidden, unless_deleted=True, body="", deleted_at=now)
    else:
        done = change(db, r, PostStatus.visible, status=PostStatus.deleted, body="", deleted_at=now)
    if not done:  # already deleted, or another request deleted it first
        return
    _counted(db, r, t, before, r.status)
    release_images(db, media_ids(old_body))
    notices.forget_reply(db, t, r)
    if not mine:
        audit(db, user, "forum.reply.delete", "reply", r.id, ip, title=t.title, threadId=str(t.id))


def moderate_reply(
    db: Session, user: User, r: ForumReply, t: ForumThread, status: str, ip: str | None, reason: str | None = None
) -> None:
    """Hide a reply, or show it again. Hiding tells its author (with the rep's reason) and takes back the
    notifications about it; unhiding a reply whose text was deleted gives a deleted reply (SEC-15). Audited."""
    info = {"title": t.title, "threadId": str(t.id)}
    before = r.status
    reason = hide_reason(reason)
    if status == "hidden" and before != PostStatus.hidden:
        # a deleted reply keeps its deletion while hidden (deleted_at): unhiding gives it back as deleted
        extra: dict[str, Any] = {"deleted_at": r.deleted_at or utcnow()} if before == PostStatus.deleted else {}
        if not change(db, r, before, status=PostStatus.hidden, **extra):
            return
        _counted(db, r, t, before, PostStatus.hidden)
        audit(db, user, "forum.reply.hide", "reply", r.id, ip, **info, **{"from": before.value}, reason=reason)
        if before == PostStatus.visible:
            notices.forget_reply(db, t, r)
            notices.post_hidden(db, t, r, user, reason)
    elif status == "visible" and before == PostStatus.hidden:
        restored = PostStatus.deleted if gone(r) else PostStatus.visible
        extra = {"body": ""} if restored == PostStatus.deleted else {}
        if not change(db, r, PostStatus.hidden, status=restored, **extra):
            return
        _counted(db, r, t, before, restored)
        audit(db, user, "forum.reply.unhide", "reply", r.id, ip, **info, to=restored.value)
    elif status == "visible" and before == PostStatus.deleted:
        raise unavailable(before)
