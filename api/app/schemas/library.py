from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal, get_args
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
PAST_PAPER: LibraryKind = "past-paper"
EXAMINERS_REPORT: LibraryKind = "examiners-report"
EXAM_SOLUTIONS: LibraryKind = "exam-solutions"
EXAM_KINDS: tuple[LibraryKind, ...] = (PAST_PAPER, EXAMINERS_REPORT, EXAM_SOLUTIONS)  # the files of a sitting
ExamSession = Literal["may", "october"]  # the May sitting or the October resits
EXAM_SESSIONS: tuple[ExamSession, ...] = get_args(ExamSession)
# The versions the University of London sets of a paper: zone A, zone B, and for some modules the RTC paper, the one
# set for Recognised Teaching Centres.
Zone = Literal["A", "B", "RTC"]
ZONES: tuple[Zone, ...] = get_args(Zone)
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
    zone: Zone | None
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
    cover_url: str | None  # the first page as a small picture (PDF and Word files), once the text worker made it
    # An examiners' report that works through the questions ("Approaching the question"): the sittings table says
    # so where the sitting has no solutions. False for every other file.
    worked_answers: bool


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
    """A link to a resource kept elsewhere (the VLE, a publisher's site); never Google Drive or Docs, whose files the
    Hub copies instead. Moderators only; published at once."""

    url: HttpUrl
    title: Title
    kind: LibraryKind
    module_id: str | None = None
    year: Year | None = None
    description: Description | None = None
    exam_year: int | None = Field(default=None, ge=EXAM_YEAR_MIN, le=EXAM_YEAR_MAX)  # a past paper's sitting
    zone: Zone | None = None
    exam_session: ExamSession | None = None
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
    """One zone's papers in a sitting, with their examiners' reports and solutions: zone A, zone B or RTC (the paper set
    for Recognised Teaching Centres). `zone` None: files for every zone, or a sitting with one paper."""

    zone: Zone | None
    papers: list[LibraryItem]
    reports: list[LibraryItem]
    solutions: list[LibraryItem]


class Sitting(ApiModel):
    exam_year: int
    session: ExamSession | None
    zones: list[SittingZone]  # zone A, zone B, RTC, then every zone


class PaperSittings(ApiModel):
    """A module's past papers, examiners' reports and solutions: by sitting, newest first, and the ones without an
    exam year apart."""

    sittings: list[Sitting]
    other: list[LibraryItem]


# ── past questions by chapter ────────────────────────────────────────────────────────────────

QUESTION_MAX, PAGE_MAX = 40, 999
Section = Annotated[str, StringConstraints(pattern=r"^[A-Z]$")]  # 'B' of "B1"


QuestionMarkKind = Literal["done", "stuck", "skipped"]


class PaperQuestionCreate(ApiModel):
    section: Section | None = None  # on a paper that numbers each section from 1
    question: int = Field(ge=1, le=QUESTION_MAX)
    chapter_id: Annotated[str, StringConstraints(min_length=1, max_length=16)]
    page: int | None = Field(default=None, ge=1, le=PAGE_MAX)  # where the question starts in the PDF


class PaperRef(ApiModel):
    id: UUID
    slug: str
    title: str
    exam_year: int | None
    exam_session: ExamSession | None
    zone: Zone | None
    cover_url: str | None  # the paper's first page as a small picture (LibraryItem.cover_url)


class WorkedAnswer(ApiModel):
    """Where a question's commentary starts in its sitting's examiners' report: the report, and its page."""

    id: UUID
    slug: str
    page: int


class PaperQuestion(ApiModel):
    id: UUID
    paper: PaperRef
    chapter_id: str
    chapter_title: str
    section: str | None  # 'B' of "B1"; None: the paper numbers right through ("Q3")
    question: int
    page: int | None
    flagged: bool  # by the person asking
    flag_count: int | None  # people who manage the library only
    is_mine: bool
    can_remove: bool
    created_at: datetime
    # The examiners' report of the paper's sitting at this question's commentary ("Question 3", or Section B's
    # "Question 1"), found when the report's text was read; None when the report has no such heading.
    answer: WorkedAnswer | None


# ── practising a chapter ─────────────────────────────────────────────────────────────────────


class QuestionMarkSave(ApiModel):
    """How a past question went: done, stuck or skipped. The question is its paper, section and number."""

    item_id: UUID
    section: Section | None = None
    question: int = Field(ge=1, le=QUESTION_MAX)
    mark: QuestionMarkKind


class QuestionMark(ApiModel):
    item_id: UUID
    section: str | None
    question: int
    mark: QuestionMarkKind
    updated_at: datetime
