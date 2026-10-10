from __future__ import annotations

import datetime as dt
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import Field, StringConstraints

from app.schemas.common import ApiModel

Reaction = Literal["useful", "love", "laugh"]
Slug = Annotated[str, StringConstraints(pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$", max_length=80)]


class ReactionCounts(ApiModel):
    useful: int = 0
    love: int = 0
    laugh: int = 0
    mine: list[Reaction] = Field(default_factory=list)


class IssueSummary(ApiModel):
    id: UUID
    slug: str
    number: int
    title: str
    date: dt.date
    cover: dict[str, Any]
    dek: str
    summary: str
    editors: list[str]
    status: Literal["draft", "published"]
    published_at: dt.datetime | None


class IssueDetail(IssueSummary):
    sections: list[dict[str, Any]]  # rendered by the web app (see web/src/features/newsletter)
    reactions: dict[str, ReactionCounts]  # by section id


class IssueCreate(ApiModel):
    slug: Slug
    number: int = Field(ge=0)
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
    date: dt.date
    cover: dict[str, Any] = Field(default_factory=dict)
    dek: str = ""
    summary: str = ""
    editors: list[str] = Field(default_factory=list)
    sections: list[dict[str, Any]] = Field(default_factory=list)


class IssueUpdate(ApiModel):
    slug: Slug | None = None
    number: int | None = Field(default=None, ge=0)
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)] | None = None
    date: dt.date | None = None
    cover: dict[str, Any] | None = None
    dek: str | None = None
    summary: str | None = None
    editors: list[str] | None = None
    sections: list[dict[str, Any]] | None = None
