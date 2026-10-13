from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal

from pydantic import Field, StringConstraints

from app.schemas.common import ApiModel, Year


class Video(ApiModel):
    kind: Literal["youtube", "youtube-playlist", "bbb"]
    id: str | None = None  # YouTube video or playlist id
    url: str | None = None  # BigBlueButton recording
    title: str | None = None
    channel: str | None = None  # the YouTube channel
    unavailable: bool = False  # removed from YouTube


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
    library_count: int | None  # published library items for this module; None while the library is off for you


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


# ── editing (content managers, R-9) ─────────────────────────────────────────────────────────

ModuleIconName = Literal[
    "BookOpenText",
    "Brain",
    "Briefcase",
    "ChartBar",
    "ChartLineUp",
    "ChartScatter",
    "Coins",
    "Database",
    "Function",
    "ListChecks",
    "Megaphone",
    "PresentationChart",
    "Scales",
    "Sigma",
    "Storefront",
    "TerminalWindow",
    "WaveSine",
]
ModuleSlug = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", min_length=2, max_length=64)]
UnitCode = Annotated[str, StringConstraints(strip_whitespace=True, to_upper=True, pattern=r"^[A-Za-z]{2}[0-9]{4}$")]
Link = Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
Optional200 = Annotated[str, StringConstraints(strip_whitespace=True, max_length=200)]


class ResourcesIn(ApiModel):
    """The module's shared folders: https:// links (empty or null for none)."""

    materials: Link | None = None
    exercises: Link | None = None
    exercises_note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)] | None = None
    vle: Link | None = None
    older_exams: Link | None = None
    cheat_sheet: Link | None = None


class ModuleFields(ApiModel):
    unit_code: UnitCode | None = None  # 'ST2133'; unique
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=120)]
    short_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=60)]
    year: Year
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=4000)] = ""  # Markdown
    icon: ModuleIconName | None = None
    resources: ResourcesIn = Field(default_factory=ResourcesIn)


class ModuleCreate(ModuleFields):
    """A new module, empty: its chapters come next, in the editor. `id` is its address (/modules/<id>), for good."""

    id: ModuleSlug


class LessonOrigin(ApiModel):
    """Where a lesson was in the version loaded: its chapter and video index as stored (ModuleEdit's order)."""

    chapter: int = Field(ge=0, le=999)
    video: int = Field(ge=0, le=999)


class LessonIn(ApiModel):
    """A video lesson: a YouTube video or playlist link, or a class recording on vc.bibf.com."""

    url: Link
    title: Optional200 | None = None
    channel: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] | None = None
    hidden: bool = False
    origin: LessonOrigin | None = None  # None: a new lesson


class ChapterIn(ApiModel):
    title: Title
    hidden: bool = False
    origin: int | None = Field(default=None, ge=0, le=999)  # its index in the version loaded; None: a new chapter
    lessons: list[LessonIn] = Field(default_factory=list, max_length=200)


class ModuleSave(ModuleFields):
    """The whole module as the editor has it. `version` is the one loaded: if someone saved since, 409
    module_changed. Lessons and chapters keep their `origin`, so what refers to them (progress, notes, study-board
    cards) follows them when they move."""

    version: int
    hidden: bool = False
    chapters: list[ChapterIn] = Field(default_factory=list, max_length=60)


class LessonOut(LessonIn):
    kind: Literal["youtube", "youtube-playlist", "bbb"]
    origin: LessonOrigin  # = where it is now: send it back as it is


class ChapterOut(ApiModel):
    title: str
    hidden: bool
    origin: int  # = where it is now: send it back as it is
    lessons: list[LessonOut]


class ModuleEditSummary(ApiModel):
    id: str
    unit_code: str | None
    name: str
    short_name: str
    year: Year
    icon: str | None
    hidden: bool
    position: int
    version: int
    chapter_count: int  # hidden ones too
    lesson_count: int
    updated_at: datetime | None


class ModuleEdit(ModuleEditSummary):
    description: str
    resources: ModuleResources
    chapters: list[ChapterOut]


class ModuleOrder(ApiModel):
    """One year's modules, in their new order: every module of that year, once each."""

    year: Year
    ids: list[str] = Field(max_length=100)
