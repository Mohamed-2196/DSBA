"""Direct-to-S3 uploads and public forum images. Owner: content agent."""

from __future__ import annotations

from uuid import UUID

from fastapi import status
from fastapi.responses import RedirectResponse

from app.core.security import DB, ActiveUser
from app.routers._base import router_for
from app.schemas.uploads import PresignedUpload, UploadCreate, UploadOut

router = router_for("uploads")


@router.post("/uploads", response_model=PresignedUpload, status_code=status.HTTP_201_CREATED)
def create_upload(body: UploadCreate, user: ActiveUser, db: DB) -> PresignedUpload:
    """A presigned POST for one file. library: PDF, Word, Excel, PowerPoint, notebooks, R scripts, up to
    DSBA_MAX_UPLOAD_MB; forum_image: PNG, JPEG, WebP, GIF up to DSBA_MAX_IMAGE_MB.

    Errors: unsupported_type (422), too_large (422), rate_limited (429)."""
    raise NotImplementedError


@router.post("/uploads/{upload_id}/complete", response_model=UploadOut)
def complete_upload(upload_id: UUID, user: ActiveUser, db: DB) -> UploadOut:
    """Call after the browser's POST to the bucket succeeded: checks the object exists and matches what was declared.

    Errors: not_uploaded (409), mismatch (422; the object is deleted)."""
    raise NotImplementedError


@router.get("/media/{upload_id}", response_class=RedirectResponse, status_code=status.HTTP_302_FOUND)
def media(upload_id: UUID, db: DB) -> RedirectResponse:
    """A forum image: 302 to a short-lived link (cache headers allow browsers to reuse it for a few minutes)."""
    raise NotImplementedError
