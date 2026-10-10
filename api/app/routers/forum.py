"""The forum. Owner: community agent. Rules and queries live in app/services/forum.py."""

from __future__ import annotations

from uuid import UUID

from fastapi import Query, Request, Response, status

from app.core.errors import unauthenticated
from app.core.pagination import Limit, Offset, YearParam
from app.core.security import DB, ActiveUser, CurrentUser, Moderator, OptionalUser, client_ip
from app.routers._base import router_for
from app.schemas.forum import (
    AcceptRequest,
    Category,
    ForumMeta,
    ForumStats,
    Reply,
    ReplyCreate,
    ReplyModeration,
    ReplyUpdate,
    Sort,
    ThreadCreate,
    ThreadDetail,
    ThreadModeration,
    ThreadPage,
    ThreadSummary,
    ThreadUpdate,
    VoteResult,
)
from app.services import forum

router = router_for("forum")


@router.get("/forum/meta", response_model=ForumMeta)
def meta() -> ForumMeta:
    """Categories and tags (the server validates threads against these)."""
    return forum.forum_meta()


@router.get("/forum/stats", response_model=ForumStats)
def stats(db: DB) -> ForumStats:
    """Counts for the tabs and chips, replies since midnight (Bahrain) and the week's top contributors."""
    return forum.forum_stats(db)


@router.get("/forum/threads", response_model=ThreadPage)
def list_threads(
    db: DB,
    user: OptionalUser,
    q: str | None = Query(default=None, max_length=200, description="Full-text search: title, body, replies, module"),
    category: Category | None = None,
    module_id: str | None = None,
    tag: str | None = None,
    year: YearParam | None = None,
    sort: Sort = "hot",
    unanswered: bool = Query(default=False, description="Only threads without a visible reply yet"),
    mine: bool = Query(default=False, description="Only the signed-in user's threads (needs a session)"),
    limit: Limit = 20,
    offset: Offset = 0,
) -> ThreadPage:
    """Pinned threads first (when not searching), then by `sort`. Hidden threads are left out (moderators see them);
    deleted ones stay listed, without their text, while they have replies. `year`: that cohort's threads (its
    category, or a module of that year) plus forum-wide ones (study groups and general without a module).
    `hot` = (votes + 1.5 * replies) / (age in hours + 2)^1.5."""
    if mine and user is None:
        raise unauthenticated("Sign in to see your threads.")
    filters = forum.ThreadFilters(
        q=q,
        category=category,
        module_id=module_id,
        tag=tag,
        year=year,
        unanswered=unanswered,
        author_id=user.id if mine and user is not None else None,
    )
    return forum.list_threads(db, user, filters, sort, limit, offset)


@router.get("/forum/threads/hot", response_model=list[ThreadSummary])
def hot_threads(
    db: DB, user: OptionalUser, n: int = Query(default=5, ge=1, le=20), year: YearParam | None = None
) -> list[ThreadSummary]:
    """The hottest threads (pinned ones excluded), for Home and the newsletter."""
    return forum.hot_threads(db, user, n, year)


@router.post("/forum/threads", response_model=ThreadDetail, status_code=status.HTTP_201_CREATED)
def create_thread(body: ThreadCreate, user: ActiveUser, db: DB) -> ThreadDetail:
    """The author upvotes their own thread. Forum images in the body (/api/v1/media/<id>) are attached.

    Errors: rate_limited (429) after 10 threads in an hour."""
    t = forum.create_thread(db, user, body)
    db.commit()
    return forum.thread_detail(db, t, user)


@router.get("/forum/threads/{slug}", response_model=ThreadDetail)
def get_thread(slug: str, db: DB, user: OptionalUser) -> ThreadDetail:
    """By slug (or id). Replies oldest first; hidden ones only for moderators."""
    return forum.thread_detail(db, forum.thread_by_slug(db, slug, user), user)


@router.patch("/forum/threads/{thread_id}", response_model=ThreadDetail)
def update_thread(thread_id: UUID, body: ThreadUpdate, request: Request, user: ActiveUser, db: DB) -> ThreadDetail:
    """The author (or a moderator) edits the thread; edited_at is set. The slug never changes."""
    t = forum.thread_for(db, thread_id, user)
    forum.update_thread(db, user, t, body, client_ip(request))
    db.commit()
    return forum.thread_detail(db, t, user)


@router.delete("/forum/threads/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_thread(thread_id: UUID, request: Request, user: CurrentUser, db: DB) -> Response:
    """The author (or a moderator) deletes the thread: its text goes, its replies stay readable."""
    forum.delete_thread(db, user, thread_id, client_ip(request))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/forum/threads/{thread_id}/related", response_model=list[ThreadSummary])
def related_threads(
    thread_id: UUID, db: DB, user: OptionalUser, n: int = Query(default=4, ge=1, le=10)
) -> list[ThreadSummary]:
    """Same module first, then shared tags and category."""
    return forum.related_threads(db, user, forum.thread_for(db, thread_id, user), n)


@router.put("/forum/threads/{thread_id}/vote", response_model=VoteResult)
def vote_thread(thread_id: UUID, user: ActiveUser, db: DB) -> VoteResult:
    """Upvote (idempotent). Errors: post_unavailable (409) for deleted and hidden threads."""
    result = forum.vote(db, user, forum.thread_for(db, thread_id, user), up=True)
    db.commit()
    return result


@router.delete("/forum/threads/{thread_id}/vote", response_model=VoteResult)
def unvote_thread(thread_id: UUID, user: ActiveUser, db: DB) -> VoteResult:
    result = forum.vote(db, user, forum.thread_for(db, thread_id, user), up=False)
    db.commit()
    return result


@router.post("/forum/threads/{thread_id}/accept", response_model=ThreadDetail)
def accept_answer(thread_id: UUID, body: AcceptRequest, request: Request, user: ActiveUser, db: DB) -> ThreadDetail:
    """The thread's author (or a moderator) marks a reply as the answer, or clears it. The answer is a visible,
    top-level reply by someone other than the thread's author. Notifies the reply's author."""
    t = forum.thread_for(db, thread_id, user)
    forum.accept_answer(db, user, t, body.reply_id, client_ip(request))
    db.commit()
    return forum.thread_detail(db, t, user)


@router.post("/forum/threads/{thread_id}/moderate", response_model=ThreadDetail)
def moderate_thread(thread_id: UUID, body: ThreadModeration, request: Request, user: Moderator, db: DB) -> ThreadDetail:
    """Pin, lock (no new replies) or hide a thread. Audited."""
    t = forum.thread_for(db, thread_id, user)
    forum.moderate_thread(db, user, t, body, client_ip(request))
    db.commit()
    return forum.thread_detail(db, t, user)


@router.post("/forum/threads/{thread_id}/replies", response_model=Reply, status_code=status.HTTP_201_CREATED)
def create_reply(thread_id: UUID, body: ReplyCreate, user: ActiveUser, db: DB) -> Reply:
    """Notifies the thread's author (and the parent reply's author). Errors: thread_locked (409), rate_limited (429)."""
    t = forum.thread_for(db, thread_id, user)
    r = forum.create_reply(db, user, t, body)
    db.commit()
    return forum.reply_out(db, r, t, user)


@router.patch("/forum/replies/{reply_id}", response_model=Reply)
def update_reply(reply_id: UUID, body: ReplyUpdate, request: Request, user: ActiveUser, db: DB) -> Reply:
    r, t = forum.reply_for(db, reply_id, user)
    forum.update_reply(db, user, r, t, body.body, client_ip(request))
    db.commit()
    return forum.reply_out(db, r, t, user)


@router.delete("/forum/replies/{reply_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reply(reply_id: UUID, request: Request, user: CurrentUser, db: DB) -> Response:
    """The author (or a moderator) deletes a reply: it keeps its place without its text."""
    r, t = forum.reply_for(db, reply_id, user)
    forum.delete_reply(db, user, r, t, client_ip(request))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/forum/replies/{reply_id}/vote", response_model=VoteResult)
def vote_reply(reply_id: UUID, user: ActiveUser, db: DB) -> VoteResult:
    r, t = forum.reply_for(db, reply_id, user)
    result = forum.vote(db, user, r, up=True, thread=t)
    db.commit()
    return result


@router.delete("/forum/replies/{reply_id}/vote", response_model=VoteResult)
def unvote_reply(reply_id: UUID, user: ActiveUser, db: DB) -> VoteResult:
    r, t = forum.reply_for(db, reply_id, user)
    result = forum.vote(db, user, r, up=False, thread=t)
    db.commit()
    return result


@router.post("/forum/replies/{reply_id}/moderate", response_model=Reply)
def moderate_reply(reply_id: UUID, body: ReplyModeration, request: Request, user: Moderator, db: DB) -> Reply:
    """Hide a reply, or show it again. Audited."""
    r, t = forum.reply_for(db, reply_id, user)
    forum.moderate_reply(db, user, r, t, body.status, client_ip(request))
    db.commit()
    return forum.reply_out(db, r, t, user)
