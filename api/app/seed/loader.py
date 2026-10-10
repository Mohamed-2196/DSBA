"""Loads the reference content exported from the prototype (app/seed/data/*.json; web/scripts/export-seed.mjs).

Idempotent: running it again adds what is missing and never overwrites what moderators changed through the API.
Modules are the exception: they have no editing API, so the seed file is their source of truth (upsert).
Owner: content agent (modules section by the lead)."""

from __future__ import annotations

import json
from collections.abc import Callable
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from app.models import Module

DATA = Path(__file__).parent / "data"


def read(name: str) -> Any:
    return json.loads((DATA / f"{name}.json").read_text(encoding="utf-8"))


def load_modules(db: Session) -> int:
    n = 0
    for m in read("modules"):
        row = db.get(Module, m["id"]) or Module(id=m["id"])
        row.unit_code = m.get("unitCode")
        row.name = m["name"]
        row.short_name = m["shortName"]
        row.year = m["year"]
        row.description = m.get("description") or ""
        row.icon = m.get("icon")
        row.position = m.get("position", 0)
        row.resources = m.get("resources") or {}
        row.chapters = m.get("chapters") or []
        db.add(row)
        n += 1
    db.flush()
    return n


def _todo(db: Session) -> int:
    raise NotImplementedError


# Order matters: library links and calendar events refer to modules.
SECTIONS: dict[str, Callable[[Session], int]] = {
    "modules": load_modules,
    "calendar": _todo,
    "newsletter": _todo,
    "career": _todo,
    "library": _todo,
}


def load_all(db: Session, only: str | None = None) -> dict[str, int]:
    """-> {section: rows inserted or updated}."""
    report: dict[str, int] = {}
    for name, fn in SECTIONS.items():
        if only and name != only:
            continue
        try:
            report[name] = fn(db)
        except NotImplementedError:
            report[name] = -1  # not built yet
    return report
