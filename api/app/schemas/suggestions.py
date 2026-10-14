"""Suggested videos (IDEA-15): a student suggests a video for a module's chapter, and content managers accept it
(it becomes a lesson) or decline it with a reason."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import StringConstraints

from app.schemas.common import ApiModel, Page, UserPublic
from app.schemas.modules import ChapterId, Link, Title, VideoKind

SuggestionStatus = Literal["pending", "accepted", "declined"]
SuggestionTitle = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=200)]
SuggestionReason = Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)]
SuggestionReply = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]


class SuggestionCreate(ApiModel):
    """A YouTube video or playlist link, or a class recording on vc.bibf.com: the links the module editor takes.
    `chapter_id` None leaves the chapter to the editor."""

    module_id: str
    chapter_id: ChapterId | None = None
    url: Link
    title: SuggestionTitle
    reason: SuggestionReason = ""


class SuggestionAccept(ApiModel):
    """Where the new lesson goes: `chapter_id` (default: the one suggested), or a new chapter at the end of the module
    named `new_chapter`. `title` replaces the suggested title."""

    chapter_id: ChapterId | None = None
    new_chapter: Title | None = None
    title: SuggestionTitle | None = None


class SuggestionDecline(ApiModel):
    """The reason, which the student sees."""

    reply: Annotated[SuggestionReply, StringConstraints(min_length=1)]


class SuggestionOut(ApiModel):
    id: UUID
    module_id: str
    module_title: str
    chapter_id: str | None
    chapter_title: str | None
    kind: VideoKind
    url: str  # the video's link
    title: str
    reason: str
    status: SuggestionStatus
    reply: str | None  # why it was declined
    lesson_id: str | None  # the lesson it became
    author: UserPublic | None  # None once the account is deleted
    decided_by: UserPublic | None
    decided_at: datetime | None
    created_at: datetime


class SuggestionPage(Page[SuggestionOut]):
    pass
