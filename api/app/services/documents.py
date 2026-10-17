"""Documents edited as a whole in Manage and kept in content_docs: Site settings and the guides.

- current(): the saved document, or its starting content (app/seed/data/<seed>.json) until the first save.
- editable(): the same, with the version a save must name (0 until the first save) and who saved it last.
- save(): the whole document, if nobody saved it since the version the editor loaded (409 otherwise). Audited with the
  parts it changed, before and after.
Career Navigator keeps its own service (services/career.py): it attaches logos when it saves. Services leave the
commit to the handler."""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import datetime
from functools import cache
from pathlib import Path
from typing import Any, Generic, TypeVar

from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.core.errors import conflict, invalid
from app.core.links import json_size
from app.core.time import utcnow
from app.models import ContentDoc, User
from app.schemas.common import ErrorCode, UserPublic
from app.services.accounts import public_user
from app.services.content import record

T = TypeVar("T", bound=BaseModel)
SEED = Path(__file__).resolve().parents[1] / "seed" / "data"
MAX_BYTES = 256 * 1024  # as JSON; the starting documents are about 10 KB


@dataclass(frozen=True)
class Kind(Generic[T]):
    key: str  # content_docs.key
    model: type[T]
    seed: str  # its starting content: app/seed/data/<seed>.json
    title: str  # in the activity log: 'Site settings'
    action: str  # the audit action of a save: 'site.update'
    changed: ErrorCode  # the 409 when someone saved it since the editor loaded it
    changed_message: str


@dataclass(frozen=True)
class Editable(Generic[T]):
    data: T
    version: int
    updated_at: datetime | None
    updated_by: UserPublic | None


@cache
def _starting(seed: str) -> dict[str, Any]:
    data: dict[str, Any] = json.loads((SEED / f"{seed}.json").read_text(encoding="utf-8"))
    return data


def starting(kind: Kind[T]) -> T:
    """The starting content, checked against the document's schema: a seed file that doesn't fit fails loudly."""
    return kind.model.model_validate(_starting(kind.seed))


def _row(db: Session, key: str, *, lock: bool = False) -> ContentDoc | None:
    return db.get(ContentDoc, key, with_for_update=lock)


def current(db: Session, kind: Kind[T]) -> T:
    row = _row(db, kind.key)
    return kind.model.model_validate(row.data) if row is not None else starting(kind)


def editable(db: Session, kind: Kind[T]) -> Editable[T]:
    row = _row(db, kind.key)
    if row is None:
        return Editable(data=starting(kind), version=0, updated_at=None, updated_by=None)
    editor = db.get(User, row.updated_by) if row.updated_by else None
    return Editable(
        data=kind.model.model_validate(row.data),
        version=row.version,
        updated_at=row.updated_at,
        updated_by=public_user(editor),
    )


def stored(doc: BaseModel) -> dict[str, Any]:
    """The document as it is stored: camelCase JSON with every field, so it reads back exactly as it was written."""
    data: dict[str, Any] = doc.model_dump(mode="json", by_alias=True)
    return data


# ── audit ────────────────────────────────────────────────────────────────────────────────────


def _by_id(items: list[Any]) -> dict[str, Any]:
    return {i["id"]: i for i in items}


def _part_change(before: Any, after: Any) -> tuple[Any, Any]:
    """What changed in one part of a document, before and after. A list of items with ids keeps only the items that
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


# ── saving ───────────────────────────────────────────────────────────────────────────────────


def save(db: Session, user: User, kind: Kind[T], doc: T, version: int, ip: str | None) -> Editable[T]:
    """Saves the whole document, if it is still at `version` (409 `kind.changed` otherwise). Audited with what
    changed; saving what is already there changes nothing."""
    data = stored(doc)
    if json_size(data) > MAX_BYTES:
        raise invalid("data", f"{kind.title} is too large to save. Shorten some of its text.")
    row = _row(db, kind.key, lock=True)
    if (row.version if row else 0) != version:
        raise conflict(kind.changed, kind.changed_message)
    before: dict[str, Any] = row.data if row is not None else stored(starting(kind))
    if before == data:
        return editable(db, kind)
    if row is None:
        row = ContentDoc(key=kind.key, version=0)
        db.add(row)
    row.data = data
    row.version += 1
    row.updated_at = utcnow()
    row.updated_by = user.id
    db.flush()
    record(db, user, kind.action, "content_doc", kind.key, kind.title, ip, **audit_change(before, data))
    return editable(db, kind)
