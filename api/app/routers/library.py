"""The library. Owner: content agent."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import Query, Request, Response, status
from fastapi.responses import RedirectResponse

from app.core.pagination import Limit, Offset
from app.core.security import DB, ActiveUser, CurrentUser, Moderator, OptionalUser
from app.routers._base import router_for
from app.schemas.common import Year
from app.schemas.library import (
    FileLink,
    ItemStatus,
    LibraryFacets,
    LibraryItem,
    LibraryItemCreate,
    LibraryItemUpdate,
    LibraryKind,
    LibraryLinkCreate,
    LibraryPage,
    ReviewDecision,
    StarResult,
)

router = router_for("library")


@router.get("/library/items", response_model=LibraryPage)
def list_items(
    db: DB,
    user: OptionalUser,
    q: str | None = Query(default=None, max_length=200),
    module_id: str | None = None,
    year: Year | None = None,
    kind: LibraryKind | None = None,
    source: Literal["file", "link"] | None = None,
    sort: Literal["new", "popular", "title"] = "new",
    starred: bool = False,
    mine: bool = False,
    status_: ItemStatus | None = Query(default=None, alias="status", description="Moderators: e.g. pending"),
    limit: Limit = 24,
    offset: Offset = 0,
) -> LibraryPage:
    """Published items for everyone. `starred` and `mine` need a session; `mine` includes pending and rejected."""
    raise NotImplementedError


@router.get("/library/facets", response_model=LibraryFacets)
def facets(db: DB) -> LibraryFacets:
    raise NotImplementedError


@router.get("/library/items/{item}", response_model=LibraryItem)
def get_item(item: str, db: DB, user: OptionalUser) -> LibraryItem:
    """By id or slug. Unpublished items: only their uploader and moderators."""
    raise NotImplementedError


@router.post("/library/items", response_model=LibraryItem, status_code=status.HTTP_201_CREATED)
def create_item(body: LibraryItemCreate, user: ActiveUser, db: DB) -> LibraryItem:
    """Turn a completed upload into a library item: pending for students, published for moderators."""
    raise NotImplementedError


@router.post("/library/links", response_model=LibraryItem, status_code=status.HTTP_201_CREATED)
def create_link(body: LibraryLinkCreate, request: Request, user: Moderator, db: DB) -> LibraryItem:
    raise NotImplementedError


@router.patch("/library/items/{item_id}", response_model=LibraryItem)
def update_item(item_id: UUID, body: LibraryItemUpdate, user: ActiveUser, db: DB) -> LibraryItem:
    """The uploader while the item is pending; moderators always."""
    raise NotImplementedError


@router.delete("/library/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(item_id: UUID, request: Request, user: CurrentUser, db: DB) -> Response:
    """The uploader or a moderator. The file is deleted from storage."""
    raise NotImplementedError


@router.get("/library/items/{item_id}/download", response_class=RedirectResponse, status_code=status.HTTP_302_FOUND)
def download(item_id: UUID, db: DB, user: OptionalUser) -> RedirectResponse:
    """302 to a short-lived link that downloads the file (counted), or to the link's URL."""
    raise NotImplementedError


@router.get("/library/items/{item_id}/file", response_model=FileLink)
def file_link(item_id: UUID, db: DB, user: OptionalUser) -> FileLink:
    """A short-lived link that shows the file in the browser (PDFs and images), for the viewer. Not counted."""
    raise NotImplementedError


@router.put("/library/items/{item_id}/star", response_model=StarResult)
def star(item_id: UUID, user: CurrentUser, db: DB) -> StarResult:
    raise NotImplementedError


@router.delete("/library/items/{item_id}/star", response_model=StarResult)
def unstar(item_id: UUID, user: CurrentUser, db: DB) -> StarResult:
    raise NotImplementedError


@router.post("/library/items/{item_id}/review", response_model=LibraryItem)
def review(item_id: UUID, body: ReviewDecision, request: Request, user: Moderator, db: DB) -> LibraryItem:
    """Publish or reject a pending upload. Notifies the uploader. Audited."""
    raise NotImplementedError
