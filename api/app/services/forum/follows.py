"""Following a thread (needs the forum.follow feature).

- Voting for a thread or replying in it starts following it at 'answers': the follower hears when an answer is
  accepted. They can choose 'replies' (every reply too) or switch it 'off'. A follow switched off stays off: voting
  or replying again doesn't switch it back on.
- The thread's author doesn't follow their own thread: they hear about its replies already (notices.reply_posted).
- One row per person and thread: in the person's export, and deleted with their account."""

from __future__ import annotations

import uuid
from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.access import Feature
from app.models import FollowLevel, ForumReply, ForumThread, ThreadFollow, User
from app.schemas.forum import FollowLevel as FollowLevelName
from app.services import access
from app.services.forum.notices import QUOTE_LENGTH, quoted_title, reply_url
from app.services.forum.text import excerpt
from app.services.notify import notify


def _on(db: Session, user: User | None) -> bool:
    return user is not None and access.feature_on(db, user, Feature.forum_follow)


def level_of(db: Session, t: ForumThread, viewer: User | None) -> FollowLevelName:
    """The viewer's follow of `t`: 'off' for guests, the thread's author and when following is switched off."""
    if viewer is None or not _on(db, viewer):
        return "off"
    level = db.scalar(
        select(ThreadFollow.level).where(ThreadFollow.thread_id == t.id, ThreadFollow.user_id == viewer.id)
    )
    return FollowLevel(level).value if level else "off"


def start(db: Session, user: User, t: ForumThread) -> None:
    """Voting or replying: follow `t` at 'answers' unless there is a follow already (one switched off stays off)."""
    if t.author_id == user.id or not _on(db, user):
        return
    db.execute(
        pg_insert(ThreadFollow)
        .values(user_id=user.id, thread_id=t.id, level=FollowLevel.answers.value)
        .on_conflict_do_nothing()
    )


def set_level(db: Session, user: User, t: ForumThread, level: FollowLevelName) -> FollowLevelName:
    """The person's own choice. -> the level now."""
    stmt = pg_insert(ThreadFollow).values(user_id=user.id, thread_id=t.id, level=level)
    db.execute(stmt.on_conflict_do_update(index_elements=["user_id", "thread_id"], set_={"level": level}))
    return level


def _followers(db: Session, t: ForumThread, levels: Iterable[FollowLevel], skip: set[uuid.UUID]) -> list[User]:
    """The people following `t` at one of `levels` for whom following is on, except those in `skip`."""
    people = db.scalars(
        select(User)
        .join(ThreadFollow, ThreadFollow.user_id == User.id)
        .where(ThreadFollow.thread_id == t.id, ThreadFollow.level.in_([lv.value for lv in levels]))
        .order_by(User.id)
    ).all()
    return [p for p in people if p.id not in skip and _on(db, p)]


def reply_posted(db: Session, t: ForumThread, r: ForumReply, actor: User, told: set[uuid.UUID], named: bool) -> None:
    """Followers at 'replies' hear about a new reply, unless they were told already (`told`: the thread's and the
    parent reply's authors) or wrote it."""
    name = (actor.display_name or "Someone") if named else "The person who asked"
    quote = excerpt(r.body, QUOTE_LENGTH) or None
    data = {"threadId": str(t.id), "replyId": str(r.id)}
    for person in _followers(db, t, [FollowLevel.replies], told | {actor.id}):
        title = f"{name} replied in {quoted_title(t)}"
        notify(
            db,
            person.id,
            "followed_reply",
            title,
            body=quote,
            url=reply_url(t, r.id),
            actor=actor,
            named=named,
            data=data,
        )


def answer_accepted(db: Session, t: ForumThread, r: ForumReply, actor: User, named: bool) -> None:
    """Followers hear that the thread they follow has an answer (not the answer's author: they are told already)."""
    skip = {i for i in (actor.id, r.author_id, t.author_id) if i is not None}
    data = {"threadId": str(t.id), "replyId": str(r.id)}
    for person in _followers(db, t, [FollowLevel.answers, FollowLevel.replies], skip):
        notify(
            db,
            person.id,
            "followed_answer",
            f"{quoted_title(t)} has an answer",
            body=excerpt(r.body, QUOTE_LENGTH) or None,
            url=reply_url(t, r.id),
            actor=actor,
            named=named,
            data=data,
        )
