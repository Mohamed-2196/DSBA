"""The newsletter's settings (holders of newsletter.manage edit them in Manage → Newsletter): the line under its name
and the pictures the issue editor offers, one document edited whole (services/documents.py).

An offered picture is a picture of the web app or an uploaded newsletter picture (POST /uploads, purpose
newsletter_image). An uploaded one is kept while the settings offer it: it is attached (with no issue of its own), so
the daily sweep leaves it; one they stop offering goes back to 'uploaded' unless an issue shows it, and the sweep
removes it a day later (newsletter_images.release keeps the offered ones too). Services leave the commit to the
handler."""

from __future__ import annotations

import uuid

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import invalid
from app.core.links import MEDIA_PATH
from app.models import Upload, UploadPurpose, UploadStatus, User
from app.schemas.newsletter import NewsletterSettings, NewsletterSettingsEditable
from app.services import documents
from app.services.documents import Kind

NEWSLETTER: Kind[NewsletterSettings] = Kind(
    key="newsletter",
    model=NewsletterSettings,
    seed="newsletter_settings",
    title="Newsletter settings",
    action="newsletter.settings",
    changed="newsletter_settings_changed",
    changed_message="Someone saved the newsletter's settings after you opened them. Load them again, then make your "
    "changes.",
)
NOT_A_PICTURE = "Upload this picture again: it isn't one of the newsletter's pictures."


def settings(db: Session) -> NewsletterSettings:
    return documents.current(db, NEWSLETTER)


def editable(db: Session) -> NewsletterSettingsEditable:
    return NewsletterSettingsEditable.model_validate(documents.editable(db, NEWSLETTER), from_attributes=True)


def uploaded_pictures(doc: NewsletterSettings) -> dict[int, uuid.UUID]:
    """The uploaded pictures the settings offer, by their place in the list."""
    found: dict[int, uuid.UUID] = {}
    for i, p in enumerate(doc.pictures):
        if m := MEDIA_PATH.fullmatch(p.src.strip()):
            found[i] = uuid.UUID(m.group(1))
    return found


def offered(db: Session) -> set[uuid.UUID]:
    """The uploaded pictures the saved settings offer."""
    return set(uploaded_pictures(settings(db)).values())


def save(db: Session, user: User, doc: NewsletterSettings, version: int, ip: str | None) -> NewsletterSettingsEditable:
    """Saves the settings (409 newsletter_settings_changed when someone saved them since `version`), audited with what
    changed. Every uploaded picture offered must be a checked newsletter picture (422 on its src); the ones offered
    are kept, and the ones dropped are released."""
    wanted = uploaded_pictures(doc)
    uploads = {u.id: u for u in db.scalars(select(Upload).where(Upload.id.in_(set(wanted.values()))))} if wanted else {}
    for i, upload_id in wanted.items():
        up = uploads.get(upload_id)
        if (
            up is None
            or up.purpose != UploadPurpose.newsletter_image
            or up.status not in (UploadStatus.uploaded, UploadStatus.attached)
        ):
            raise invalid(f"data.pictures.{i}.src", NOT_A_PICTURE)
    before = offered(db)
    out = documents.save(db, user, NEWSLETTER, doc, version, ip)
    for up in uploads.values():
        up.status = UploadStatus.attached
    dropped = before - set(wanted.values())
    if dropped:
        for up in db.scalars(select(Upload).where(Upload.id.in_(dropped))):
            if up.newsletter_issue_id is None:  # no issue shows it: the sweep may have it
                up.status = UploadStatus.uploaded
    db.flush()
    return NewsletterSettingsEditable.model_validate(out, from_attributes=True)
