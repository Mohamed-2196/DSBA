"""The forum's responses: ThreadSummary (lists), ThreadDetail (a thread with its replies) and Reply. People appear
through accounts.public_user, the one UserPublic serialiser (code quality review CQ-6).

An anonymous thread's author is named only to themselves and to moderators (forum.moderate): everyone else gets
author None and anonymous true, and so do the author's own replies in that thread."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from typing import Any

from sqlalchemy import ColumnElement, Row, and_, exists, or_, select
from sqlalchemy.orm import Session

from app.core.links import MEDIA_PATH
from app.models import ForumReply, ForumThread, Notification, PostStatus, ReplyVote, ThreadVote, Upload, User
from app.schemas.forum import Reply, ThreadDetail, ThreadSummary
from app.services import access
from app.services.accounts import public_user
from app.services.forum import follows
from app.services.forum.taxonomy import thread_year
from app.services.forum.text import excerpt, pictures
from app.services.forum.visibility import REPLY_OPTS, can_read_reply, gone, moderates
from app.services.uploads import shows_image


def _text(post: ForumThread | ForumReply) -> str:
    """What a post says now: nothing once it was deleted (or deleted while hidden)."""
    return "" if post.status == PostStatus.deleted or gone(post) else post.body


def _editable(post: ForumThread | ForumReply, mine: bool, mod: bool) -> bool:
    """Whether the viewer may edit or delete it: its author or a rep while it shows; only reps while it is hidden
    (its author can read it, D3, but it is in the reps' hands); nobody once its text is deleted."""
    if post.status == PostStatus.deleted or gone(post):
        return False
    return mod if post.status == PostStatus.hidden else (mine or mod)


def names_author(t: ForumThread, viewer: User | None) -> bool:
    """Whether the viewer may see who wrote the thread: always, unless it is anonymous; then its author and
    moderators only."""
    return not t.anonymous or (viewer is not None and t.author_id == viewer.id) or moderates(viewer)


def first_pictures(
    db: Session, threads: Sequence[ForumThread], viewer: User | None
) -> dict[uuid.UUID, dict[str, str] | None]:
    """Each thread's first picture the viewer can open, {src, alt}, or None: a picture whose upload is gone (its
    author deleted their account) or that they may not see is passed over, so a list never points at one that won't
    load. One query for all the threads' pictures."""
    found = {t.id: pictures(_text(t)) for t in threads}
    ids = {uuid.UUID(m.group(1)) for shown in found.values() for p in shown if (m := MEDIA_PATH.fullmatch(p["src"]))}
    uploads = {u.id: u for u in db.scalars(select(Upload).where(Upload.id.in_(ids)))} if ids else {}

    def opens(p: dict[str, str]) -> bool:
        m = MEDIA_PATH.fullmatch(p["src"])
        return m is not None and shows_image(db, uploads.get(uuid.UUID(m.group(1))), viewer)

    return {tid: next((p for p in shown if opens(p)), None) for tid, shown in found.items()}


def unread_threads(db: Session, viewer: User | None, thread_ids: Sequence[uuid.UUID]) -> set[uuid.UUID]:
    """The threads among `thread_ids` that the viewer has unread notifications about (a reply, an answer). One
    query; none for guests."""
    if viewer is None or not thread_ids:
        return set()
    about = Notification.data["threadId"].astext
    found = db.scalars(
        select(about)
        .where(
            Notification.user_id == viewer.id,
            Notification.read_at.is_(None),
            about.in_([str(i) for i in thread_ids]),
        )
        .distinct()
    )
    return {uuid.UUID(i) for i in found}


def summary_dict(
    t: ForumThread,
    author: User | None,
    year: int | None,
    voted: bool,
    viewer: User | None,
    image: dict[str, str] | None,
    unread: bool,
) -> dict[str, Any]:
    text = _text(t)
    return {
        "id": t.id,
        "slug": t.slug,
        "title": t.title,
        "excerpt": excerpt(text),
        "category": t.category,
        "module_id": t.module_id,
        "year": year,
        "tags": list(t.tags or []),
        "author": public_user(author) if names_author(t, viewer) else None,
        "author_year": t.author_year,  # 1-3 or none: the database checks it
        "anonymous": t.anonymous,
        "created_at": t.created_at,
        "last_activity_at": t.last_activity_at,
        "vote_count": t.vote_count,
        "reply_count": t.reply_count,
        "voted": voted,
        "answered": t.accepted_reply_id is not None,
        "pinned": t.pinned,
        "locked": t.locked,
        "status": t.status.value,
        "image": image,
        "is_mine": viewer is not None and t.author_id == viewer.id,
        "unread": unread,
    }


def summaries(db: Session, rows: Sequence[Row[Any]], viewer: User | None) -> list[ThreadSummary]:
    """Rows of queries.summary_select() as ThreadSummary."""
    threads = [row[0] for row in rows]
    images = first_pictures(db, threads, viewer)
    unread = unread_threads(db, viewer, [t.id for t in threads])
    return [
        ThreadSummary.model_validate(summary_dict(t, author, year, bool(voted), viewer, images[t.id], t.id in unread))
        for t, author, year, voted in rows
    ]


def reply_dict(r: ForumReply, author: User | None, t: ForumThread, viewer: User | None, voted: bool) -> dict[str, Any]:
    mine = viewer is not None and r.author_id == viewer.id
    asker = t.anonymous and r.author_id is not None and r.author_id == t.author_id
    return {
        "id": r.id,
        "thread_id": r.thread_id,
        "parent_id": r.parent_id,
        "author": public_user(author) if not asker or names_author(t, viewer) else None,
        "author_year": r.author_year,
        "anonymous": asker,
        "body": _text(r),
        "created_at": r.created_at,
        "edited_at": r.edited_at,
        "vote_count": r.vote_count,
        "voted": voted,
        "status": r.status.value,
        "accepted": t.accepted_reply_id == r.id,
        "is_mine": mine,
        "can_edit": _editable(r, mine, moderates(viewer)),
    }


def reply_out(db: Session, r: ForumReply, t: ForumThread, viewer: User | None) -> Reply:
    author = db.get(User, r.author_id) if r.author_id else None
    voted = viewer is not None and bool(
        db.scalar(select(exists().where(ReplyVote.reply_id == r.id, ReplyVote.user_id == viewer.id)))
    )
    return Reply.model_validate(reply_dict(r, author, t, viewer, voted))


def thread_detail(db: Session, t: ForumThread, viewer: User | None) -> ThreadDetail:
    """The thread with its replies, oldest first. Deleted replies keep their place; hidden ones show for moderators,
    and for their own author (status 'hidden', D3). A hidden thread reaches its author with status 'hidden' (the web
    app shows them a banner) and nothing they can change."""
    mod = moderates(viewer)
    mine = viewer is not None and t.author_id == viewer.id
    author = db.get(User, t.author_id) if t.author_id else None
    voted = viewer is not None and bool(
        db.scalar(select(exists().where(ThreadVote.thread_id == t.id, ThreadVote.user_id == viewer.id)))
    )
    shown: ColumnElement[bool] = ForumReply.status.in_([PostStatus.visible, PostStatus.deleted])
    if mod:
        shown = or_(shown, ForumReply.status == PostStatus.hidden)
    elif viewer is not None:  # your own hidden replies, unless their text was deleted
        shown = or_(
            shown,
            and_(
                ForumReply.status == PostStatus.hidden,
                ForumReply.author_id == viewer.id,
                ForumReply.deleted_at.is_(None),
            ),
        )
    rows = [
        (r, a)
        for r, a in db.execute(
            select(ForumReply, User)
            .outerjoin(User, User.id == ForumReply.author_id)
            .where(ForumReply.thread_id == t.id, shown)
            .options(*REPLY_OPTS)
            .order_by(ForumReply.created_at, ForumReply.id)
        ).tuples()
        if can_read_reply(r, viewer)
    ]
    access.prefetch(db, [author, *(a for _, a in rows)])
    my_votes: set[uuid.UUID] = set()
    if viewer is not None and rows:
        my_votes = set(
            db.scalars(
                select(ReplyVote.reply_id)
                .join(ForumReply, ForumReply.id == ReplyVote.reply_id)
                .where(ReplyVote.user_id == viewer.id, ForumReply.thread_id == t.id)
            )
        )
    image = first_pictures(db, [t], viewer)[t.id]
    unread = t.id in unread_threads(db, viewer, [t.id])
    data = summary_dict(t, author, thread_year(db, t), voted, viewer, image, unread)
    data.update(
        body=_text(t),
        edited_at=t.edited_at,
        accepted_reply_id=t.accepted_reply_id,
        replies=[reply_dict(r, a, t, viewer, r.id in my_votes) for r, a in rows],
        can_edit=_editable(t, mine, mod),
        can_accept=(mine or mod) and t.status == PostStatus.visible,
        can_moderate=mod,
        following=follows.level_of(db, t, viewer),
    )
    return ThreadDetail.model_validate(data)
