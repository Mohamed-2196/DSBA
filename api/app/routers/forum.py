"""The forum. Owner: community agent. Rules and queries live in the app/services/forum/ package."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Query, Request, Response, status

from app.core.access import Box, Feature
from app.core.errors import unauthenticated
from app.core.pagination import Limit, Offset, YearParam
from app.core.security import DB, ActiveUser, CurrentUser, OptionalUser, client_ip, needs_feature, requires
from app.models import User
from app.routers._base import router_for
from app.schemas.forum import (
    AcceptRequest,
    Category,
    FollowRequest,
    FollowResult,
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
from app.services.forum import follows, queries, replies, taxonomy, threads, views, visibility, votes

router = router_for("forum", needs_feature(Feature.forum))
Poster = Annotated[User, requires(Box.forum_post)]  # start threads, reply, vote
ForumModerator = Annotated[User, requires(Box.forum_moderate)]


@router.get("/forum/meta", response_model=ForumMeta)
def meta() -> ForumMeta:
    """Categories and tags (the server validates threads against these)."""
    return taxonomy.forum_meta()


@router.get("/forum/stats", response_model=ForumStats)
def stats(db: DB) -> ForumStats:
    """Counts for the tabs and chips, replies since midnight (Bahrain) and the week's top contributors."""
    return queries.forum_stats(db)


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
    filters = queries.ThreadFilters(
        q=q,
        category=category,
        module_id=module_id,
        tag=tag,
        year=year,
        unanswered=unanswered,
        author_id=user.id if mine and user is not None else None,
    )
    return queries.list_threads(db, user, filters, sort, limit, offset)


@router.get("/forum/threads/hot", response_model=list[ThreadSummary])
def hot_threads(
    db: DB, user: OptionalUser, limit: int = Query(default=5, ge=1, le=20), year: YearParam | None = None
) -> list[ThreadSummary]:
    """The hottest threads (pinned ones excluded), for Home and the newsletter."""
    return queries.hot_threads(db, user, limit, year)


@router.post("/forum/threads", response_model=ThreadDetail, status_code=status.HTTP_201_CREATED)
def create_thread(body: ThreadCreate, request: Request, user: Poster, db: DB) -> ThreadDetail:
    """The author upvotes their own thread. Forum images in the body (/api/v1/media/<id>) are attached.

    `anonymous` (needs forum.anonymous): students see "A Year N student" in place of the author, everywhere the
    thread shows, and in its notifications. The author and those who moderate the forum (forum.moderate) still see
    who it is, and the audit log records it (forum.thread.anonymous). Reports and rate limits apply as usual.
    `seniorId` (needs career.seniors): a listed senior asked from Career Navigator; they are notified.

    Errors: rate_limited (429) after 10 threads in an hour; feature_off (404) for `anonymous` or `seniorId` while
    their feature is off; invalid_input (422: the senior isn't taking questions)."""
    t = threads.create_thread(db, user, body, client_ip(request))
    db.commit()
    return views.thread_detail(db, t, user)


@router.get("/forum/threads/{slug}", response_model=ThreadDetail)
def get_thread(slug: str, db: DB, user: OptionalUser) -> ThreadDetail:
    """By slug. Replies oldest first.

    Hidden threads and replies are for moderators and for their own author: the author gets them with status
    'hidden' and canModerate false (show them a "hidden by a student rep" banner) and can't change them (canEdit
    false). Everyone else: 404 for a hidden thread; a hidden reply is left out of `replies`."""
    return views.thread_detail(db, visibility.thread_by_slug(db, slug, user), user)


@router.patch("/forum/threads/{thread_id}", response_model=ThreadDetail)
def update_thread(thread_id: UUID, body: ThreadUpdate, request: Request, user: ActiveUser, db: DB) -> ThreadDetail:
    """The author (or a moderator) edits the thread; edited_at is set. The slug never changes."""
    t = visibility.thread_for(db, thread_id, user)
    threads.update_thread(db, user, t, body, client_ip(request))
    db.commit()
    return views.thread_detail(db, t, user)


@router.delete("/forum/threads/{thread_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_thread(thread_id: UUID, request: Request, user: CurrentUser, db: DB) -> Response:
    """The author (or a moderator) deletes the thread: its text goes; its title and replies stay listed while it has
    replies. A hidden thread stays hidden (only reps reach it) and unhiding it later gives a deleted thread."""
    threads.delete_thread(db, user, thread_id, client_ip(request))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/forum/threads/{thread_id}/related", response_model=list[ThreadSummary])
def related_threads(
    thread_id: UUID, db: DB, user: OptionalUser, limit: int = Query(default=4, ge=1, le=10)
) -> list[ThreadSummary]:
    """Same module first, then shared tags and category. Works on any thread the viewer can open."""
    return queries.related_threads(db, user, visibility.thread_to_read(db, thread_id, user), limit)


@router.put(
    "/forum/threads/{thread_id}/follow", response_model=FollowResult, dependencies=[needs_feature(Feature.forum_follow)]
)
def follow_thread(thread_id: UUID, body: FollowRequest, user: ActiveUser, db: DB) -> FollowResult:
    """Follow a thread: 'answers' (an accepted answer), 'replies' (every reply too) or 'off'. Voting for a thread or
    replying in it starts at 'answers', unless you switched it off. The thread's author follows it already."""
    t = visibility.thread_for(db, thread_id, user)
    level = follows.set_level(db, user, t, body.level)
    db.commit()
    return FollowResult(following=level)


@router.put("/forum/threads/{thread_id}/vote", response_model=VoteResult)
def vote_thread(thread_id: UUID, user: Poster, db: DB) -> VoteResult:
    """Upvote (idempotent). Errors: post_unavailable (409) for deleted and hidden threads."""
    result = votes.vote(db, user, visibility.thread_for(db, thread_id, user), up=True)
    db.commit()
    return result


@router.delete("/forum/threads/{thread_id}/vote", response_model=VoteResult)
def unvote_thread(thread_id: UUID, user: Poster, db: DB) -> VoteResult:
    result = votes.vote(db, user, visibility.thread_for(db, thread_id, user), up=False)
    db.commit()
    return result


@router.post("/forum/threads/{thread_id}/accept", response_model=ThreadDetail)
def accept_answer(thread_id: UUID, body: AcceptRequest, request: Request, user: ActiveUser, db: DB) -> ThreadDetail:
    """The thread's author (or a moderator) marks a reply as the answer, or clears it. The answer is a visible,
    top-level reply by someone other than the thread's author. Notifies the reply's author."""
    t = visibility.thread_for(db, thread_id, user)
    threads.accept_answer(db, user, t, body.reply_id, client_ip(request))
    db.commit()
    return views.thread_detail(db, t, user)


@router.post("/forum/threads/{thread_id}/moderate", response_model=ThreadDetail)
def moderate_thread(
    thread_id: UUID, body: ThreadModeration, request: Request, user: ForumModerator, db: DB
) -> ThreadDetail:
    """Pin, lock (no new replies) or hide a thread. Hiding tells the author (a "system" notification, with `reason`
    when given); unhiding a thread that was deleted while hidden gives a deleted thread. Audited."""
    t = visibility.thread_for(db, thread_id, user)
    threads.moderate_thread(db, user, t, body, client_ip(request))
    db.commit()
    return views.thread_detail(db, t, user)


@router.post("/forum/threads/{thread_id}/replies", response_model=Reply, status_code=status.HTTP_201_CREATED)
def create_reply(thread_id: UUID, body: ReplyCreate, user: Poster, db: DB) -> Reply:
    """Notifies the thread's author (and the parent reply's author), linking to /forum/<slug>#reply-<id>.

    Errors: thread_locked (409: locked by a student rep), post_unavailable (409: the thread was deleted or hidden),
    rate_limited (429)."""
    t = visibility.thread_for(db, thread_id, user)
    r = replies.create_reply(db, user, t, body)
    db.commit()
    return views.reply_out(db, r, t, user)


@router.patch("/forum/replies/{reply_id}", response_model=Reply)
def update_reply(reply_id: UUID, body: ReplyUpdate, request: Request, user: ActiveUser, db: DB) -> Reply:
    r, t = visibility.reply_for(db, reply_id, user)
    replies.update_reply(db, user, r, t, body.body, client_ip(request))
    db.commit()
    return views.reply_out(db, r, t, user)


@router.delete("/forum/replies/{reply_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_reply(reply_id: UUID, request: Request, user: CurrentUser, db: DB) -> Response:
    """The author (or a moderator) deletes a reply: it keeps its place without its text, and the notifications about
    it are taken back. A hidden reply stays hidden (only reps reach it)."""
    r, t = visibility.reply_for(db, reply_id, user)
    replies.delete_reply(db, user, r, t, client_ip(request))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/forum/replies/{reply_id}/vote", response_model=VoteResult)
def vote_reply(reply_id: UUID, user: Poster, db: DB) -> VoteResult:
    r, t = visibility.reply_for(db, reply_id, user)
    result = votes.vote(db, user, r, up=True, thread=t)
    db.commit()
    return result


@router.delete("/forum/replies/{reply_id}/vote", response_model=VoteResult)
def unvote_reply(reply_id: UUID, user: Poster, db: DB) -> VoteResult:
    r, t = visibility.reply_for(db, reply_id, user)
    result = votes.vote(db, user, r, up=False, thread=t)
    db.commit()
    return result


@router.post("/forum/replies/{reply_id}/moderate", response_model=Reply)
def moderate_reply(reply_id: UUID, body: ReplyModeration, request: Request, user: ForumModerator, db: DB) -> Reply:
    """Hide a reply (its author is told, with `reason` when given; the notifications about it are taken back), or
    show it again (a reply deleted while hidden comes back deleted). Audited."""
    r, t = visibility.reply_for(db, reply_id, user)
    replies.moderate_reply(db, user, r, t, body.status, client_ip(request), body.reason)
    db.commit()
    return views.reply_out(db, r, t, user)
