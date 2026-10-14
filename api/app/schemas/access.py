"""Access on the wire: box and feature keys as the contract lists them, a role as people see it, and the shapes of
the Access screen."""

from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, StringConstraints

from app.core.access import SwitchMode
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
    "content.edit",
    "requests.manage",
    "summary.share",
    "stats.view",
    "people.suspend",
    "audit.read",
]
FeatureKey = Literal[
    "forum",
    "forum.help-below",
    "forum.anonymous",
    "forum.follow",
    "library",
    "library.uploads",
    "library.questions",
    "newsletter",
    "newsletter.polls",
    "calendar",
    "career",
    "career.seniors",
    "grades",
    "noora",
    "noora.ai",
    "notes",
    "board",
    "requests",
    "requests.autoclose",
    "requests.done",
    "summary",
    "video_suggestions",
]


class FeaturesOut(ApiModel):
    features: list[FeatureKey]  # the features on for whoever asks


class RoleSummary(ApiModel):
    id: UUID
    slug: str
    name: str
    badge: str | None


RoleName = Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=40)]
Badge = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=24)]


class BoxOut(ApiModel):
    key: BoxKey
    area: str
    label: str


class RoleOut(ApiModel):
    id: UUID
    slug: str
    name: str
    badge: str | None
    position: int
    built_in: bool  # can't be deleted
    locked: bool  # can't be changed (Admin)
    version: int  # send it back when editing: a role changed since answers 409 role_changed
    boxes: list[BoxKey]  # Admin: every box
    holders: int


class RoleCatalogue(ApiModel):
    roles: list[RoleOut]  # Admin, Rep, then the others in their order
    boxes: list[BoxOut]  # every box, grouped by area for the checkboxes


class RoleCreate(ApiModel):
    name: RoleName
    badge: Badge | None = None
    boxes: list[BoxKey] = []


class RoleUpdate(ApiModel):
    """Only the fields sent change; `badge: null` removes the badge, and `boxes` replaces them as a whole."""

    version: int
    name: RoleName | None = None
    badge: Badge | None = None
    boxes: list[BoxKey] | None = None
    position: Annotated[int, Field(ge=0, le=1000)] | None = None


class UserRolesUpdate(ApiModel):
    role_ids: list[UUID]  # exactly the roles the person holds afterwards


class FeatureOut(ApiModel):
    feature: FeatureKey
    label: str
    hides: str  # what switching it off hides
    mode: SwitchMode
    role_ids: list[UUID]  # for "roles"


class SwitchUpdate(ApiModel):
    mode: SwitchMode
    role_ids: list[UUID] = []
