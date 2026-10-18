"""Newsletter pictures. Someone who manages the newsletter uploads a picture (POST /uploads, purpose newsletter_image)
and the issue shows it as its cover art or a section's figure, '/api/v1/media/<id>'.

When an issue is saved, every uploaded picture it shows must be a newsletter picture that was checked (422 on the
field otherwise), and becomes attached to the issue (uploads.newsletter_issue_id): the daily sweep keeps it. A
picture two issues show belongs to the one saved last. Pictures an issue stops showing, or a deleted issue showed,
are released: they move to another issue that shows them, stay while the newsletter's settings offer them to the
editor (newsletter_settings.py), or go back to 'uploaded' and the sweep removes them a day later. /media serves a
newsletter picture to everyone once a published issue shows it (uploads.in_published_issue).
Services leave the commit to the handler."""

from __future__ import annotations

import uuid
from collections.abc import Sequence

from sqlalchemy import Text, cast, or_, select
from sqlalchemy.orm import Session

from app.core.errors import invalid
from app.core.links import MEDIA_PATH, media_path
from app.models import NewsletterIssue, Upload, UploadPurpose, UploadStatus
from app.schemas.newsletter import IssueCover, IssueSection
from app.services import newsletter_settings

NOT_A_PICTURE = "Upload this picture again: it isn't one of the newsletter's pictures."


def pictures(cover: IssueCover, sections: Sequence[IssueSection]) -> dict[str, uuid.UUID]:
    """The uploaded pictures an issue shows, by the field that shows them ('cover.art', 'sections.2.figure.src')."""
    found: dict[str, uuid.UUID] = {}
    if cover.art is not None and (m := MEDIA_PATH.fullmatch(cover.art.strip())):
        found["cover.art"] = uuid.UUID(m.group(1))
    for i, s in enumerate(sections):
        if s.figure is not None and (m := MEDIA_PATH.fullmatch(s.figure.src.strip())):
            found[f"sections.{i}.figure.src"] = uuid.UUID(m.group(1))
    return found


def check(db: Session, shown: dict[str, uuid.UUID]) -> list[Upload]:
    """The uploads behind `shown`, locked; 422 invalid_input on the first field whose picture isn't a checked
    newsletter picture."""
    if not shown:
        return []
    ids = set(shown.values())
    uploads = {u.id: u for u in db.scalars(select(Upload).where(Upload.id.in_(ids)).with_for_update())}
    for field, upload_id in shown.items():
        up = uploads.get(upload_id)
        if (
            up is None
            or up.purpose != UploadPurpose.newsletter_image
            or up.status not in (UploadStatus.uploaded, UploadStatus.attached)
        ):
            raise invalid(field, NOT_A_PICTURE)
    return list(uploads.values())


def attach(db: Session, issue: NewsletterIssue, uploads: Sequence[Upload]) -> None:
    """The pictures the issue shows now belong to it; those it no longer shows are released."""
    for up in uploads:
        up.status = UploadStatus.attached
        up.newsletter_issue_id = issue.id
    release(db, issue, keep={up.id for up in uploads})


def _other_issue_showing(db: Session, upload_id: uuid.UUID, issue_id: uuid.UUID) -> uuid.UUID | None:
    path = f"%{media_path(upload_id)}%"
    return db.scalar(
        select(NewsletterIssue.id)
        .where(
            NewsletterIssue.id != issue_id,
            or_(cast(NewsletterIssue.cover, Text).like(path), cast(NewsletterIssue.sections, Text).like(path)),
        )
        .order_by(NewsletterIssue.created_at.desc())
        .limit(1)
    )


def release(db: Session, issue: NewsletterIssue, keep: set[uuid.UUID] | None = None) -> None:
    """The issue's pictures outside `keep` (all of them for a deleted issue) move to another issue that shows them,
    stay while the newsletter's settings offer them, or go back to 'uploaded' for the sweep."""
    held = db.scalars(
        select(Upload).where(
            Upload.newsletter_issue_id == issue.id,
            Upload.purpose == UploadPurpose.newsletter_image,
            Upload.id.not_in(keep or set()),
        )
    ).all()
    still_offered = newsletter_settings.offered(db) if held else set()
    for up in held:
        other = _other_issue_showing(db, up.id, issue.id)
        up.newsletter_issue_id = other
        if other is None and up.id not in still_offered:
            up.status = UploadStatus.uploaded
