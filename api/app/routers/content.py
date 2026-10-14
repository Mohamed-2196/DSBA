"""Career Navigator's content and its editor, and site-wide search."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Query, Request, status
from fastapi.responses import RedirectResponse

from app.core.access import Box, Feature
from app.core.security import DB, OptionalUser, client_ip, needs_feature, requires
from app.models import User
from app.routers._base import router_for
from app.schemas.career import CareerContent, CareerEditable, CareerSave
from app.schemas.misc import SearchResults, SearchType
from app.services import career as svc
from app.services.search import run_search

router = router_for("content")

LOGO_CACHE = "private, max-age=240"  # the presigned link lives 300 s by default


@router.get("/career", response_model=CareerContent, dependencies=[needs_feature(Feature.career)])
def career(db: DB) -> CareerContent:
    """Career Navigator as the page shows it, hidden parts left out (`data` is null until it is loaded)."""
    return svc.content(db)


@router.get("/career/edit", response_model=CareerEditable, dependencies=[needs_feature(Feature.career)])
def career_for_editing(db: DB, _: Annotated[User, requires(Box.career_edit)]) -> CareerEditable:
    """The whole document, hidden parts included, with the version a save names."""
    return svc.editable(db)


@router.put("/career", response_model=CareerEditable, dependencies=[needs_feature(Feature.career)])
def save_career(
    body: CareerSave, request: Request, user: Annotated[User, requires(Box.career_edit)], db: DB
) -> CareerEditable:
    """Save the whole document, if nobody saved it since `version`. Audited with what changed, before and after.

    Errors: career_changed (409: someone saved it since: load it again), invalid_input (422: it doesn't fit the
    schema, refers to an id it doesn't define or a module that doesn't exist, hides the role the page opens on, has a
    link that isn't https:// or a page of the Hub, uses a logo that isn't uploaded, or is over 512 KB of JSON)."""
    out = svc.save(db, user, body, client_ip(request))
    db.commit()
    return out


@router.get(
    "/career/logos/{upload_id}",
    response_class=RedirectResponse,
    status_code=status.HTTP_302_FOUND,
    dependencies=[needs_feature(Feature.career)],
)
def career_logo(upload_id: UUID, db: DB, user: OptionalUser) -> RedirectResponse:
    """An employer's or a certificate's logo: 302 to a short-lived link. To everyone while Career Navigator uses it;
    before that only to the editors (their preview)."""
    url = svc.logo_url(db, upload_id, user)
    return RedirectResponse(url, status_code=status.HTTP_302_FOUND, headers={"Cache-Control": LOGO_CACHE})


@router.get("/search", response_model=SearchResults)
def search(
    db: DB,
    user: OptionalUser,
    q: str = Query(min_length=1, max_length=200),
    types: list[SearchType] | None = Query(default=None, description="Default: all"),
    limit: int = Query(default=5, ge=1, le=20, description="Per type"),
) -> SearchResults:
    """Threads, library items, newsletter issues, modules and calendar events. Prefix-matches the last word
    (for search-as-you-type). Only public things are found: visible threads, published files and issues.
    Features switched off for the viewer are left out."""
    return run_search(db, q, types, limit, user)
