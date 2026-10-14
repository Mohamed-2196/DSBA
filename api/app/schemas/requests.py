"""Requests from students: what they ask the reps for, the me-toos, and the reps' answers."""

from __future__ import annotations

import datetime as dt
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, StringConstraints

from app.schemas.common import ApiModel, Page, UserPublic
from app.schemas.library import EXAM_YEAR_MAX, EXAM_YEAR_MIN, LibraryKind

RequestKind = Literal["paper", "fix", "event", "feature", "other"]  # a past paper or notes, a fix, a date, ...
RequestStatus = Literal["open", "planned", "done", "declined"]
RequestSort = Literal["me_too", "newest"]

RequestTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=140)]
RequestDetails = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
RequestReply = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]


class RequestCreate(ApiModel):
    """A paper request may say what it wants (`wanted_kind` with `module_id`, maybe `exam_year` and `zone`), so a
    published file can match it; a date request may name the unconfirmed event it asks about (`event_id`)."""

    kind: RequestKind
    title: RequestTitle
    details: RequestDetails = ""
    module_id: str | None = None
    wanted_kind: LibraryKind | None = None
    exam_year: int | None = Field(default=None, ge=EXAM_YEAR_MIN, le=EXAM_YEAR_MAX)
    zone: Literal["A", "B"] | None = None
    event_id: Annotated[str, StringConstraints(max_length=120)] | None = None


class RequestAnswer(ApiModel):
    """A status and the public reply that goes with it. Declining needs a reply: the reason."""

    status: RequestStatus
    reply: RequestReply | None = None


class FoundItem(ApiModel):
    """A published library file that may be what a request asked for."""

    id: UUID
    slug: str  # its page: /library/<slug>
    title: str
    kind: LibraryKind
    exam_year: int | None
    zone: str | None


class RequestEvent(ApiModel):
    """The date a date request asks about."""

    id: str
    title: str
    date: dt.date
    sample: bool  # not confirmed yet


class FoundAnswer(ApiModel):
    """The requester's or a rep's word on the file found for a request: yes closes it as done, no keeps it open."""

    confirm: bool


class RequestOut(ApiModel):
    id: UUID
    kind: RequestKind
    title: str
    details: str  # plain text: line breaks kept, no markdown
    module_id: str | None
    module_title: str | None
    wanted_kind: LibraryKind | None
    exam_year: int | None
    zone: str | None
    event: RequestEvent | None  # None too once the event is deleted
    # The file found for it: waiting for a yes or no while the request is open or planned, the answer once it's done.
    # None when there is none, or once the file is no longer in the library.
    found: FoundItem | None
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
