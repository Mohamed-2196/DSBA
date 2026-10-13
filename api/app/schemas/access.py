"""Access on the wire: box and feature keys as the contract lists them, and a role as people see it."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from app.schemas.common import ApiModel

BoxKey = Literal[
    "forum.post",
    "library.upload",
    "newsletter.react",
    "reports.create",
    "forum.moderate",
    "library.manage",
    "newsletter.manage",
    "calendar.manage",
    "career.edit",
    "stats.view",
    "people.suspend",
    "audit.read",
]
FeatureKey = Literal["forum", "library", "library.uploads", "newsletter", "calendar", "career", "grades", "noora"]


class RoleSummary(ApiModel):
    id: UUID
    slug: str
    name: str
    badge: str | None
