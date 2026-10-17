"""Site settings (the hub's own words and links: admins edit them) and the guides (holders of guides.edit edit them).
Both are public to read."""

from __future__ import annotations

from typing import Annotated

from fastapi import Request

from app.core.access import Box
from app.core.security import DB, client_ip, requires, requires_admin
from app.models import User
from app.routers._base import router_for
from app.schemas.guides import GuidesDoc, GuidesEditable, GuidesSave
from app.schemas.site import SiteDoc, SiteEditable, SiteSave
from app.services import documents
from app.services import site as svc

router = router_for("site")

Admin = Annotated[User, requires_admin()]
GuideEditor = Annotated[User, requires(Box.guides_edit)]


@router.get("/site", response_model=SiteDoc)
def site(db: DB) -> SiteDoc:
    """The hub's own words and links: the footer, About, the sidebar's links to BIBF and the University."""
    return svc.site(db)


@router.get("/site/edit", response_model=SiteEditable)
def site_for_editing(db: DB, _: Admin) -> SiteEditable:
    """The site settings with the version a save names (0 until the first save)."""
    return SiteEditable.model_validate(documents.editable(db, svc.SITE), from_attributes=True)


@router.put("/site", response_model=SiteEditable)
def save_site(body: SiteSave, request: Request, user: Admin, db: DB) -> SiteEditable:
    """Save the site settings, if nobody saved them since `version`. Audited with what changed, before and after.

    Errors: site_changed (409: someone saved them since: load them again), invalid_input (422: a field that doesn't
    fit, a link that isn't https://, a module that doesn't exist, an id used twice)."""
    out = svc.save_site(db, user, body.data, body.version, client_ip(request))
    db.commit()
    return SiteEditable.model_validate(out, from_attributes=True)


@router.get("/guides", response_model=GuidesDoc)
def guides(db: DB) -> GuidesDoc:
    """Start here, Results day and Choosing your electives."""
    return svc.guides(db)


@router.get("/guides/edit", response_model=GuidesEditable)
def guides_for_editing(db: DB, _: GuideEditor) -> GuidesEditable:
    """The guides with the version a save names (0 until the first save)."""
    return GuidesEditable.model_validate(documents.editable(db, svc.GUIDES), from_attributes=True)


@router.put("/guides", response_model=GuidesEditable)
def save_guides(body: GuidesSave, request: Request, user: GuideEditor, db: DB) -> GuidesEditable:
    """Save every guide, if nobody saved them since `version`. Audited with what changed, before and after.

    Errors: guides_changed (409: someone saved them since: load them again), invalid_input (422: a field that doesn't
    fit, a link that isn't https:// or a page of the Hub, a step id used twice)."""
    out = svc.save_guides(db, user, body.data, body.version, client_ip(request))
    db.commit()
    return GuidesEditable.model_validate(out, from_attributes=True)
