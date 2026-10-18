"""A student's private notebook: notebooks, notes and their ink."""

from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import AfterValidator, Field, StringConstraints, field_validator, model_validator

from app.schemas.common import ApiModel, Page
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


class Stroke(ApiModel):
    """One line drawn with the pen or the highlighter. `points` is x, y, pressure (0-1), x, y, pressure, … in sheet
    units, the sheet's top left at 0, 0."""

    id: str = Field(pattern=r"^[A-Za-z0-9_-]{1,32}$")
    tool: Tool
    color: Color
    width: float = Field(ge=0.5, le=64)
    points: list[float] = Field(min_length=3, max_length=MAX_POINTS * 3)

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
    document: services/note_doc.py lists what it may hold), the paper, how many paper sheets, and the lesson it is about
    (in the notebook's module)."""

    title: Title = ""
    doc: dict[str, Any] = Field(default_factory=lambda: {"type": "doc", "content": []})
    paper: Paper = "lined"
    sheets: int = Field(default=1, ge=0, le=MAX_SHEETS)
    lesson_id: LessonId | None = None


class NoteCreate(NoteFields):
    """A new note: in `notebookId`, or in the module's notebook (made when it isn't there yet), or in the student's
    first notebook of their own. `pdfUploadId` writes it over a PDF the student uploaded (purpose note_file)."""

    notebook_id: UUID | None = None
    module_id: str | None = Field(default=None, max_length=64)
    pdf_upload_id: UUID | None = None

    @model_validator(mode="after")
    def _one_place(self) -> NoteCreate:
        if self.notebook_id is not None and self.module_id is not None:
            raise ValueError("Choose a notebook or a module, not both.")
        return self


class NoteUpdate(NoteFields):
    """The whole note as it is now, the notebook it is in, and the version it was loaded at."""

    notebook_id: UUID
    version: int = Field(ge=1)


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
    module_id: str | None  # the notebook's
    lesson_id: str | None
    on_pdf: bool  # written over a PDF
    version: int
    created_at: datetime
    updated_at: datetime


class Note(NoteSummary):
    doc: dict[str, Any]
    text: str
    paper: Paper
    sheets: int
    pdf: NotePdf | None
    ink: list[InkInfo]  # the sheets that have ink, and their versions: each one is read on its own


class NotePage(Page[NoteSummary]):
    pass
