"""The forum's responses: ThreadSummary (lists), ThreadDetail (a thread with its replies) and Reply. People appear
through accounts.public_user, the one UserPublic serialiser (code quality review CQ-6)."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from typing import Any

from sqlalchemy import ColumnElement, Row, and_, exists, or_, select
from sqlalchemy.orm import Session

from app.core.security import is_moderator
from app.models import ForumReply, ForumThread, PostStatus, ReplyVote, ThreadVote, User
from app.schemas.forum import Reply, ThreadDetail, ThreadSummary
from app.services.accounts import public_user
from app.services.forum.taxonomy import thread_year
from app.services.forum.text import excerpt, first_image
from app.services.forum.visibility import REPLY_OPTS, can_read_reply, gone


def _text(post: ForumThread | ForumReply) -> str:
    """What a post says now: nothing once it was deleted (or deleted while hidden)."""
    return "" if post.status == PostStatus.deleted or gone(post) else post.body


def _editable(post: ForumThread | ForumReply, mine: bool, mod: bool) -> bool:
    """Whether the viewer may edit or delete it: its author or a rep while it shows; only reps while it is hidden
    (its author can read it, D3, but it is in the reps' hands); nobody once its text is deleted."""
    if post.status == PostStatus.deleted or gone(post):
        return False
    return mod if post.status == PostStatus.hidden else (mine or mod)


def summary_dict(
    t: ForumThread, author: User | None, year: int | None, voted: bool, viewer: User | None
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
        "author": public_user(author),
        "author_year": t.author_year if t.author_year in (1, 2, 3) else None,
        "created_at": t.created_at,
        "last_activity_at": t.last_activity_at,
        "vote_count": t.vote_count,
        "reply_count": t.reply_count,
        "voted": voted,
        "answered": t.accepted_reply_id is not None,
        "pinned": t.pinned,
        "locked": t.locked,
        "status": t.status.value,
        "image": first_image(text),
        "is_mine": viewer is not None and t.author_id == viewer.id,
    }


def summaries(rows: Sequence[Row[Any]], viewer: User | None) -> list[ThreadSummary]:
    """Rows of queries.summary_select() as ThreadSummary."""
    return [
        ThreadSummary.model_validate(summary_dict(t, author, year, bool(voted), viewer))
        for t, author, year, voted in rows
    ]


def reply_dict(r: ForumReply, author: User | None, t: ForumThread, viewer: User | None, voted: bool) -> dict[str, Any]:
    mine = viewer is not None and r.author_id == viewer.id
    return {
        "id": r.id,
        "thread_id": r.thread_id,
        "parent_id": r.parent_id,
        "author": public_user(author),
        "author_year": r.author_year if r.author_year in (1, 2, 3) else None,
        "body": _text(r),
        "created_at": r.created_at,
        "edited_at": r.edited_at,
        "vote_count": r.vote_count,
        "voted": voted,
        "status": r.status.value,
        "accepted": t.accepted_reply_id == r.id,
        "is_mine": mine,
        "can_edit": _editable(r, mine, is_moderator(viewer)),
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
    mod = is_moderator(viewer)
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
    my_votes: set[uuid.UUID] = set()
    if viewer is not None and rows:
        my_votes = set(
            db.scalars(
                select(ReplyVote.reply_id)
                .join(ForumReply, ForumReply.id == ReplyVote.reply_id)
                .where(ReplyVote.user_id == viewer.id, ForumReply.thread_id == t.id)
            )
        )
    data = summary_dict(t, author, thread_year(db, t), voted, viewer)
    data.update(
        body=_text(t),
        edited_at=t.edited_at,
        accepted_reply_id=t.accepted_reply_id,
        replies=[reply_dict(r, a, t, viewer, r.id in my_votes) for r, a in rows],
        can_edit=_editable(t, mine, mod),
        can_accept=(mine or mod) and t.status == PostStatus.visible,
        can_moderate=mod,
    )
    return ThreadDetail.model_validate(data)
