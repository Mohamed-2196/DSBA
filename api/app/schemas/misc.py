from __future__ import annotations

from datetime import datetime
from typing import Literal

from app.schemas.common import ApiModel

SearchType = Literal["thread", "library", "issue", "module", "lesson", "event"]


class SearchHit(ApiModel):
    type: SearchType
    id: str
    title: str
    snippet: str | None
    url: str  # a path inside the web app
    meta: str | None  # e.g. 'ST2133 · Past paper'
    date: datetime | None
    page: int | None  # a file's page where the words were found (the url opens it there)


class SearchResults(ApiModel):
    query: str
    threads: list[SearchHit]
    library: list[SearchHit]
    issues: list[SearchHit]
    modules: list[SearchHit]
    lessons: list[SearchHit]  # chapters first (opening their first lesson), then videos by title
    events: list[SearchHit]


class Health(ApiModel):
    status: Literal["ok", "degraded"]
    database: Literal["ok", "error"]
    storage: Literal["ok", "error"]
    version: str
