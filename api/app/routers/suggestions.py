"""Suggested videos (IDEA-15): students suggest videos for a module's chapters; people with content.edit accept or
decline them. The rules live in app/services/suggestions.py."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Query, Request, status

from app.core.access import Box, Feature
from app.core.pagination import Limit, Offset
from app.core.security import DB, ActiveUser, client_ip, needs_feature, requires
from app.models import User
from app.routers._base import router_for
from app.schemas.suggestions import (
    SuggestionAccept,
    SuggestionCreate,
    SuggestionDecline,
    SuggestionOut,
    SuggestionPage,
    SuggestionStatus,
)
from app.services import suggestions as svc

router = router_for("suggestions", needs_feature(Feature.video_suggestions))
Editor = Annotated[User, requires(Box.content_edit)]


@router.post("/video-suggestions", response_model=SuggestionOut, status_code=status.HTTP_201_CREATED)
def suggest_video(body: SuggestionCreate, user: ActiveUser, db: DB) -> SuggestionOut:
    """Suggest a video for a module's chapter (`chapterId` null: the editor picks one). The link must be a YouTube
    video or playlist, or a class recording on vc.bibf.com.

    Errors: invalid_input (422: an unknown or hidden module or chapter, a link the app can't embed),
    already_a_lesson (409), already_suggested (409: it waits for review), rate_limited (429: five a day)."""
    s = svc.create(db, user, body)
    db.commit()
    return svc.suggestion_out(db, s)


@router.get("/video-suggestions/mine", response_model=list[SuggestionOut])
def my_suggestions(
    user: ActiveUser, db: DB, module_id: Annotated[str | None, Query(alias="moduleId")] = None
) -> list[SuggestionOut]:
    """Your suggestions, newest first (the latest 50), for one module or all of them."""
    return svc.mine(db, user, module_id)


@router.get("/content/video-suggestions", response_model=SuggestionPage)
def suggestions_queue(
    _: Editor,
    db: DB,
    status_: Annotated[SuggestionStatus, Query(alias="status")] = "pending",
    limit: Limit = 20,
    offset: Offset = 0,
) -> SuggestionPage:
    """The review queue: pending suggestions oldest first, decided ones the latest decision first."""
    return svc.queue(db, status_, limit, offset)


@router.post("/content/video-suggestions/{suggestion_id}/accept", response_model=SuggestionOut)
def accept_suggestion(
    suggestion_id: UUID, body: SuggestionAccept, request: Request, user: Editor, db: DB
) -> SuggestionOut:
    """Add the video as a lesson at the end of a chapter: the suggested one, `chapterId`, or a new chapter named
    `newChapter`. The module's version moves on. Tells the student. Audited (`suggestion.accept`).

    Errors: not_found (404), suggestion_closed (409), already_a_lesson (409), invalid_input (422: no chapter)."""
    s = svc.get_suggestion(db, suggestion_id, lock=True)
    svc.accept(db, user, s, body, client_ip(request))
    db.commit()
    return svc.suggestion_out(db, s)


@router.post("/content/video-suggestions/{suggestion_id}/decline", response_model=SuggestionOut)
def decline_suggestion(
    suggestion_id: UUID, body: SuggestionDecline, request: Request, user: Editor, db: DB
) -> SuggestionOut:
    """Decline with a reason the student sees. Tells the student. Audited (`suggestion.decline`).

    Errors: not_found (404), suggestion_closed (409), invalid_input (422: no reason)."""
    s = svc.get_suggestion(db, suggestion_id, lock=True)
    svc.decline(db, user, s, body, client_ip(request))
    db.commit()
    return svc.suggestion_out(db, s)
