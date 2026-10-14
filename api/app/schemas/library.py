from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, HttpUrl, StringConstraints

from app.schemas.common import ApiModel, Page, UserPublic, Year

EXAM_YEAR_MIN, EXAM_YEAR_MAX = 1990, 2100  # the exam years a past paper may give

LibraryKind = Literal[
    "past-paper",
    "examiners-report",
    "exam-solutions",
    "subject-guide",
    "reading",
    "study-guide",
    "exercises",
    "notes",
    "cheat-sheet",
    "course-materials",
    "vle-materials",
    "other",
]
ExamSession = Literal["may", "october"]  # the May sitting or the October resits
Zone = Literal["A", "B"]
ItemStatus = Literal["pending", "published", "rejected", "removed"]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=200)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
AuthorName = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]


class TextMatch(ApiModel):
    """Where a search's words were found inside the file: the words around them, and the page (PDFs)."""

    snippet: str
    page: int | None


class LibraryItem(ApiModel):
    id: UUID
    slug: str
    source: Literal["file", "link"]
    kind: LibraryKind
    title: str
    description: str | None
    module_id: str | None
    year: Year | None
    url: str | None  # links only
    file_name: str | None
    content_type: str | None
    size_bytes: int | None
    format: str | None  # 'PDF', 'DOCX', ... from the file name; None for links
    exam_year: int | None
    zone: str | None
    exam_session: ExamSession | None
    author_name: str | None
    uploaded_by: UserPublic | None
    status: ItemStatus
    review_note: str | None  # only for the uploader and moderators
    download_count: int
    created_at: datetime
    published_at: datetime | None
    starred: bool
    is_mine: bool
    can_edit: bool
    match: TextMatch | None  # with a search (q) that found the words inside the file, not in its title


class LibraryPage(Page[LibraryItem]):
    pass


class LibraryFacets(ApiModel):
    """Counts of published items, for the filter bar."""

    total: int
    by_kind: dict[str, int]
    by_module: dict[str, int]
    by_year: dict[str, int]


class LibraryItemCreate(ApiModel):
    """A file a student uploaded (POST /uploads first). It waits for a moderator unless a moderator uploads it."""

    upload_id: UUID
    title: Title
    kind: LibraryKind
    module_id: str | None = None
    year: Year | None = None
    description: Description | None = None
    exam_year: int | None = Field(default=None, ge=EXAM_YEAR_MIN, le=EXAM_YEAR_MAX)
    zone: Zone | None = None
    exam_session: ExamSession | None = None
    author_name: AuthorName | None = None


class LibraryLinkCreate(ApiModel):
    """A link to a resource kept elsewhere (Google Drive, the VLE). Moderators only; published at once."""

    url: HttpUrl
    title: Title
    kind: LibraryKind
    module_id: str | None = None
    year: Year | None = None
    description: Description | None = None
    author_name: AuthorName | None = None


class LibraryItemUpdate(ApiModel):
    title: Title | None = None
    kind: LibraryKind | None = None
    module_id: str | None = None
    year: Year | None = None
    description: Description | None = None
    exam_year: int | None = Field(default=None, ge=EXAM_YEAR_MIN, le=EXAM_YEAR_MAX)
    zone: Zone | None = None
    exam_session: ExamSession | None = None
    author_name: AuthorName | None = None


class ReviewDecision(ApiModel):
    decision: Literal["publish", "reject"]
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] | None = None


class StarResult(ApiModel):
    starred: bool


class FileLink(ApiModel):
    url: str  # presigned, short-lived
    expires_in: int


# ── past papers by sitting ───────────────────────────────────────────────────────────────────


class SittingZone(ApiModel):
    """One zone's papers in a sitting, with their examiners' reports and solutions. `zone` None: files for both
    zones, or a sitting with one paper."""

    zone: Zone | None
    papers: list[LibraryItem]
    reports: list[LibraryItem]
    solutions: list[LibraryItem]


class Sitting(ApiModel):
    exam_year: int
    session: ExamSession | None
    zones: list[SittingZone]  # zone A, zone B, then both zones


class PaperSittings(ApiModel):
    """A module's past papers, examiners' reports and solutions: by sitting, newest first, and the ones without an
    exam year apart."""

    sittings: list[Sitting]
    other: list[LibraryItem]


# ── past questions by chapter ────────────────────────────────────────────────────────────────

QUESTION_MAX, PAGE_MAX = 40, 999


class PaperQuestionCreate(ApiModel):
    question: int = Field(ge=1, le=QUESTION_MAX)
    chapter_id: Annotated[str, StringConstraints(min_length=1, max_length=16)]
    page: int | None = Field(default=None, ge=1, le=PAGE_MAX)  # where the question starts in the PDF


class PaperRef(ApiModel):
    id: UUID
    slug: str
    title: str
    exam_year: int | None
    exam_session: ExamSession | None
    zone: str | None


class PaperQuestion(ApiModel):
    id: UUID
    paper: PaperRef
    chapter_id: str
    chapter_title: str
    question: int
    page: int | None
    flagged: bool  # by the person asking
    flag_count: int | None  # people who manage the library only
    is_mine: bool
    can_remove: bool
    created_at: datetime
