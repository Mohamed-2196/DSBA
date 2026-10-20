from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, StringConstraints

from app.schemas.common import ApiModel

UploadPurpose = Literal[
    "library", "forum_image", "newsletter_image", "bug_screenshot", "board", "note_file", "career_logo", "module_art"
]


class UploadCreate(ApiModel):
    purpose: UploadPurpose
    file_name: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
    content_type: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=127)]
    size_bytes: int = Field(gt=0)


class PresignedUpload(ApiModel):
    """POST a multipart form to `url`: every entry of `fields` first, then the file as `file`."""

    upload_id: UUID
    url: str
    fields: dict[str, str]
    expires_in: int
    max_bytes: int


class UploadOut(ApiModel):
    upload_id: UUID
    status: Literal["pending", "uploaded", "attached"]
    file_name: str
    content_type: str
    size_bytes: int
    media_url: str | None  # forum images: '/api/v1/media/<id>', usable in markdown right away; logos: their link


HUB_MB_PER_DAY_MAX = 1024 * 1024  # 1 TB
ACCOUNT_MB_PER_DAY_MAX = 100 * 1024  # 100 GB


class UploadLimitsIn(ApiModel):
    """The upload budgets admins set: megabytes the whole hub, and each account, may upload in 24 hours."""

    hub_mb_per_day: int = Field(ge=1024, le=HUB_MB_PER_DAY_MAX)
    account_mb_per_day: int = Field(ge=10, le=ACCOUNT_MB_PER_DAY_MAX)


class UploadLimitsOut(ApiModel):
    """The upload budgets and how much of the hub's is used, for admins in Manage → Numbers."""

    hub_mb_per_day: int
    account_mb_per_day: int
    updated_at: datetime | None
    bytes_last_day: int  # what every upload started in the last 24 hours declared
