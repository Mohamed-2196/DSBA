"""Career Navigator content and site-wide search. Owner: content agent."""

from __future__ import annotations

from typing import Annotated

from fastapi import Query, Request

from app.core.access import Box, Feature
from app.core.security import DB, OptionalUser, client_ip, needs_feature, requires
from app.models import User
from app.routers._base import router_for
from app.schemas.career import CareerDoc
from app.schemas.misc import CareerContent, SearchResults, SearchType
from app.services import content as svc
from app.services.search import run_search

router = router_for("content")


@router.get("/career", response_model=CareerContent, dependencies=[needs_feature(Feature.career)])
def career(db: DB) -> CareerContent:
    """The Career Navigator's content (`data` is null until it is loaded)."""
    return svc.career(db)


@router.put("/career", response_model=CareerContent, dependencies=[needs_feature(Feature.career)])
def update_career(
    body: CareerDoc, request: Request, user: Annotated[User, requires(Box.career_edit)], db: DB
) -> CareerContent:
    """Replace the whole document. Audited.

    Errors: invalid_input (422: it doesn't fit the schema, refers to an id it doesn't define or a module that
    doesn't exist, has a link that isn't https:// or a page of the Hub, or is over 512 KB of JSON)."""
    out = svc.replace_career(db, user, body, client_ip(request))
    db.commit()
    return out


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
