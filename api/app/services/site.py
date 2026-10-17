"""Site settings (admins) and the guides (holders of guides.edit): two documents edited as a whole in Manage
(services/documents.py). Every module the site settings name must exist. Services leave the commit to the handler."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.errors import invalid
from app.models import User
from app.schemas.guides import GuidesDoc
from app.schemas.site import SiteDoc
from app.services import documents
from app.services.documents import Editable, Kind
from app.services.modules import unknown_modules

SITE: Kind[SiteDoc] = Kind(
    key="site",
    model=SiteDoc,
    seed="site",
    title="Site settings",
    action="site.update",
    changed="site_changed",
    changed_message="Someone saved the site settings after you opened them. Load them again, then make your changes.",
)
GUIDES: Kind[GuidesDoc] = Kind(
    key="guides",
    model=GuidesDoc,
    seed="guides",
    title="The guides",
    action="guides.update",
    changed="guides_changed",
    changed_message="Someone saved the guides after you opened them. Load them again, then make your changes.",
)


def site(db: Session) -> SiteDoc:
    return documents.current(db, SITE)


def save_site(db: Session, user: User, doc: SiteDoc, version: int, ip: str | None) -> Editable[SiteDoc]:
    """Saves the site settings (409 site_changed when someone saved them since `version`). Every module a student's
    notes are credited to must exist (422)."""
    missing = unknown_modules(db, doc.module_refs())
    if missing:
        raise invalid("data", f"There is no module “{missing[0]}”. Choose one from the list.")
    return documents.save(db, user, SITE, doc, version, ip)


def guides(db: Session) -> GuidesDoc:
    return documents.current(db, GUIDES)


def save_guides(db: Session, user: User, doc: GuidesDoc, version: int, ip: str | None) -> Editable[GuidesDoc]:
    """Saves every guide (409 guides_changed when someone saved them since `version`)."""
    return documents.save(db, user, GUIDES, doc, version, ip)
