"""What's missing, for the people who fill it (IDEA-39): Manage's Gaps screen. Each part is there for people who hold
its box while its feature is on for them, and None otherwise."""

from __future__ import annotations

import datetime as dt
from typing import Literal
from uuid import UUID

from app.schemas.common import ApiModel
from app.schemas.library import ExamSession, LibraryKind
from app.schemas.requests import RequestKind, RequestStatus


class GapModule(ApiModel):
    id: str
    name: str
    unit_code: str | None
    year: int


class SittingGap(ApiModel):
    """A sitting of a module with a past paper and no examiners' report, or the other way round."""

    module: GapModule
    exam_year: int
    session: ExamSession | None
    missing: Literal["paper", "report"]


class ScanGap(ApiModel):
    """A published paper, report or solutions file the text reader found no words in (a scan), or couldn't read:
    search finds it by its title only, and Mini Noora can't read it."""

    id: UUID
    slug: str
    title: str
    kind: LibraryKind
    module: GapModule | None
    text: Literal["empty", "failed"]


class LibraryGaps(ApiModel):
    sittings: list[SittingGap]  # the newest sittings first
    scans: list[ScanGap]
    no_cheat_sheet: list[GapModule]  # modules with no published cheat sheet


class LessonGap(ApiModel):
    """A module with no lessons, or with chapters that have none, or with videos gone from YouTube."""

    module: GapModule
    chapters: int
    empty_chapters: int
    lessons: int
    unavailable: int  # videos removed from YouTube


class EventGap(ApiModel):
    id: str
    title: str
    date: dt.date
    module_id: str | None
    sample: bool  # the date is not confirmed
    no_time: bool
    no_place: bool


class CalendarGaps(ApiModel):
    unconfirmed: list[EventGap]  # dates still "Not confirmed" in the next 30 days
    exam_details: list[EventGap]  # confirmed exams in the next 90 days without a time or a place


class RequestGap(ApiModel):
    id: UUID
    title: str
    kind: RequestKind
    status: RequestStatus
    me_too_count: int
    module_title: str | None


class Gaps(ApiModel):
    library: LibraryGaps | None  # library.manage
    lessons: list[LessonGap] | None  # content.edit
    calendar: CalendarGaps | None  # calendar.manage
    requests: list[RequestGap] | None  # requests.manage: the open requests most wanted
