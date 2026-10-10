"""The library. Owner: content agent."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import Query, Request, Response, status
from fastapi.responses import RedirectResponse

from app.core.pagination import Limit, Offset, YearParam
from app.core.security import DB, ActiveUser, CurrentUser, Moderator, OptionalUser
from app.routers._base import router_for
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
from app.services import library as svc
from app.services.ratelimit import request_ip
from app.services.search import text_query

router = router_for("library")


@router.get("/library/items", response_model=LibraryPage)
def list_items(
    db: DB,
    user: OptionalUser,
    q: str | None = Query(default=None, max_length=200),
    module_id: str | None = None,
    year: YearParam | None = None,
    kind: LibraryKind | None = None,
    source: Literal["file", "link"] | None = None,
    sort: Literal["new", "popular", "title", "relevance"] = Query(
        default="new", description="relevance: best match first (with q)"
    ),
    starred: bool = False,
    mine: bool = False,
    status_: ItemStatus | None = Query(default=None, alias="status", description="Moderators: e.g. pending"),
    limit: Limit = 24,
    offset: Offset = 0,
) -> LibraryPage:
    """Published items for everyone. `starred` and `mine` need a session; `mine` includes pending and rejected.
    `q` searches titles, descriptions, authors and file names, plus the module's code and name and the kind
    ("ST2133 past papers"); the last word matches as a prefix."""
    filters = svc.ListFilters(
        module_id=module_id, year=year, kind=kind, source=source, starred=starred, mine=mine, status=status_
    )
    tsq = text_query(q) if q and q.strip() else None
    if q and q.strip() and tsq is None:  # only symbols: nothing can match
        return LibraryPage(items=[], total=0, limit=limit, offset=offset)
    items, total = svc.list_items(db, user, filters, tsquery=tsq, sort=sort, limit=limit, offset=offset)
    return LibraryPage(items=items, total=total, limit=limit, offset=offset)


@router.get("/library/facets", response_model=LibraryFacets)
def facets(db: DB) -> LibraryFacets:
    return svc.facets(db)


@router.get("/library/items/{item}", response_model=LibraryItem)
def get_item(item: str, db: DB, user: OptionalUser) -> LibraryItem:
    """By id or slug. Unpublished items: only their uploader and moderators."""
    return svc.one_out(db, svc.get_visible(db, item, user), user)


@router.post("/library/items", response_model=LibraryItem, status_code=status.HTTP_201_CREATED)
def create_item(body: LibraryItemCreate, request: Request, user: ActiveUser, db: DB) -> LibraryItem:
    """Turn a completed upload into a library item: pending for students, published for moderators.

    Errors: not_uploaded (409), already_used (409), invalid_input (422: an unknown module)."""
    item = svc.create_from_upload(db, user, body, request_ip(request))
    db.commit()
    return svc.one_out(db, item, user)


@router.post("/library/links", response_model=LibraryItem, status_code=status.HTTP_201_CREATED)
def create_link(body: LibraryLinkCreate, request: Request, user: Moderator, db: DB) -> LibraryItem:
    """A link to a resource kept elsewhere (https only), published at once."""
    item = svc.create_link(db, user, body, request_ip(request))
    db.commit()
    return svc.one_out(db, item, user)


@router.patch("/library/items/{item_id}", response_model=LibraryItem)
def update_item(item_id: UUID, body: LibraryItemUpdate, request: Request, user: ActiveUser, db: DB) -> LibraryItem:
    """The uploader while the item is pending; moderators always."""
    item = svc.get_visible(db, item_id, user)
    svc.apply_update(db, user, item, body, request_ip(request))
    db.commit()
    return svc.one_out(db, item, user)


@router.delete("/library/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_item(item_id: UUID, request: Request, user: CurrentUser, db: DB) -> Response:
    """The uploader or a moderator. The file is deleted from storage."""
    item = svc.get_visible(db, item_id, user)
    svc.remove(db, user, item, request_ip(request))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/library/items/{item_id}/download", response_class=RedirectResponse, status_code=status.HTTP_302_FOUND)
def download(item_id: UUID, db: DB, user: OptionalUser) -> RedirectResponse:
    """302 to a short-lived link that downloads the file (counted), or to the link's URL."""
    item = svc.get_visible(db, item_id, user)
    target = svc.download_url(db, item)
    db.commit()
    return RedirectResponse(target, status_code=status.HTTP_302_FOUND)


@router.get("/library/items/{item_id}/file", response_model=FileLink)
def file_link(item_id: UUID, db: DB, user: OptionalUser) -> FileLink:
    """A short-lived link that shows the file in the browser (PDFs and images), for the viewer. Not counted.

    Errors: no_preview (409) for links and other formats: download them instead."""
    return svc.preview_link(svc.get_visible(db, item_id, user))


@router.put("/library/items/{item_id}/star", response_model=StarResult)
def star(item_id: UUID, user: CurrentUser, db: DB) -> StarResult:
    item = svc.get_visible(db, item_id, user)
    starred = svc.set_star(db, user, item, True)
    db.commit()
    return StarResult(starred=starred)


@router.delete("/library/items/{item_id}/star", response_model=StarResult)
def unstar(item_id: UUID, user: CurrentUser, db: DB) -> StarResult:
    item = svc.get_visible(db, item_id, user)
    starred = svc.set_star(db, user, item, False)
    db.commit()
    return StarResult(starred=starred)


@router.post("/library/items/{item_id}/review", response_model=LibraryItem)
def review(item_id: UUID, body: ReviewDecision, request: Request, user: Moderator, db: DB) -> LibraryItem:
    """Publish or reject a pending upload. Notifies the uploader. Audited.

    Errors: removed (409)."""
    item = svc.get_visible(db, item_id, user)
    svc.review(db, user, item, body.decision, body.note, request_ip(request))
    db.commit()
    return svc.one_out(db, item, user)
