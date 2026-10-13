"""The module catalogue: summaries with their library counts, and the one rule for "a module id from a request"."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import invalid, not_found
from app.models import ItemStatus, LibraryItem, Module
from app.schemas.modules import ModuleDetail, ModuleSummary

MODULE_UNKNOWN = "Pick a module from the list."


def require_module(db: Session, module_id: str | None, field: str = "moduleId") -> Module | None:
    """The module a request names, None when it names none, or 422 on `field` when there is no such module
    (code quality review CQ-6: one rule and one message for every area)."""
    if module_id is None:
        return None
    module = db.get(Module, module_id)
    if module is None:
        raise invalid(field, MODULE_UNKNOWN)
    return module


def unknown_modules(db: Session, ids: Iterable[str]) -> list[str]:
    """The ids, among `ids`, that name no module (in the order given, once each)."""
    wanted = list(dict.fromkeys(ids))
    if not wanted:
        return []
    known = set(db.scalars(select(Module.id).where(Module.id.in_(wanted))))
    return [i for i in wanted if i not in known]


def published_counts(db: Session, module_id: str | None = None) -> dict[str, int]:
    """Published library items per module."""
    q = (
        select(LibraryItem.module_id, func.count())
        .where(LibraryItem.status == ItemStatus.published, LibraryItem.module_id.is_not(None))
        .group_by(LibraryItem.module_id)
    )
    if module_id is not None:
        q = q.where(LibraryItem.module_id == module_id)
    return {str(mid): int(n) for mid, n in db.execute(q).all()}


def _summary(m: Module, library_count: int | None) -> dict[str, Any]:
    return {
        "id": m.id,
        "unit_code": m.unit_code,
        "name": m.name,
        "short_name": m.short_name,
        "year": m.year,
        "description": m.description,
        "icon": m.icon,
        "chapter_count": len(m.chapters),
        "lesson_count": sum(len(c.get("videos", [])) for c in m.chapters),
        "library_count": library_count,
    }


def list_modules(db: Session, year: int | None, *, library: bool) -> list[ModuleSummary]:
    """`library`: whether the library is on for the viewer. Without it, the library counts are None."""
    q = select(Module).order_by(Module.position, Module.id)
    if year is not None:
        q = q.where(Module.year == year)
    counts = published_counts(db) if library else {}
    return [ModuleSummary.model_validate(_summary(m, counts.get(m.id, 0) if library else None)) for m in db.scalars(q)]


def module_detail(db: Session, module_id: str, *, library: bool) -> ModuleDetail:
    """`library`: as for list_modules()."""
    m = db.get(Module, module_id)
    if m is None:
        raise not_found("This module doesn't exist.")
    count = published_counts(db, m.id).get(m.id, 0) if library else None
    return ModuleDetail.model_validate({**_summary(m, count), "resources": m.resources, "chapters": m.chapters})
