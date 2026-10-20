"""Direct-to-S3 uploads, and the pictures /media serves. Owner: content agent."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Request, status
from fastapi.responses import RedirectResponse

from app.core.security import DB, ActiveUser, OptionalUser, client_ip, requires_admin
from app.models import UploadPurpose, User
from app.routers._base import router_for
from app.schemas.uploads import PresignedUpload, UploadCreate, UploadLimitsIn, UploadLimitsOut, UploadOut
from app.services import upload_budget
from app.services import uploads as svc

router = router_for("uploads")
Admin = Annotated[User, requires_admin()]

# The presigned link lives download_url_ttl_seconds (300 s by default): browsers may reuse the redirect for less.
MEDIA_CACHE = "private, max-age=240"


@router.post("/uploads", response_model=PresignedUpload, status_code=status.HTTP_201_CREATED)
def create_upload(body: UploadCreate, user: ActiveUser, db: DB) -> PresignedUpload:
    """A presigned POST for one file. library: PDF, Word (.docx, .doc), Excel (.xlsx, .xls), PowerPoint (.pptx,
    .ppt), notebooks (.ipynb), R scripts (.r), text (.txt), CSV and pictures (.jpg, .jpeg, .png, .webp), up to
    DSBA_MAX_UPLOAD_MB; forum_image: PNG, JPEG, WebP, GIF up to DSBA_MAX_IMAGE_MB; newsletter_image (people who
    manage the newsletter) and bug_screenshot (anyone signed in): PNG, JPEG, WebP up to DSBA_MAX_IMAGE_MB; board
    (a file on a board card): the library's types and GIF, up to DSBA_MAX_UPLOAD_MB; note_file: the library's types
    and GIF, up to DSBA_MAX_UPLOAD_MB, while the student's notebooks have room; career_logo: PNG, JPEG, WebP up to
    DSBA_MAX_IMAGE_MB. The extension must match the declared type (for .ipynb and .r, `application/octet-stream` is
    accepted too). POST `fields` and then the file as `file` to `url`, then call /uploads/{id}/complete. 20 uploads
    per hour; note files apart, with the hourly limit admins set (60 to start). Every upload also counts against the
    person's and the hub's daily budgets (1 GB and 20 GB to start; Manage → Numbers): over either, 429 rate_limited.

    Errors: unsupported_type (422), too_large (422), too_many_pending (409: a student already has 10 files waiting
    for review; library only), storage_full (409: board only), notes_full (409: note_file only), rate_limited (429),
    forbidden (403: no library.upload, no forum.post for a forum picture, no newsletter.manage for a newsletter
    picture, no career.edit for a logo), feature_off (404: the library, its uploads, the forum, the newsletter,
    the boards, the notebook or Career Navigator are switched off)."""
    purpose = UploadPurpose(body.purpose)
    svc.require_features(db, user, purpose)
    svc.require_box(user, purpose)
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
    picture: everyone once a published issue shows it, people who manage the newsletter always. A module's art:
    everyone while a module students see shows it, people who edit modules always. A bug screenshot: admins. 404
    otherwise; feature_off while the forum or the newsletter is off for the viewer."""
    url = svc.media_redirect_url(db, upload_id, user)
    return RedirectResponse(url, status_code=status.HTTP_302_FOUND, headers={"Cache-Control": MEDIA_CACHE})


# ── Manage: the upload budgets (admins) ──


@router.get("/admin/uploads", response_model=UploadLimitsOut)
def upload_limits(user: Admin, db: DB) -> UploadLimitsOut:
    """The hub's and each account's upload budgets per 24 hours, and the bytes uploads declared in the last 24 hours.
    Admins only."""
    return upload_budget.numbers(db)


@router.put("/admin/uploads", response_model=UploadLimitsOut)
def set_upload_limits(body: UploadLimitsIn, request: Request, user: Admin, db: DB) -> UploadLimitsOut:
    """Set the megabytes the whole hub (1 GB to 1 TB) and each account (10 MB to 100 GB) may upload in 24 hours.
    Admins only. Audited (`uploads.limits`)."""
    upload_budget.set_limits(db, user, body, client_ip(request))
    db.commit()
    return upload_budget.numbers(db)
