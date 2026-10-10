"""The module catalogue and lessons. Owner: content agent (first version by the lead)."""

from __future__ import annotations

from typing import Any

from sqlalchemy import func, select

from app.core.errors import not_found
from app.core.pagination import YearParam
from app.core.security import DB
from app.models import ItemStatus, LibraryItem, Module
from app.routers._base import router_for
from app.schemas.modules import ModuleDetail, ModuleSummary

router = router_for("modules")


def _summary(m: Module, library_count: int) -> dict[str, Any]:
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


def _library_counts(db: DB) -> dict[str, int]:
    rows = db.execute(
        select(LibraryItem.module_id, func.count())
        .where(LibraryItem.status == ItemStatus.published, LibraryItem.module_id.is_not(None))
        .group_by(LibraryItem.module_id)
    ).all()
    return {str(mid): int(n) for mid, n in rows}


@router.get("/modules", response_model=list[ModuleSummary])
def list_modules(db: DB, year: YearParam | None = None) -> list[ModuleSummary]:
    q = select(Module).order_by(Module.position, Module.id)
    if year is not None:
        q = q.where(Module.year == year)
    counts = _library_counts(db)
    return [ModuleSummary.model_validate(_summary(m, counts.get(m.id, 0))) for m in db.scalars(q)]


@router.get("/modules/{module_id}", response_model=ModuleDetail)
def get_module(module_id: str, db: DB) -> ModuleDetail:
    m = db.get(Module, module_id)
    if m is None:
        raise not_found("This module doesn't exist.")
    count = _library_counts(db).get(m.id, 0)
    return ModuleDetail.model_validate({**_summary(m, count), "resources": m.resources, "chapters": m.chapters})
