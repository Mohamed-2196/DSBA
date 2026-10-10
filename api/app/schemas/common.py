from __future__ import annotations

from typing import Generic, Literal, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel

T = TypeVar("T")

Year = Literal[1, 2, 3]
Role = Literal["student", "moderator", "admin"]
UserStatus = Literal["active", "suspended"]
PostStatus = Literal["visible", "hidden", "deleted"]


class ApiModel(BaseModel):
    """Base for every API model: camelCase on the wire, snake_case in Python, built from ORM objects."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class Page(ApiModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int


class ErrorDetail(ApiModel):
    code: str
    message: str
    fields: dict[str, str] | None = None
    retry_after: int | None = None


class ErrorResponse(ApiModel):
    error: ErrorDetail


class UserPublic(ApiModel):
    """How a person appears next to their posts and uploads."""

    id: UUID
    display_name: str
    year: Year | None
    role: Role


class Ok(ApiModel):
    ok: bool = True
