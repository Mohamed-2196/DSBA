"""Career Navigator content and site-wide search. Owner: content agent."""

from __future__ import annotations

from typing import Any

from fastapi import Query, Request

from app.core.errors import invalid
from app.core.security import DB, Admin, OptionalUser
from app.core.time import utcnow
from app.models import ContentDoc
from app.routers._base import router_for
from app.schemas.misc import CareerContent, SearchResults, SearchType
from app.services import audit
from app.services.newsletter import check_links, json_size
from app.services.ratelimit import request_ip
from app.services.search import run_search

router = router_for("content")

CAREER_KEY = "career"
CAREER_MAX_BYTES = 512 * 1024  # as JSON; the launch document is about 40 KB


@router.get("/career", response_model=CareerContent)
def career(db: DB) -> CareerContent:
    """The Career Navigator's content (empty until it is loaded)."""
    doc = db.get(ContentDoc, CAREER_KEY)
    if doc is None:
        return CareerContent(data={}, updated_at=None)
    return CareerContent(data=doc.data, updated_at=doc.updated_at)


@router.put("/career", response_model=CareerContent)
def update_career(body: dict[str, Any], request: Request, user: Admin, db: DB) -> CareerContent:
    """Replace the whole document. Audited.

    Errors: invalid_input (422: over 512 KB, or a link that isn't https://, mailto: or a page of the Hub)."""
    size = json_size(body)
    if size > CAREER_MAX_BYTES:
        raise invalid("request", "This document is too large.")
    check_links(body, "")
    doc = db.get(ContentDoc, CAREER_KEY)
    if doc is None:
        doc = ContentDoc(key=CAREER_KEY)
        db.add(doc)
    doc.data = body
    doc.updated_at = utcnow()
    doc.updated_by = user.id
    audit.record(
        db,
        user,
        "career.update",
        "content_doc",
        CAREER_KEY,
        {"keys": sorted(body)[:50], "bytes": size},
        request_ip(request),
    )
    db.commit()
    return CareerContent(data=doc.data, updated_at=doc.updated_at)


@router.get("/search", response_model=SearchResults)
def search(
    db: DB,
    user: OptionalUser,
    q: str = Query(min_length=1, max_length=200),
    types: list[SearchType] | None = Query(default=None, description="Default: all"),
    limit: int = Query(default=5, ge=1, le=20, description="Per type"),
) -> SearchResults:
    """Threads, library items, newsletter issues, modules and calendar events. Prefix-matches the last word
    (for search-as-you-type). Only public things are found: visible threads, published files and issues."""
    return run_search(db, q, types, limit)
