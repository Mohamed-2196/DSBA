from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from app.schemas.common import ApiModel

SearchType = Literal["thread", "library", "issue", "module", "event"]


class SearchHit(ApiModel):
    type: SearchType
    id: str
    title: str
    snippet: str | None
    url: str  # a path inside the web app
    meta: str | None  # e.g. 'ST2133 · Past paper'
    date: datetime | None


class SearchResults(ApiModel):
    query: str
    threads: list[SearchHit]
    library: list[SearchHit]
    issues: list[SearchHit]
    modules: list[SearchHit]
    events: list[SearchHit]


class CareerContent(ApiModel):
    """The Career Navigator's content, edited by admins as one document (shapes: web/src/features/career/types)."""

    data: dict[str, Any]
    updated_at: datetime | None


class Health(ApiModel):
    status: Literal["ok", "degraded"]
    database: Literal["ok", "error"]
    storage: Literal["ok", "error"]
    version: str
