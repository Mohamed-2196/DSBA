"""Career Navigator content and site-wide search. Owner: content agent."""

from __future__ import annotations

from typing import Any

from fastapi import Query, Request

from app.core.security import DB, Admin, OptionalUser
from app.routers._base import router_for
from app.schemas.misc import CareerContent, SearchResults, SearchType

router = router_for("content")


@router.get("/career", response_model=CareerContent)
def career(db: DB) -> CareerContent:
    raise NotImplementedError


@router.put("/career", response_model=CareerContent)
def update_career(body: dict[str, Any], request: Request, user: Admin, db: DB) -> CareerContent:
    """Replace the whole document. Audited."""
    raise NotImplementedError


@router.get("/search", response_model=SearchResults)
def search(
    db: DB,
    user: OptionalUser,
    q: str = Query(min_length=1, max_length=200),
    types: list[SearchType] | None = Query(default=None, description="Default: all"),
    limit: int = Query(default=5, ge=1, le=20, description="Per type"),
) -> SearchResults:
    """Threads, library items, newsletter issues, modules and calendar events. Prefix-matches the last word
    (for search-as-you-type)."""
    raise NotImplementedError
