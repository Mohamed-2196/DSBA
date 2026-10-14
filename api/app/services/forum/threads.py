"""Writing threads: start, edit and delete one, accept an answer, and a rep's pin, lock and hide."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import or_, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import set_committed_value

from app.core.access import Feature
from app.core.errors import conflict, forbidden, invalid, not_found
from app.core.time import utcnow
from app.models import ForumReply, ForumThread, PostStatus, ThreadVote, User
from app.schemas.forum import ThreadCreate, ThreadModeration, ThreadUpdate
from app.services import access, seniors
from app.services.forum import follows, notices
from app.services.forum.images import attach_images, release_images
from app.services.forum.rules import (
    audit,
    change,
    hide_reason,
    limit_threads,
    module_or_422,
    thread_slug,
    valid_body,
    valid_tags,
    valid_title,
)
from app.services.forum.taxonomy import place
from app.services.forum.text import media_ids
from app.services.forum.visibility import (
    REPLY_OPTS,
    can_see_reply,
    can_see_thread,
    get_thread,
    gone,
    may_change,
    moderates,
    unavailable,
)


def create_thread(db: Session, user: User, data: ThreadCreate, ip: str | None) -> ForumThread:
    """A new thread, upvoted by its author. Its forum images are attached. Posted without a name (forum.anonymous),
    it goes in the audit log with its author, so whoever reads the log can still see who posted. Asked of a senior
    (career.seniors), the senior is told."""
    if data.anonymous:
        access.require_feature(db, user, Feature.forum_anonymous)
    title = valid_title(data.title)
    body = valid_body(data.body)
    category, module = place(data.category, module_or_422(db, data.module_id, visible=True), module_wins=True)
    tags = valid_tags(data.tags)
    limit_threads(db, user)
    now = utcnow()
    t = ForumThread(
        title=title,
        body=body,
        category=category,
        module_id=module.id if module else None,
        tags=tags,
        author_id=user.id,
        author_year=user.year,
        anonymous=data.anonymous,
        status=PostStatus.visible,
        pinned=False,
        locked=False,
        vote_count=1,
        reply_count=0,
        created_at=now,
        last_activity_at=now,
    )
    for attempt in range(3):
        t.slug = thread_slug(db, title, attempt)
        try:
            with db.begin_nested():
                db.add(t)
            break
        except IntegrityError:  # the slug was taken in the meantime
            continue
    else:
        raise conflict("retry", "Something went wrong. Try again.")
    db.add(ThreadVote(user_id=user.id, thread_id=t.id))
    attach_images(db, user.id, body, thread_id=t.id)
    if data.anonymous:
        audit(db, user, "forum.thread.anonymous", "thread", t.id, ip, title=t.title, slug=t.slug)
    if data.senior_id is not None:
        seniors.asked(db, user, data.senior_id, t)
    return t


def update_thread(db: Session, user: User, t: ForumThread, data: ThreadUpdate, ip: str | None) -> None:
    """The author or a moderator edits the thread (its slug stays, so links keep working). A hidden thread is in
    the reps' hands: only they reach it here (visibility.thread_for)."""
    mine = t.author_id == user.id
    may_change(user, mine, "You can only edit your own threads.")
    if t.status == PostStatus.deleted or gone(t):
        raise unavailable(PostStatus.deleted)
    given = data.model_fields_set
    changed: list[str] = []
    old_body = t.body
    if "title" in given and data.title is not None:
        title = valid_title(data.title)
        if title != t.title:
            t.title = title
            changed.append("title")
    if "body" in given and data.body is not None:
        body = valid_body(data.body)
        if body != t.body:
            t.body = body
            changed.append("body")
    if "module_id" in given or ("category" in given and data.category is not None):
        module = module_or_422(db, data.module_id) if "module_id" in given else module_or_422(db, t.module_id)
        category = data.category if "category" in given and data.category is not None else t.category
        category, module = place(category, module, module_wins="module_id" in given)
        module_id = module.id if module else None
        if category != t.category:
            t.category = category
            changed.append("category")
        if module_id != t.module_id:
            t.module_id = module_id
            changed.append("module_id")
    if "tags" in given and data.tags is not None:
        tags = valid_tags(data.tags)
        if tags != list(t.tags or []):
            t.tags = tags
            changed.append("tags")
    if not changed:
        return
    t.edited_at = utcnow()
    if "body" in changed:
        attach_images(db, t.author_id, t.body, thread_id=t.id)
        release_images(db, set(media_ids(old_body)) - set(media_ids(t.body)))
    if not mine:
        audit(db, user, "forum.thread.edit", "thread", t.id, ip, title=t.title, fields=changed)


def delete_thread(db: Session, user: User, thread_id: uuid.UUID, ip: str | None) -> None:
    """The author or a moderator deletes the thread: its text goes, its title and replies stay readable while it has
    replies. A hidden thread stays hidden (only reps reach it): its text goes, and unhiding it later gives a deleted
    thread, so deleting never shows the public what a rep hid (security review SEC-15). Idempotent."""
    t = get_thread(db, thread_id)
    if t is None or (t.status == PostStatus.hidden and not moderates(user)):
        raise not_found("This thread doesn't exist or was removed.")
    mine = t.author_id == user.id
    if not (mine or moderates(user)):
        if not can_see_thread(t, user):
            raise not_found("This thread doesn't exist or was removed.")
        raise forbidden("You can only delete your own threads.")
    old_body, now = t.body, utcnow()
    if t.status == PostStatus.hidden:
        done = change(db, t, PostStatus.hidden, unless_deleted=True, body="", deleted_at=now, pinned=False)
    else:
        done = change(db, t, PostStatus.visible, status=PostStatus.deleted, body="", deleted_at=now, pinned=False)
    if not done:  # already deleted, or another request deleted it first
        return
    release_images(db, media_ids(old_body))
    if not mine:
        audit(db, user, "forum.thread.delete", "thread", t.id, ip, title=t.title)


def accept_answer(db: Session, user: User, t: ForumThread, reply_id: uuid.UUID | None, ip: str | None) -> None:
    """The thread's author (or a moderator) marks a direct reply by someone else as the answer, or clears it. The
    change is one conditional UPDATE, so a double click notifies the reply's author once."""
    mine = t.author_id == user.id
    may_change(user, mine, "Only the person who asked can accept an answer.")
    if t.status != PostStatus.visible:
        raise unavailable(t.status)
    if reply_id is None:
        if _set_answer(db, t, None) and not mine:
            audit(db, user, "forum.thread.accept", "thread", t.id, ip, title=t.title, replyId=None)
        return
    r = db.get(ForumReply, reply_id, options=REPLY_OPTS)
    if r is None or r.thread_id != t.id or not can_see_reply(r, user):
        raise not_found("This reply doesn't exist or was removed.")
    if r.status != PostStatus.visible:
        raise invalid("replyId", "Pick a reply that's still showing.")
    if r.parent_id is not None:
        raise invalid("replyId", "Only a direct reply to the question can be the answer.")
    if t.author_id is not None and r.author_id == t.author_id:
        raise invalid("replyId", "You can't accept your own reply.")
    if not _set_answer(db, t, r.id):
        return
    notices.answer_accepted(db, t, r, user)
    follows.answer_accepted(db, t, r, user, named=notices.named(t, user))
    if not mine:
        audit(db, user, "forum.thread.accept", "thread", t.id, ip, title=t.title, replyId=str(r.id))


def _set_answer(db: Session, t: ForumThread, reply_id: uuid.UUID | None) -> bool:
    """thread.accepted_reply_id = reply_id unless it already is. -> whether this request changed it."""
    current = ForumThread.accepted_reply_id
    differs = current.is_not(None) if reply_id is None else or_(current.is_(None), current != reply_id)
    row = db.execute(
        update(ForumThread)
        .where(ForumThread.id == t.id, differs)
        .values(accepted_reply_id=reply_id)
        .returning(ForumThread.id)
        .execution_options(synchronize_session=False)
    ).first()
    set_committed_value(t, "accepted_reply_id", reply_id)
    return row is not None


def moderate_thread(db: Session, user: User, t: ForumThread, data: ThreadModeration, ip: str | None) -> None:
    """Pin, lock or hide (a moderator). Each change is audited as forum.thread.<action>. Hiding tells the author,
    with the rep's reason (D3); unhiding a thread whose text was deleted gives a deleted thread (SEC-15)."""
    info: dict[str, Any] = {"title": t.title, "slug": t.slug}
    if data.pinned is not None and data.pinned != t.pinned:
        t.pinned = data.pinned
        audit(db, user, f"forum.thread.{'pin' if data.pinned else 'unpin'}", "thread", t.id, ip, **info)
    if data.locked is not None and data.locked != t.locked:
        t.locked = data.locked
        audit(db, user, f"forum.thread.{'lock' if data.locked else 'unlock'}", "thread", t.id, ip, **info)
    if data.status == "hidden" and t.status != PostStatus.hidden:
        was = t.status
        # a deleted thread keeps its deletion while hidden (deleted_at): unhiding gives it back as deleted
        extra: dict[str, Any] = {"deleted_at": t.deleted_at or utcnow()} if was == PostStatus.deleted else {}
        if change(db, t, was, status=PostStatus.hidden, **extra):
            reason = hide_reason(data.reason)
            audit(db, user, "forum.thread.hide", "thread", t.id, ip, **info, **{"from": was.value}, reason=reason)
            if was == PostStatus.visible:
                notices.post_hidden(db, t, None, user, reason)
    elif data.status == "visible" and t.status == PostStatus.hidden:
        restored = PostStatus.deleted if gone(t) else PostStatus.visible
        extra = {"body": ""} if restored == PostStatus.deleted else {}
        if change(db, t, PostStatus.hidden, status=restored, **extra):
            audit(db, user, "forum.thread.unhide", "thread", t.id, ip, **info, to=restored.value)
    elif data.status == "visible" and t.status == PostStatus.deleted:
        raise unavailable(t.status)
