"""Requests from students: what they ask the reps for, the me-toos, and the reps' answers."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import StringConstraints

from app.schemas.common import ApiModel, Page, UserPublic

RequestKind = Literal["paper", "fix", "event", "feature", "other"]  # a past paper or notes, a fix, a date, ...
RequestStatus = Literal["open", "planned", "done", "declined"]
RequestSort = Literal["me_too", "newest"]

RequestTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=140)]
RequestDetails = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
RequestReply = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]


class RequestCreate(ApiModel):
    kind: RequestKind
    title: RequestTitle
    details: RequestDetails = ""
    module_id: str | None = None


class RequestAnswer(ApiModel):
    """A status and the public reply that goes with it. Declining needs a reply: the reason."""

    status: RequestStatus
    reply: RequestReply | None = None


class RequestOut(ApiModel):
    id: UUID
    kind: RequestKind
    title: str
    details: str  # plain text: line breaks kept, no markdown
    module_id: str | None
    module_title: str | None
    status: RequestStatus
    author: UserPublic | None  # None once the account is deleted
    mine: bool  # the viewer asked for it
    me_too: bool  # the viewer said "me too"
    me_too_count: int  # how many others want it too (the requester not counted)
    reply: str | None  # the reps' public answer
    answered_by: UserPublic | None
    answered_at: datetime | None
    created_at: datetime


class RequestPage(Page[RequestOut]):
    pass


class SimilarRequest(ApiModel):
    id: UUID
    title: str
    kind: RequestKind
    status: RequestStatus
    me_too_count: int
