"""Time stamps in recordings: students suggest what a lesson's video covers at a time; people with content.edit
accept or decline them. Accepted ones come with the module (GET /modules/{id}: each lesson's `topics`). The rules
live in app/services/lesson_topics.py."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Query, Request, Response, status

from app.core.access import Box, Feature
from app.core.pagination import Limit, Offset
from app.core.security import DB, ActiveUser, client_ip, needs_feature, requires
from app.models import User
from app.routers._base import router_for
from app.schemas.modules import LessonId
from app.schemas.suggestions import (
    SuggestionDecline,
    SuggestionStatus,
    TopicAccept,
    TopicCreate,
    TopicOut,
    TopicPage,
)
from app.services import lesson_topics as svc

router = router_for("lesson-topics", needs_feature(Feature.modules_time_stamps))
Editor = Annotated[User, requires(Box.content_edit)]


@router.post("/lesson-topics", response_model=TopicOut, status_code=status.HTTP_201_CREATED)
def suggest_topic(body: TopicCreate, user: ActiveUser, db: DB) -> TopicOut:
    """Suggest what a lesson's video covers at a time (`seconds` from its start). It shows beside the player once a
    content manager accepts it.

    Errors: invalid_input (422: a lesson students can't see, a playlist, no words), already_suggested (409: a time
    stamp within ten seconds of it waits or is shown), rate_limited (429: twenty a day)."""
    t = svc.create(db, user, body)
    db.commit()
    return svc.topic_out(db, t)


@router.get("/lesson-topics/mine", response_model=list[TopicOut])
def my_topics(
    user: ActiveUser, db: DB, lesson_id: Annotated[LessonId | None, Query(alias="lessonId")] = None
) -> list[TopicOut]:
    """Your time stamps, newest first (the latest 50), for one lesson or all of them."""
    return svc.mine(db, user, lesson_id)


@router.get("/content/lesson-topics", response_model=TopicPage)
def topics_queue(
    _: Editor,
    db: DB,
    status_: Annotated[SuggestionStatus, Query(alias="status")] = "pending",
    limit: Limit = 20,
    offset: Offset = 0,
) -> TopicPage:
    """The review queue: waiting time stamps oldest first, decided ones the latest decision first."""
    return svc.queue(db, status_, limit, offset)


@router.post("/content/lesson-topics/{topic_id}/accept", response_model=TopicOut)
def accept_topic(topic_id: UUID, body: TopicAccept, request: Request, user: Editor, db: DB) -> TopicOut:
    """Show it beside the player, with the time (`seconds`) or the words (`label`) put right if need be. Tells the
    student. Audited (`topic.accept`).

    Errors: not_found (404), suggestion_closed (409), already_suggested (409: the video shows a time stamp within ten
    seconds), too_many_topics (409), invalid_input (422)."""
    t = svc.get_topic(db, topic_id, lock=True)
    svc.accept(db, user, t, body, client_ip(request))
    db.commit()
    return svc.topic_out(db, t)


@router.post("/content/lesson-topics/{topic_id}/decline", response_model=TopicOut)
def decline_topic(topic_id: UUID, body: SuggestionDecline, request: Request, user: Editor, db: DB) -> TopicOut:
    """Decline with a reason the student sees. Tells the student. Audited (`topic.decline`).

    Errors: not_found (404), suggestion_closed (409), invalid_input (422: no reason)."""
    t = svc.get_topic(db, topic_id, lock=True)
    svc.decline(db, user, t, body, client_ip(request))
    db.commit()
    return svc.topic_out(db, t)


@router.delete("/content/lesson-topics/{topic_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_topic(topic_id: UUID, request: Request, user: Editor, db: DB) -> Response:
    """Take a time stamp off the video. Audited (`topic.remove`).

    Errors: not_found (404), suggestion_closed (409: it isn't shown)."""
    t = svc.get_topic(db, topic_id, lock=True)
    svc.remove(db, user, t, client_ip(request))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
