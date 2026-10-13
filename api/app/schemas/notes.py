"""A student's private notes (R-5)."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import Field, field_validator

from app.schemas.common import ApiModel, Page

TITLE_MAX = 200
BODY_MAX = 100_000  # characters: a long lecture's worth of notes
EXCERPT_LENGTH = 240


class NoteFields(ApiModel):
    """What a student writes. A note may be about a module, or about one of its lessons (a chapter and a video,
    numbered as in lesson keys)."""

    title: str = Field(default="", max_length=TITLE_MAX)
    body: str = Field(default="", max_length=BODY_MAX)  # Markdown
    module_id: str | None = Field(default=None, max_length=64)
    chapter: int | None = Field(default=None, ge=0, le=999)
    video: int | None = Field(default=None, ge=0, le=999)

    @field_validator("title")
    @classmethod
    def _one_line(cls, v: str) -> str:
        return " ".join(v.split())


class NoteCreate(NoteFields):
    pass


class NoteUpdate(NoteFields):
    """The whole note as it is now, and the version it was loaded at."""

    version: int = Field(ge=1)


class NoteSummary(ApiModel):
    id: UUID
    title: str
    excerpt: str  # the start of the body
    module_id: str | None
    chapter: int | None
    video: int | None
    version: int
    created_at: datetime
    updated_at: datetime


class Note(NoteSummary):
    body: str


class NotePage(Page[NoteSummary]):
    pass
