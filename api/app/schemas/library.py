from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, HttpUrl, StringConstraints

from app.schemas.common import ApiModel, Page, UserPublic, Year

LibraryKind = Literal[
    "past-paper",
    "examiners-report",
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
ItemStatus = Literal["pending", "published", "rejected", "removed"]
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=200)]
Description = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
AuthorName = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]


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
    exam_year: int | None = Field(default=None, ge=1990, le=2100)
    zone: Literal["A", "B"] | None = None
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
    exam_year: int | None = Field(default=None, ge=1990, le=2100)
    zone: Literal["A", "B"] | None = None
    author_name: AuthorName | None = None


class ReviewDecision(ApiModel):
    decision: Literal["publish", "reject"]
    note: Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)] | None = None


class StarResult(ApiModel):
    starred: bool


class FileLink(ApiModel):
    url: str  # presigned, short-lived
    expires_in: int
