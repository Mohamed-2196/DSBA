from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, StringConstraints

from app.schemas.common import ApiModel

UploadPurpose = Literal["library", "forum_image"]


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
    media_url: str | None  # forum images: '/api/v1/media/<id>', usable in markdown right away
