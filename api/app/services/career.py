"""Career Navigator: the one document behind the page, and its editor (holders of career.edit).

- public_doc(): what the page shows. Hidden tracks, employers, certificates, roles and checklist items are left out,
  and so is every reference to them, so the page never links to something it doesn't show.
- save(): the whole document, if nobody saved it since the version the editor loaded (409 career_changed). Each save
  is audited with the parts it changed, before and after; for lists, only the items that changed.
- Logos are uploads (purpose career_logo). A logo the document uses is attached; one it stops using goes back to
  uploaded, and the daily sweep deletes it.
Services leave the commit to the handler."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy import update
from sqlalchemy.orm import Session

from app.core.access import Box
from app.core.errors import conflict, invalid, not_found
from app.core.links import json_size
from app.core.time import utcnow
from app.models import ContentDoc, Upload, UploadPurpose, UploadStatus, User
from app.schemas.career import (
    CareerCert,
    CareerContent,
    CareerDoc,
    CareerEditable,
    CareerSave,
    ChecklistCert,
    CloseCert,
    CloseStep,
)
from app.services import access
from app.services.accounts import public_user
from app.services.content import record
from app.services.modules import unknown_modules
from app.services.storage import Storage, get_storage
from app.services.uploads import IMAGE_CONTENT_TYPES, file_type_for

CAREER_KEY = "career"
MAX_BYTES = 512 * 1024  # as JSON; the starting document is about 40 KB
CHANGED = "Someone saved Career Navigator after you opened it. Load it again, then make your changes."


def stored(doc: CareerDoc) -> dict[str, Any]:
    """The document as it is stored: camelCase JSON with every field, nulls included (`featured` and `furtherStudy`
    must be present, even empty), so it reads back exactly as it was written."""
    return doc.model_dump(mode="json", by_alias=True)


# ── reading ──────────────────────────────────────────────────────────────────────────────────


def public_doc(doc: CareerDoc) -> CareerDoc:
    """The document without its hidden parts, or anything that points at them."""
    tracks = [t for t in doc.tracks if not t.hidden]
    certs = [c for c in doc.certs if not c.hidden]
    roles = [r for r in doc.roles if not r.hidden]
    track_ids, cert_ids, role_ids = {t.id for t in tracks}, {c.id for c in certs}, {r.id for r in roles}

    def step(s: CloseStep | None) -> CloseStep | None:
        return None if isinstance(s, CloseCert) and s.cert not in cert_ids else s

    def cert(c: CareerCert) -> CareerCert:
        return c.model_copy(update={"roles": [r for r in c.roles if r in role_ids]})

    employers = [
        e.model_copy(update={"tracks": [t for t in e.tracks if t in track_ids]}) for e in doc.employers if not e.hidden
    ]
    shown_roles = [
        r.model_copy(update={"close": {k: v for k, v in r.close.items() if step(v) is not None}}) for r in roles
    ]
    skills = {k: s.model_copy(update={"close": step(s.close)}) for k, s in doc.skills.items()}
    checklist = [
        i.model_copy(update={"link": None}) if isinstance(i.link, ChecklistCert) and i.link.cert not in cert_ids else i
        for i in doc.checklist
        if not i.hidden
    ]
    return doc.model_copy(
        update={
            "tracks": tracks,
            "employers": employers,
            "certs": [cert(c) for c in certs],
            "roles": shown_roles,
            "skills": skills,
            "checklist": checklist,
        }
    )


def _row(db: Session, *, lock: bool = False) -> ContentDoc | None:
    return db.get(ContentDoc, CAREER_KEY, with_for_update=lock)


def content(db: Session) -> CareerContent:
    """What the public page shows, or no data until the document is loaded."""
    row = _row(db)
    if row is None:
        return CareerContent(data=None, updated_at=None)
    # Built without checking again: the featured competition may name a hidden certificate's logo.
    return CareerContent.model_construct(data=public_doc(CareerDoc.model_validate(row.data)), updated_at=row.updated_at)


def editable(db: Session) -> CareerEditable:
    """The whole document for its editors, hidden parts included."""
    row = _row(db)
    if row is None:
        return CareerEditable(data=None, version=0, updated_at=None, updated_by=None)
    editor = db.get(User, row.updated_by) if row.updated_by else None
    return CareerEditable(
        data=CareerDoc.model_validate(row.data),
        version=row.version,
        updated_at=row.updated_at,
        updated_by=public_user(editor),
    )


# ── saving ───────────────────────────────────────────────────────────────────────────────────


def _by_id(items: list[Any]) -> dict[str, Any]:
    return {i["id"]: i for i in items}


def _part_change(before: Any, after: Any) -> tuple[Any, Any]:
    """What changed in one part of the document, before and after. A list of items with ids keeps only the items that
    changed, came or went (and its order, when that changed); a map keeps only the keys that changed."""
    items = [*before, *after] if isinstance(before, list) and isinstance(after, list) else None
    if items is not None and all(isinstance(i, dict) and "id" in i for i in items):
        old, new = _by_id(before), _by_id(after)
        b = {"items": [i for k, i in old.items() if new.get(k) != i]}
        a = {"items": [i for k, i in new.items() if old.get(k) != i]}
        if [k for k in old if k in new] != [k for k in new if k in old]:
            b["order"], a["order"] = list(old), list(new)
        return b, a
    if isinstance(before, dict) and isinstance(after, dict):
        keys = [k for k in dict.fromkeys([*before, *after]) if before.get(k) != after.get(k)]
        return {k: before[k] for k in keys if k in before}, {k: after[k] for k in keys if k in after}
    return before, after


def audit_change(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    """The parts a save changed, with what each held before and after."""
    parts = [k for k in dict.fromkeys([*before, *after]) if before.get(k) != after.get(k)]
    out: dict[str, Any] = {"parts": parts, "before": {}, "after": {}}
    for part in parts:
        out["before"][part], out["after"][part] = _part_change(before.get(part), after.get(part))
    return out


def _logos(db: Session, doc: CareerDoc) -> None:
    """Every logo the document uses is a finished career_logo upload, now attached; the ones it no longer uses go
    back to uploaded, and the next sweep deletes them."""
    wanted = doc.logo_uploads()
    for upload_id in wanted:
        up = db.get(Upload, upload_id)
        if up is None or up.purpose != UploadPurpose.career_logo or up.status == UploadStatus.pending:
            raise invalid("logo", "A logo isn't uploaded yet, or was removed. Upload it again.")
    dropped = update(Upload).where(Upload.purpose == UploadPurpose.career_logo, Upload.status == UploadStatus.attached)
    if wanted:
        dropped = dropped.where(Upload.id.not_in(wanted))
    db.execute(dropped.values(status=UploadStatus.uploaded))
    if wanted:
        db.execute(update(Upload).where(Upload.id.in_(wanted)).values(status=UploadStatus.attached))


def save(db: Session, user: User, body: CareerSave, ip: str | None) -> CareerEditable:
    """Saves the whole document, if it is still at `body.version` (409 career_changed otherwise). Every module it names
    must exist; 512 KB of JSON at most. Audited with what changed."""
    data = stored(body.data)
    size = json_size(data)
    if size > MAX_BYTES:
        raise invalid("data", "Career Navigator is too large to save. Remove some employers or roles.")
    missing = unknown_modules(db, body.data.module_refs())
    if missing:
        raise invalid("data", f"There is no module “{missing[0]}”. Choose one from the list.")
    row = _row(db, lock=True)
    if (row.version if row else 0) != body.version:
        raise conflict("career_changed", CHANGED)
    before: dict[str, Any] = row.data if row else {}
    if row is not None and before == data:
        return editable(db)
    _logos(db, body.data)
    if row is None:
        row = ContentDoc(key=CAREER_KEY, version=0)
        db.add(row)
    row.data = data
    row.version += 1
    row.updated_at = utcnow()
    row.updated_by = user.id
    db.flush()
    record(db, user, "career.update", "content_doc", CAREER_KEY, "Career Navigator", ip, **audit_change(before, data))
    return editable(db)


# ── logos ────────────────────────────────────────────────────────────────────────────────────


def logo_url(db: Session, upload_id: uuid.UUID, viewer: User | None, storage: Storage | None = None) -> str:
    """A short-lived inline link to a Career Navigator logo: to everyone while the document uses it, and before that
    to its uploader and to the editors (the editor's preview). 404 for anything else."""
    up = db.get(Upload, upload_id)
    if up is None or up.purpose != UploadPurpose.career_logo or up.status == UploadStatus.pending:
        raise not_found("This logo doesn't exist.")
    ft = file_type_for(up.file_name, UploadPurpose.career_logo)
    if ft is None or ft.content_type not in IMAGE_CONTENT_TYPES or up.content_type != ft.content_type:
        raise not_found("This logo doesn't exist.")
    if up.status != UploadStatus.attached and not (
        access.can(viewer, Box.career_edit) or (viewer is not None and viewer.id == up.user_id)
    ):
        raise not_found("This logo doesn't exist.")
    st = storage or get_storage()
    return st.presigned_get(up.storage_key, file_name=up.file_name, content_type=ft.content_type, inline=True)
