"""The content area's shared rules (library, calendar, newsletter, career), and the Career Navigator document.

- apply_patch(): one way to apply a PATCH body (fields that are not sent stay; null clears what may be cleared).
- record(): every audit row about content names its target in `data.title`, for the activity log (ST-9).
Services leave the commit to the handler (CQ-9)."""

from __future__ import annotations

import logging
from collections.abc import Iterable
from typing import Any

from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session

from app.core.errors import invalid
from app.core.links import json_size
from app.core.time import utcnow
from app.models import ContentDoc, User
from app.schemas.career import CareerDoc
from app.schemas.misc import CareerContent
from app.services import audit
from app.services.modules import unknown_modules

log = logging.getLogger("dsba.content")

CAREER_KEY = "career"
CAREER_MAX_BYTES = 512 * 1024  # as JSON; the launch document is about 40 KB


def apply_patch(
    obj: object,
    body: BaseModel,
    fields: Iterable[str],
    *,
    clearable: Iterable[str] = (),
    blank: Iterable[str] = (),
) -> list[str]:
    """Copies the fields the client sent from `body` onto `obj`, and returns the names that changed. A field that
    isn't sent stays as it is. Null or "" empties a field: to None in `clearable`, to "" in `blank` (text columns that
    are never null); for the other fields (required columns) it is ignored. Typed parts (models, lists of models) are
    stored as camelCase JSON without their empty optional fields."""
    sent, may_clear, to_blank = body.model_fields_set, set(clearable), set(blank)
    changed: list[str] = []
    for field in fields:
        if field not in sent:
            continue
        value = getattr(body, field)
        if value is None or value == "":
            if field in to_blank:
                value = ""
            elif field in may_clear:
                value = None
            else:
                continue
        if isinstance(value, BaseModel):
            value = value.model_dump(mode="json", by_alias=True, exclude_none=True)
        elif isinstance(value, list) and value and isinstance(value[0], BaseModel):
            value = [v.model_dump(mode="json", by_alias=True, exclude_none=True) for v in value]
        if value != getattr(obj, field):
            setattr(obj, field, value)
            changed.append(field)
    return changed


def record(
    db: Session,
    actor: User,
    action: str,
    target_type: str,
    target_id: object,
    title: str,
    ip: str | None,
    **data: Any,
) -> None:
    """An audit row about content: `data.title` names what it was about ("published “ST2133 notes”")."""
    audit.record(db, actor, action, target_type, target_id, {"title": title, **data}, ip=ip)


# ── the Career Navigator ─────────────────────────────────────────────────────────────────────


def career(db: Session) -> CareerContent:
    """The document, or no data until it is loaded. A stored document that no longer fits the schema (written
    before it existed) is served as no data rather than breaking the page."""
    doc = db.get(ContentDoc, CAREER_KEY)
    if doc is None:
        return CareerContent(data=None, updated_at=None)
    try:
        data: CareerDoc | None = CareerDoc.model_validate(doc.data)
    except ValidationError:
        log.warning("the stored %s document doesn't fit its schema: served as no data", doc.key)
        data = None
    return CareerContent(data=data, updated_at=doc.updated_at)


def stored_career(body: CareerDoc) -> dict[str, Any]:
    """The document as it is stored: camelCase JSON with every field, nulls included (`featured` and `furtherStudy`
    must be present, even empty), so it reads back exactly as it was written."""
    return body.model_dump(mode="json", by_alias=True)


def replace_career(db: Session, user: User, body: CareerDoc, ip: str | None) -> CareerContent:
    """Replaces the whole document (admins). Every module it names must exist; 512 KB of JSON at most."""
    data = stored_career(body)
    size = json_size(data)
    if size > CAREER_MAX_BYTES:
        raise invalid("request", "This document is too large.")
    missing = unknown_modules(db, body.module_refs())
    if missing:
        raise invalid("request", f"There is no module “{missing[0]}”.")
    doc = db.get(ContentDoc, CAREER_KEY)
    if doc is None:
        doc = ContentDoc(key=CAREER_KEY)
        db.add(doc)
    doc.data = data
    doc.updated_at = utcnow()
    doc.updated_by = user.id
    record(db, user, "career.update", "content_doc", CAREER_KEY, "Career Navigator", ip, bytes=size)
    return CareerContent(data=body, updated_at=doc.updated_at)
