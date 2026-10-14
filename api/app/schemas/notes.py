"""A student's private notes (R-5)."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import Field, field_validator

from app.schemas.common import ApiModel, Page
from app.schemas.modules import LessonId

TITLE_MAX = 200
BODY_MAX = 100_000  # characters: a long lecture's worth of notes
EXCERPT_LENGTH = 240


class NoteFields(ApiModel):
    """What a student writes. A note may be about a module, or about one of its lessons (then `moduleId` is the
    lesson's module)."""

    title: str = Field(default="", max_length=TITLE_MAX)
    body: str = Field(default="", max_length=BODY_MAX)  # Markdown
    module_id: str | None = Field(default=None, max_length=64)
    lesson_id: LessonId | None = None

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
    lesson_id: str | None
    version: int
    created_at: datetime
    updated_at: datetime


class Note(NoteSummary):
    body: str


class NotePage(Page[NoteSummary]):
    pass
