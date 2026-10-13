"""Reading the forum: the thread list (filters, search, hot/new/top), hot threads, related threads and stats.

Every list joins the author and the module and computes `voted` in the same query (no N+1). Control characters in
the query string never get here: core's ControlCharactersMiddleware answers 400 for them."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any, Literal

from sqlalchemy import ColumnElement, DateTime, Select, and_, case, exists, extract, false, func, literal, or_, select
from sqlalchemy.orm import Session

from app.core.time import (
    BAHRAIN,  # "today" is a day in Bahrain: one definition (code quality review CQ-6)
    utcnow,
)
from app.models import ForumReply, ForumThread, Module, PostStatus, ReplyVote, ThreadVote, User
from app.schemas.forum import Contributor, ForumStats, ThreadPage, ThreadSummary
from app.services import access
from app.services.accounts import public_user
from app.services.forum.search import has_tag, search_condition
from app.services.forum.taxonomy import CATEGORIES, FORUM_WIDE_CATEGORIES, thread_year
from app.services.forum.views import summaries
from app.services.forum.visibility import THREAD_OPTS, listed

Sort = Literal["hot", "new", "top"]
TOP_CONTRIBUTORS = 5
CONTRIBUTOR_WINDOW = timedelta(days=7)


# ── SQL pieces ──────────────────────────────────────────────────────────────────────────────────────


def year_expr() -> ColumnElement[Any]:
    """The thread's cohort: its category's year, else its module's (needs the outer join to modules)."""
    whens = [(ForumThread.category == c.id, literal(c.year)) for c in CATEGORIES if c.year is not None]
    return case(*whens, else_=Module.year)


def year_condition(year: int) -> ColumnElement[bool]:
    """That cohort's threads (its category, or a module of that year) plus the forum-wide ones."""
    return or_(
        ForumThread.category == f"year-{year}",
        Module.year == year,
        and_(ForumThread.category.in_(FORUM_WIDE_CATEGORIES), ForumThread.module_id.is_(None)),
    )


def hot_expr(now: datetime) -> ColumnElement[Any]:
    """How hot a thread is: (votes + 1.5 * replies) / (age in hours + 2)^1.5."""
    hours = func.greatest(extract("epoch", literal(now, DateTime(timezone=True)) - ForumThread.created_at) / 3600, 0)
    return (ForumThread.vote_count + 1.5 * ForumThread.reply_count) / func.power(hours + 2, 1.5)


def order_by(sort: Sort, now: datetime, *, pinned_first: bool) -> list[Any]:
    order: list[Any] = [ForumThread.pinned.desc()] if pinned_first else []
    if sort == "new":
        order.append(ForumThread.created_at.desc())
    elif sort == "top":
        order += [ForumThread.vote_count.desc(), ForumThread.created_at.desc()]
    else:
        order += [hot_expr(now).desc(), ForumThread.created_at.desc()]
    order.append(ForumThread.id.desc())
    return order


def summary_select(viewer: User | None) -> Select[Any]:
    """Threads with their author, cohort and `voted` (rows for views.summaries)."""
    voted: ColumnElement[bool] = (
        exists().where(ThreadVote.thread_id == ForumThread.id, ThreadVote.user_id == viewer.id)
        if viewer is not None
        else false()
    )
    return (
        select(ForumThread, User, year_expr().label("year"), voted.label("voted"))
        .outerjoin(Module, Module.id == ForumThread.module_id)
        .outerjoin(User, User.id == ForumThread.author_id)
        .options(*THREAD_OPTS)
    )


# ── lists ───────────────────────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True, slots=True)
class ThreadFilters:
    q: str | None = None
    category: str | None = None
    module_id: str | None = None
    tag: str | None = None
    year: int | None = None
    unanswered: bool = False  # no visible replies yet
    author_id: uuid.UUID | None = None  # "mine"


def list_threads(db: Session, viewer: User | None, f: ThreadFilters, sort: Sort, limit: int, offset: int) -> ThreadPage:
    conds = [listed(viewer)]
    search = search_condition(f.q) if f.q else None
    if search is not None:
        conds.append(search)
    if f.category:
        conds.append(ForumThread.category == f.category)
    if f.module_id:
        conds.append(ForumThread.module_id == f.module_id)
    if f.tag:
        conds.append(has_tag(f.tag))
    if f.year is not None:
        conds.append(year_condition(f.year))
    if f.unanswered:
        conds.append(ForumThread.reply_count == 0)
    if f.author_id is not None:
        conds.append(ForumThread.author_id == f.author_id)
    total = db.scalar(
        select(func.count())
        .select_from(ForumThread)
        .outerjoin(Module, Module.id == ForumThread.module_id)
        .where(*conds)
    )
    order = order_by(sort, utcnow(), pinned_first=search is None)
    rows = db.execute(summary_select(viewer).where(*conds).order_by(*order).limit(limit).offset(offset)).all()
    access.prefetch(db, [row[1] for row in rows])
    return ThreadPage(items=summaries(rows, viewer), total=total or 0, limit=limit, offset=offset)


def hot_threads(db: Session, viewer: User | None, n: int, year: int | None) -> list[ThreadSummary]:
    """The hottest visible threads, pinned ones left out; with `year`, that cohort's plus the forum-wide ones."""
    conds = [ForumThread.status == PostStatus.visible, ForumThread.pinned.is_(False)]
    if year is not None:
        conds.append(year_condition(year))
    order = order_by("hot", utcnow(), pinned_first=False)
    rows = db.execute(summary_select(viewer).where(*conds).order_by(*order).limit(n)).all()
    access.prefetch(db, [row[1] for row in rows])
    return summaries(rows, viewer)


def related_threads(db: Session, viewer: User | None, t: ForumThread, n: int) -> list[ThreadSummary]:
    """Same module first, then shared tags and category: a score of at least 3."""
    now = utcnow()
    year = thread_year(db, t)
    score: ColumnElement[Any] = case((ForumThread.category == t.category, 2), else_=0) + func.least(2, hot_expr(now))
    if t.module_id:
        score = score + case((ForumThread.module_id == t.module_id, 6), else_=0)
    if year is not None:
        score = score + case((year_expr() == year, 1), else_=0)
    for tag in t.tags or []:
        score = score + case((has_tag(tag), 2), else_=0)
    rows = db.execute(
        summary_select(viewer)
        .where(
            ForumThread.id != t.id,
            ForumThread.status == PostStatus.visible,
            ForumThread.pinned.is_(False),
            score >= 3,
        )
        .order_by(score.desc(), ForumThread.created_at.desc(), ForumThread.id.desc())
        .limit(n)
    ).all()
    access.prefetch(db, [row[1] for row in rows])
    return summaries(rows, viewer)


# ── stats ───────────────────────────────────────────────────────────────────────────────────────────


def forum_stats(db: Session) -> ForumStats:
    """Counts over the threads a guest's list shows, replies since midnight in Bahrain, and the week's top helpers."""
    now = utcnow()
    shown = listed(None)
    by_category = {c.id: 0 for c in CATEGORIES}
    no_replies_by_category = {c.id: 0 for c in CATEGORIES}
    for category, n, unanswered in db.execute(
        select(ForumThread.category, func.count(), func.count().filter(ForumThread.reply_count == 0))
        .where(shown)
        .group_by(ForumThread.category)
    ):
        by_category[category] = n
        no_replies_by_category[category] = unanswered
    tagged = select(ForumThread.category, func.unnest(ForumThread.tags).label("tag")).where(shown).subquery()
    by_tag: dict[str, int] = {}
    tags_by_category: dict[str, dict[str, int]] = {c.id: {} for c in CATEGORIES}
    for category, tag_id, n in db.execute(
        select(tagged.c.category, tagged.c.tag, func.count()).group_by(tagged.c.category, tagged.c.tag)
    ):
        tags_by_category.setdefault(category, {})[tag_id] = n
        by_tag[tag_id] = by_tag.get(tag_id, 0) + n
    midnight = now.astimezone(BAHRAIN).replace(hour=0, minute=0, second=0, microsecond=0)
    replies_today = db.scalar(
        select(func.count())
        .select_from(ForumReply)
        .join(ForumThread, ForumThread.id == ForumReply.thread_id)
        .where(
            ForumReply.status == PostStatus.visible,
            ForumThread.status != PostStatus.hidden,
            ForumReply.created_at >= midnight,
        )
    )
    return ForumStats.model_validate(
        {
            "total": sum(by_category.values()),
            "by_category": by_category,
            "replies_today": replies_today or 0,
            "no_replies": sum(no_replies_by_category.values()),
            "top_contributors": _top_contributors(db, now),
            "by_tag": by_tag,
            "no_replies_by_category": no_replies_by_category,
            "tags_by_category": tags_by_category,
        }
    )


def _top_contributors(db: Session, now: datetime) -> list[Contributor]:
    """Replies of the last 7 days: votes from other people on them + 10 per accepted answer. Deleted accounts and
    hidden or deleted replies don't count."""
    since = now - CONTRIBUTOR_WINDOW
    recent = and_(
        ForumReply.created_at >= since,
        ForumReply.status == PostStatus.visible,
        ForumReply.author_id.is_not(None),
        ForumThread.status != PostStatus.hidden,
    )
    others = (
        select(ReplyVote.reply_id, func.count().label("n"))
        .join(ForumReply, ForumReply.id == ReplyVote.reply_id)
        .where(ReplyVote.user_id != ForumReply.author_id, ForumReply.created_at >= since)
        .group_by(ReplyVote.reply_id)
        .subquery()
    )
    per_author = (
        select(
            ForumReply.author_id.label("author_id"),
            func.count(ForumReply.id).label("replies"),
            func.coalesce(func.sum(others.c.n), 0).label("votes"),
            func.count(ForumReply.id).filter(ForumThread.accepted_reply_id == ForumReply.id).label("accepted"),
        )
        .join(ForumThread, ForumThread.id == ForumReply.thread_id)
        .outerjoin(others, others.c.reply_id == ForumReply.id)
        .where(recent)
        .group_by(ForumReply.author_id)
        .subquery()
    )
    score = per_author.c.votes + 10 * per_author.c.accepted
    rows = db.execute(
        select(User, per_author.c.replies, per_author.c.votes, per_author.c.accepted, score)
        .join(per_author, per_author.c.author_id == User.id)
        .order_by(score.desc(), per_author.c.replies.desc(), User.display_name, User.id)
        .limit(TOP_CONTRIBUTORS)
    ).all()
    access.prefetch(db, [row[0] for row in rows])
    return [
        Contributor.model_validate(
            {"user": public_user(u), "replies": n, "votes": int(v), "accepted": a, "score": int(s)}
        )
        for u, n, v, a, s in rows
    ]
