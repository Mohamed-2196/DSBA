"""A student's private notebook: notebooks, notes and their ink."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import AfterValidator, Field, StringConstraints, field_validator, model_validator

from app.schemas.common import ApiModel, Page, UserPublic
from app.schemas.modules import LessonId

TITLE_MAX = 200
NOTEBOOK_TITLE_MAX = 120
DOC_MAX_BYTES = 400_000  # a note's typed text as JSON: a long lecture's worth, with formulas and lists
EXCERPT_LENGTH = 240
MAX_SHEETS = 300  # paper sheets in one note (a PDF's pages come on top)
# A sheet is SHEET_WIDTH units wide; paper sheets are SHEET_HEIGHT tall (35 ruled lines of 32 units: A4's shape, to a
# whole line), a PDF page keeps its own shape.
SHEET_WIDTH = 800
SHEET_HEIGHT = 1120
# Sheets 0-999 are a PDF's pages (0 its first); paper sheets count from PAPER_SHEETS_FROM (the first).
PAPER_SHEETS_FROM = 1000
# One sheet's ink, as JSON: a dense handwritten page is 50 to 100 KB. Every read of a sheet stays small.
SHEET_MAX_BYTES = 512_000
# A request to save one sheet is refused unread above this (core/limits.py): the numbers it sends may be longer than
# the rounded ones kept.
INK_BODY_MAX = 2 * SHEET_MAX_BYTES
MAX_STROKES = 2000  # on one sheet
MAX_POINTS = 4000  # in one stroke (x, y and pressure each)

Paper = Literal["blank", "lined", "grid", "dotted"]
Tool = Literal["pen", "highlighter"]
Color = Annotated[str, StringConstraints(pattern=r"^#[0-9a-fA-F]{6}$")]
OneLine = AfterValidator(lambda v: " ".join(v.split()))
Title = Annotated[str, Field(default="", max_length=TITLE_MAX), OneLine]


# ── notebooks ────────────────────────────────────────────────────────────────────────────────


class NotebookCreate(ApiModel):
    """A notebook of the student's own, or a module's (one per module: asking again answers the one there is)."""

    title: Annotated[str, Field(max_length=NOTEBOOK_TITLE_MAX), OneLine] = ""
    module_id: str | None = Field(default=None, max_length=64)


class NotebookUpdate(ApiModel):
    title: Annotated[str, Field(min_length=1, max_length=NOTEBOOK_TITLE_MAX), OneLine]


class Notebook(ApiModel):
    id: UUID
    title: str
    module_id: str | None
    note_count: int
    created_at: datetime
    updated_at: datetime  # when the notebook or one of its notes last changed


class StorageUse(ApiModel):
    """What the student's notebooks hold against what they may hold: the typed text and handwriting (kept in the
    database), and the pictures, files and PDFs (kept in file storage)."""

    writing_bytes: int
    writing_limit_bytes: int
    files_bytes: int
    files_limit_bytes: int


class NotebookList(ApiModel):
    items: list[Notebook]
    storage: StorageUse


# ── ink ──────────────────────────────────────────────────────────────────────────────────────


class InkAnchor(ApiModel):
    """The typed text a stroke on paper goes with: `block` is a block of the text (its `blockId`; None: below the end of
    the text), and `dy` how far the middle of the stroke is below that block's top (or the text's end), in units. When
    text or a picture is added above it, the web app moves the stroke down with its block."""

    block: str | None = Field(default=None, pattern=r"^[A-Za-z0-9_-]{1,32}$")
    dy: float = Field(ge=-100_000, le=100_000)


class Stroke(ApiModel):
    """One line drawn with the pen or the highlighter. `points` is x, y, pressure (0-1), x, y, pressure, … in sheet
    units, the sheet's top left at 0, 0. A stroke on paper has an `anchor`; one on a PDF's page keeps its place."""

    id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,32}$")
    tool: Tool
    color: Color
    width: float = Field(ge=0.5, le=64)
    points: list[float] = Field(min_length=3, max_length=MAX_POINTS * 3)
    anchor: InkAnchor | None = None

    @field_validator("points")
    @classmethod
    def _triples(cls, v: list[float]) -> list[float]:
        if len(v) % 3:
            raise ValueError("Points come in threes: x, y and pressure.")
        if any(abs(p) > 100_000 for p in v):
            raise ValueError("A point is too far off the sheet.")
        return [round(p, 2) for p in v]


class InkSave(ApiModel):
    """The whole sheet as it is now, and the version it was loaded at (0: the sheet had no ink yet)."""

    strokes: list[Stroke] = Field(max_length=MAX_STROKES)
    version: int = Field(ge=0)


class InkSheet(ApiModel):
    sheet: int
    strokes: list[Stroke]
    version: int


class InkInfo(ApiModel):
    """A sheet that has ink, without the ink: read it with GET /notes/{id}/ink/{sheet}."""

    sheet: int
    version: int


# ── notes ────────────────────────────────────────────────────────────────────────────────────


class NoteFields(ApiModel):
    """What a student writes: a title, the typed text and its pictures, in the text or free on the pages (a ProseMirror
    document: services/note_doc.py lists what it may hold), the paper, how many paper sheets, and the module and
    lesson it is about."""

    title: Title = ""
    doc: dict[str, Any] = Field(default_factory=lambda: {"type": "doc", "content": []})
    paper: Paper = "lined"
    sheets: int = Field(default=1, ge=0, le=MAX_SHEETS)
    module_id: str | None = Field(default=None, max_length=64)
    lesson_id: LessonId | None = None


class NoteCreate(NoteFields):
    """A new note: in `notebookId`, or else in its module's notebook (made when it isn't there yet), or else in the
    student's first notebook of their own. A note in a module's notebook is about that module. `pdfUploadId` writes it
    over a PDF the student uploaded (purpose note_file)."""

    notebook_id: UUID | None = None
    pdf_upload_id: UUID | None = None


class NoteUpdate(NoteFields):
    """The whole note as it is now, the notebook it is in, and the version it was loaded at. A note given another
    module while in a module's notebook goes to the new module's notebook (or, with no module, the student's own):
    the saved note says where."""

    notebook_id: UUID
    version: int = Field(ge=1)


class PageChange(ApiModel):
    """A change to a note's pages of paper, made at once with the version it was loaded at: `insert` a blank page at
    `page` (0 up to the number of pages: that many adds one at the end), `delete` page `page`, or `move` page `page`
    to place `to`. The handwriting and the free pictures go with their pages."""

    action: Literal["insert", "delete", "move"]
    page: int = Field(ge=0, lt=MAX_SHEETS)
    to: int | None = Field(default=None, ge=0, lt=MAX_SHEETS)
    version: int = Field(ge=1)

    @model_validator(mode="after")
    def _where_to(self) -> PageChange:
        if (self.action == "move") != (self.to is not None):
            raise ValueError("A page moves to a place (`to`), and only a move has one.")
        return self


class AnnotateRequest(ApiModel):
    library_item_id: UUID


class NotePdf(ApiModel):
    """The PDF a note is written over: a library file (`libraryItemId`, read with /library/items/{id}/file, its page
    at /library/{slug}) or the student's own (`uploadId`, read with /notes/files/{id}). `available` is false once the
    file is gone."""

    library_item_id: UUID | None
    slug: str | None
    upload_id: UUID | None
    title: str
    available: bool


class NoteSummary(ApiModel):
    id: UUID
    notebook_id: UUID
    title: str
    excerpt: str  # the start of the typed text
    module_id: str | None
    lesson_id: str | None
    on_pdf: bool  # written over a PDF
    version: int
    created_at: datetime
    updated_at: datetime


class NoteShare(ApiModel):
    """The note's copy shared with its module's students (GET /shared-notes/{id}), as its writer sees it from the
    note. `upToDate`: the copy has the note as it is now; otherwise the writer may update it."""

    id: UUID
    module_id: str
    credited: bool
    hidden: bool  # a student rep hid it: only its writer and moderators see it
    shared_at: datetime
    updated_at: datetime
    up_to_date: bool


class Note(NoteSummary):
    doc: dict[str, Any]
    text: str
    paper: Paper
    sheets: int
    pdf: NotePdf | None
    ink: list[InkInfo]  # the sheets that have ink, and their versions: each one is read on its own
    share: NoteShare | None  # its copy shared with the module, if it has one


class NotePage(Page[NoteSummary]):
    pass


# ── notes shared with a module ───────────────────────────────────────────────────────────────


class ShareRequest(ApiModel):
    """Share the note with its module's students, or update the copy shared: `credited` shows the writer's name and
    year with it (false: "Shared by a student")."""

    credited: bool = True


class InkPage(ApiModel):
    """The handwriting on one sheet of a shared note."""

    sheet: int
    strokes: list[Stroke]


class SharedNoteSummary(ApiModel):
    """A note shared with a module, in the module's list. `author` is None when it was shared without a name (or the
    account has no profile). `mine`: the viewer shared it. `hidden`: a student rep hid it (only its writer and
    moderators see it)."""

    id: UUID
    module_id: str
    title: str
    excerpt: str  # the start of its typed text
    author: UserPublic | None
    credited: bool  # shared with the writer's name (`author` may still be None: an account without a profile)
    mine: bool
    hidden: bool
    shared_at: datetime
    updated_at: datetime  # when it was last copied from the note


class SharedNote(SharedNoteSummary):
    """A shared note to read: its typed text (a ProseMirror document, as a note's), paper, pages and handwriting.
    Its pictures and files are read with GET /shared-notes/{id}/files/{uploadId}. `canModerate`: the viewer may hide
    it."""

    module_title: str
    note_id: UUID | None  # the note it was copied from: for its writer only
    doc: dict[str, Any]
    paper: Paper
    sheets: int
    ink: list[InkPage]
    can_moderate: bool


class SharedNotePage(Page[SharedNoteSummary]):
    pass


class HideRequest(ApiModel):
    """Why it is hidden: its writer is told."""

    reason: Annotated[str, StringConstraints(strip_whitespace=True, max_length=500)] = ""


# ── Manage: the notebook's uploads ──

UPLOADS_PER_HOUR_MAX = 1000


class NotebookLimitsIn(ApiModel):
    uploads_per_hour: int = Field(ge=1, le=UPLOADS_PER_HOUR_MAX)  # pictures, files and PDFs per student per hour


class NotebookUploader(ApiModel):
    """One student's notebook uploads in the last 7 days, by display name (no email or phone)."""

    user_id: UUID
    display_name: str | None  # None: the account has no profile yet
    uploads: int
    size_bytes: int
    capped: int  # uploads refused at the hourly limit


class NotebookUploadsOut(ApiModel):
    """The notebook's upload limit and its numbers, for admins in Manage. "Last 7 days" is today and the 6 days
    before, in Bahrain."""

    uploads_per_hour: int
    updated_at: datetime | None
    uploads_last_hour: int
    uploads_last_day: int  # the last 24 hours
    uploads_last_week: int
    capped_students: int  # students refused at the hourly limit in the last 7 days
    capped_uploads: int
    top_by_count: list[NotebookUploader]
    top_by_bytes: list[NotebookUploader]
    students: int  # students with a notebook
    files_bytes: int  # the pictures, files and PDFs in everyone's notes (released files don't count)
    files_limit_bytes: int  # each student's room for them
    budget_bytes: int  # students times files_limit_bytes
