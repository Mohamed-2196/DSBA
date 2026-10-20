from __future__ import annotations

import re
import unicodedata
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import AfterValidator, Field, StringConstraints, field_validator
from pydantic_core import PydanticCustomError

from app.schemas.common import ApiModel, Year
from app.schemas.links import PictureSrc

VideoKind = Literal["youtube", "youtube-playlist", "bbb"]
LessonId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]{1,16}$")]  # app/services/modules.py new_id()
ChapterId = LessonId
# A study-guide topic's id, unique within its chapter: its title lower case, each run of other characters a hyphen, cut
# to 48 characters, with '-2', '-3' after a title the chapter already has (services/chapter_outlines.py topic_id()).
TOPIC_ID_MAX = 52
StudyTopicId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=TOPIC_ID_MAX)]


class StudyTopic(ApiModel):
    """A topic of a chapter, as its module's study guide lists it."""

    id: str
    title: str


class LessonTopic(ApiModel):
    """A time in a lesson's video and what it covers ("41:20 MLE of a uniform"): suggested by a student, accepted by
    a content manager."""

    id: UUID
    seconds: int
    label: str


class Video(ApiModel):
    """A lesson: one video of a chapter. `id` is the lesson's own, for good: its address is
    /modules/<module id>/lessons/<id>. `topics`: what its video covers, by time, in order."""

    id: str
    kind: VideoKind
    video_id: str | None = None  # YouTube video or playlist id
    url: str | None = None  # BigBlueButton recording
    title: str | None = None
    channel: str | None = None  # the YouTube channel
    unavailable: bool = False  # removed from YouTube
    topics: list[LessonTopic] = []


class Chapter(ApiModel):
    id: str
    title: str
    audio_url: str | None = None
    videos: list[Video]
    topics: list[StudyTopic] = []  # the study guide's, in its order: past questions are grouped by them


ShelfKind = Literal["course-materials", "exercises", "past-paper", "vle-materials", "cheat-sheet", "notes", "other"]


class ModuleShelf(ApiModel):
    """A kind of file the module has in the library (services/library.py SHELVES: 'past-paper' counts the papers,
    examiners' reports and solutions together). `files`: the files and links of that kind the library lists.
    `being_added`: the module has a Drive folder of that kind the import hasn't brought in yet."""

    kind: ShelfKind
    files: int
    being_added: bool


class ModuleSummary(ApiModel):
    id: str
    unit_code: str | None
    name: str
    short_name: str
    year: Year
    description: str
    icon: str | None
    art: str | None  # 'modules/module-ec1002.png' (a picture of the web app) or '/api/v1/media/<id>' (uploaded)
    chapter_count: int
    lesson_count: int
    library_count: int | None  # published library items for this module; None while the library is off for you


class ModuleDetail(ModuleSummary):
    shelves: list[ModuleShelf]  # empty while the library is off for you
    chapters: list[Chapter]


class LastLesson(ApiModel):
    lesson_id: LessonId
    at: datetime


class WatchedLesson(ApiModel):
    module_id: str
    at: datetime


class Progress(ApiModel):
    watched: dict[str, WatchedLesson]  # by lesson id
    last: dict[str, LastLesson]  # by module id


class LessonWatchedUpdate(ApiModel):
    watched: bool


class ResumeUpdate(ApiModel):
    lesson_id: LessonId


class ProgressImport(ApiModel):
    """Progress kept in the browser before signing in, merged into the account once (newest wins). `watched` is by
    lesson id and `last` by module id. At most 5000 watched lessons and 100 modules (security review, finding 19)."""

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
WORD_RE = re.compile(r"[^\W_]+")
MAX_KEYWORDS = 12


def _search_words(value: str) -> str:
    """A chapter word as search compares it: its words in lower case without accents, one space apart ('Cramér-Rao'
    → 'cramer rao')."""
    plain = "".join(ch for ch in unicodedata.normalize("NFKD", value.lower()) if not unicodedata.combining(ch))
    words = WORD_RE.findall(plain)
    if not words:
        raise PydanticCustomError("keyword", "A word for search needs a letter or a digit.")
    return " ".join(words)


# Another word students search for a chapter by: 'mle', 'cramer rao', 'fisher information'.
Keyword = Annotated[
    str, StringConstraints(strip_whitespace=True, min_length=1, max_length=40), AfterValidator(_search_words)
]


class ModuleFields(ApiModel):
    unit_code: UnitCode | None = None  # 'ST2133'; unique
    name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=120)]
    short_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=60)]
    year: Year
    description: Annotated[str, StringConstraints(strip_whitespace=True, max_length=4000)] = ""  # Markdown
    icon: ModuleIconName | None = None  # shown while the module has no art
    art: PictureSrc | None = None  # its logo or illustration: a picture of the web app, or a module_art upload


class ModuleCreate(ModuleFields):
    """A new module, empty: its chapters come next, in the editor. `id` is its address (/modules/<id>), for good."""

    id: ModuleSlug


class LessonIn(ApiModel):
    """A video lesson: a YouTube video or playlist link, or a class recording on vc.bibf.com."""

    url: Link
    title: Optional200 | None = None
    channel: Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)] | None = None
    hidden: bool = False
    id: LessonId | None = None  # None: a new lesson


class ChapterIn(ApiModel):
    title: Title
    hidden: bool = False
    id: ChapterId | None = None  # None: a new chapter
    # other words search finds it by: abbreviations, names of results and methods ('mle', 'cramer rao')
    keywords: list[Keyword] = Field(default_factory=list, max_length=MAX_KEYWORDS)
    lessons: list[LessonIn] = Field(default_factory=list, max_length=200)

    @field_validator("keywords")
    @classmethod
    def _once_each(cls, keywords: list[str]) -> list[str]:
        return list(dict.fromkeys(keywords))


class ModuleSave(ModuleFields):
    """The whole module as the editor has it. `version` is the one loaded: if someone saved since, 409
    module_changed. Chapters and lessons keep their `id` (a lesson may move to another chapter of the module); one
    left out is removed."""

    version: int
    hidden: bool = False
    chapters: list[ChapterIn] = Field(default_factory=list, max_length=60)


class LessonOut(LessonIn):
    id: str
    kind: VideoKind


class ChapterOut(ApiModel):
    id: str
    title: str
    hidden: bool
    keywords: list[str]
    lessons: list[LessonOut]


class ModuleEditSummary(ApiModel):
    id: str
    unit_code: str | None
    name: str
    short_name: str
    year: Year
    icon: str | None
    art: str | None
    hidden: bool
    position: int
    version: int
    chapter_count: int  # hidden ones too
    lesson_count: int
    updated_at: datetime | None


class ModuleEdit(ModuleEditSummary):
    description: str
    chapters: list[ChapterOut]


class ModuleOrder(ApiModel):
    """One year's modules, in their new order: every module of that year, once each."""

    year: Year
    ids: list[str] = Field(max_length=100)
