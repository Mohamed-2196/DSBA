"""The module catalogue as students see it: summaries with their library counts, the lessons in the order lesson keys
count them, and the one rule for "a module id from a request". Hidden modules, chapters and lessons are left out."""

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


def _shown(entry: object) -> bool:
    return isinstance(entry, dict) and not entry.get("hidden")


def _hidden(entry: object) -> bool:
    return isinstance(entry, dict) and bool(entry.get("hidden"))


def in_key_order(chapters: object) -> list[tuple[int, list[int]]]:
    """Where lesson keys count from: (stored chapter index, its stored video indices) in key order. The visible
    chapters come first, then the hidden ones, each in the order the editors set; the same for the videos in a
    chapter. So the lessons students see are numbered 0, 1, 2... and a hidden one keeps a key of its own (past the
    visible ones) that its notes and cards follow when it is shown again."""
    if not isinstance(chapters, list):
        return []
    order: list[tuple[int, list[int]]] = []
    for c in [i for i, ch in enumerate(chapters) if _shown(ch)] + [i for i, ch in enumerate(chapters) if _hidden(ch)]:
        videos = chapters[c].get("videos")
        videos = videos if isinstance(videos, list) else []
        shown = [i for i, v in enumerate(videos) if _shown(v)]
        order.append((c, shown + [i for i, v in enumerate(videos) if _hidden(v)]))
    return order


def visible_chapters(chapters: object) -> list[dict[str, Any]]:
    """The chapters students see, each with the videos they see, in key order (without the `hidden` flags)."""
    if not isinstance(chapters, list):
        return []
    out: list[dict[str, Any]] = []
    for ch in chapters:
        if not _shown(ch):
            continue
        videos = ch.get("videos") if isinstance(ch.get("videos"), list) else []
        shown = [{k: v for k, v in video.items() if k != "hidden"} for video in videos if _shown(video)]
        out.append({**{k: v for k, v in ch.items() if k != "hidden"}, "videos": shown})
    return out


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
    chapters = visible_chapters(m.chapters)
    return {
        "id": m.id,
        "unit_code": m.unit_code,
        "name": m.name,
        "short_name": m.short_name,
        "year": m.year,
        "description": m.description,
        "icon": m.icon,
        "chapter_count": len(chapters),
        "lesson_count": sum(len(c["videos"]) for c in chapters),
        "library_count": library_count,
    }


def list_modules(db: Session, year: int | None, *, library: bool) -> list[ModuleSummary]:
    """`library`: whether the library is on for the viewer. Without it, the library counts are None."""
    q = select(Module).where(Module.hidden.is_(False)).order_by(Module.position, Module.id)
    if year is not None:
        q = q.where(Module.year == year)
    counts = published_counts(db) if library else {}
    return [ModuleSummary.model_validate(_summary(m, counts.get(m.id, 0) if library else None)) for m in db.scalars(q)]


def module_detail(db: Session, module_id: str, *, library: bool) -> ModuleDetail:
    """`library`: as for list_modules()."""
    m = db.get(Module, module_id)
    if m is None or m.hidden:
        raise not_found("This module doesn't exist.")
    count = published_counts(db, m.id).get(m.id, 0) if library else None
    return ModuleDetail.model_validate(
        {**_summary(m, count), "resources": m.resources, "chapters": visible_chapters(m.chapters)}
    )
