"""Upvotes on threads and replies: idempotent, and the counter moves in SQL in the same transaction."""

from __future__ import annotations

from sqlalchemy import delete, func, select, update
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import set_committed_value

from app.models import ForumReply, ForumThread, PostStatus, ReplyVote, ThreadVote, User
from app.schemas.forum import VoteResult
from app.services.forum.visibility import unavailable


def vote(
    db: Session, user: User, target: ForumThread | ForumReply, up: bool, thread: ForumThread | None = None
) -> VoteResult:
    """Upvote, or take the vote back. Idempotent; the counter moves in SQL in the same transaction.
    Deleted and hidden posts (and replies in a hidden thread) take no votes."""
    if target.status != PostStatus.visible:
        raise unavailable(target.status)
    if thread is not None and thread.status == PostStatus.hidden:
        raise unavailable(thread.status)
    if isinstance(target, ForumThread):
        if up:
            changed = db.execute(
                pg_insert(ThreadVote)
                .values(user_id=user.id, thread_id=target.id)
                .on_conflict_do_nothing()
                .returning(ThreadVote.thread_id)
            ).first()
        else:
            changed = db.execute(
                delete(ThreadVote)
                .where(ThreadVote.user_id == user.id, ThreadVote.thread_id == target.id)
                .returning(ThreadVote.thread_id)
            ).first()
        model: type[ForumThread] | type[ForumReply] = ForumThread
    else:
        if up:
            changed = db.execute(
                pg_insert(ReplyVote)
                .values(user_id=user.id, reply_id=target.id)
                .on_conflict_do_nothing()
                .returning(ReplyVote.reply_id)
            ).first()
        else:
            changed = db.execute(
                delete(ReplyVote)
                .where(ReplyVote.user_id == user.id, ReplyVote.reply_id == target.id)
                .returning(ReplyVote.reply_id)
            ).first()
        model = ForumReply
    if changed is not None:
        delta = 1 if up else -1
        count = db.execute(
            update(model)
            .where(model.id == target.id)
            .values(vote_count=func.greatest(model.vote_count + delta, 0))
            .returning(model.vote_count)
            .execution_options(synchronize_session=False)
        ).scalar_one()
    else:  # nothing to change: report the count as it is now
        count = db.scalar(select(model.vote_count).where(model.id == target.id)) or 0
    set_committed_value(target, "vote_count", count)
    return VoteResult(vote_count=count, voted=up)
