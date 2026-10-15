"""Direct-to-S3 uploads, and the pictures /media serves. Owner: content agent."""

from __future__ import annotations

from uuid import UUID

from fastapi import status
from fastapi.responses import RedirectResponse

from app.core.security import DB, ActiveUser, OptionalUser
from app.models import UploadPurpose
from app.routers._base import router_for
from app.schemas.uploads import PresignedUpload, UploadCreate, UploadOut
from app.services import library
from app.services import uploads as svc
from app.services.board import files as board_files

router = router_for("uploads")

# The presigned link lives download_url_ttl_seconds (300 s by default): browsers may reuse the redirect for less.
MEDIA_CACHE = "private, max-age=240"


@router.post("/uploads", response_model=PresignedUpload, status_code=status.HTTP_201_CREATED)
def create_upload(body: UploadCreate, user: ActiveUser, db: DB) -> PresignedUpload:
    """A presigned POST for one file. library: PDF, Word (.docx, .doc), Excel (.xlsx, .xls), PowerPoint (.pptx,
    .ppt), notebooks (.ipynb), R scripts (.r), text (.txt), CSV and pictures (.jpg, .jpeg, .png, .webp), up to
    DSBA_MAX_UPLOAD_MB; forum_image: PNG, JPEG, WebP, GIF up to DSBA_MAX_IMAGE_MB; newsletter_image (people who
    manage the newsletter) and bug_screenshot (anyone signed in): PNG, JPEG, WebP up to DSBA_MAX_IMAGE_MB; board
    (a file on a board card): the library's types and GIF, up to DSBA_MAX_UPLOAD_MB. The extension must match the
    declared type (for .ipynb and .r, `application/octet-stream` is accepted too). POST `fields` and then the file as
    `file` to `url`, then call /uploads/{id}/complete. 20 uploads per hour.

    Errors: unsupported_type (422), too_large (422), too_many_pending (409: a student already has 10 files waiting
    for review; library only), storage_full (409: the files on the student's cards would pass their limit; board only),
    rate_limited (429), forbidden (403: no library.upload, no forum.post for a forum picture, no newsletter.manage
    for a newsletter picture), feature_off (404: the library, its uploads, the forum, the newsletter or the boards
    are switched off)."""
    purpose = UploadPurpose(body.purpose)
    svc.require_features(db, user, purpose)
    svc.require_box(user, purpose)
    if purpose == UploadPurpose.library:
        library.check_pending_room(db, user)  # before the file travels: create_item checks again
    elif purpose == UploadPurpose.board:
        board_files.check_storage(db, user, body.size_bytes)
    presigned = svc.create_upload(db, user, body)
    db.commit()
    return presigned


@router.post("/uploads/{upload_id}/complete", response_model=UploadOut)
def complete_upload(upload_id: UUID, user: ActiveUser, db: DB) -> UploadOut:
    """Call after the browser's POST to the bucket succeeded: checks the object exists and that its size, type and
    first bytes match the file's name.

    Errors: not_uploaded (409), mismatch (422; the object is deleted), feature_off (404: the upload's feature was
    switched off since it started)."""
    out = svc.complete_upload(db, user, upload_id)
    db.commit()
    return out


@router.get("/media/{upload_id}", response_class=RedirectResponse, status_code=status.HTTP_302_FOUND)
def media(upload_id: UUID, db: DB, user: OptionalUser) -> RedirectResponse:
    """A picture: 302 to a short-lived link (cache headers allow browsers to reuse it for a few minutes). Its
    uploader always sees it. A forum image: everyone while its post is visible, moderators always. A newsletter
    picture: everyone once a published issue shows it, people who manage the newsletter always. A bug screenshot:
    admins. 404 otherwise; feature_off while the forum or the newsletter is off for the viewer."""
    url = svc.media_redirect_url(db, upload_id, user)
    return RedirectResponse(url, status_code=status.HTTP_302_FOUND, headers={"Cache-Control": MEDIA_CACHE})
