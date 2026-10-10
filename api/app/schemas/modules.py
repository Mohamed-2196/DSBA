from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import Field

from app.schemas.common import ApiModel, Year


class Video(ApiModel):
    kind: Literal["youtube", "youtube-playlist", "bbb"]
    id: str | None = None  # YouTube video or playlist id
    url: str | None = None  # BigBlueButton recording
    title: str | None = None
    channel: str | None = None  # the YouTube channel
    unavailable: bool = False  # removed from YouTube: kept so lesson keys (positions) stay stable


class Chapter(ApiModel):
    title: str
    audio_url: str | None = None
    videos: list[Video]


class ModuleResources(ApiModel):
    materials: str | None = None
    exercises: str | None = None
    exercises_note: str | None = None
    vle: str | None = None
    older_exams: str | None = None
    cheat_sheet: str | None = None


class ModuleSummary(ApiModel):
    id: str
    unit_code: str | None
    name: str
    short_name: str
    year: Year
    description: str
    icon: str | None
    chapter_count: int
    lesson_count: int
    library_count: int  # published library items for this module


class ModuleDetail(ModuleSummary):
    resources: ModuleResources
    chapters: list[Chapter]


class LastLesson(ApiModel):
    chapter: int
    video: int
    at: datetime


class Progress(ApiModel):
    """lesson key = '<module id>:<chapter index>:<video index>'."""

    watched: dict[str, datetime]
    last: dict[str, LastLesson]  # by module id


class LessonWatchedUpdate(ApiModel):
    watched: bool


class ResumeUpdate(ApiModel):
    module_id: str
    chapter: int
    video: int


class ProgressImport(ApiModel):
    """Progress kept in the browser before signing in, merged into the account once (newest wins). At most 5000
    watched lessons and 100 modules (security review, finding 19)."""

    watched: dict[str, datetime] = Field(max_length=5000)
    last: dict[str, LastLesson] = Field(max_length=100)
