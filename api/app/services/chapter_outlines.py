"""Chapters' study-guide outlines: what each module's study guide says a chapter covers (its learning outcomes, main
topics and key terms), so Claude tags a past paper's questions by what the chapter teaches, not by its title alone.

They are seed data (app/seed/data/chapter_outlines.json, written from the study guides in the library), one entry a
module:

    {"module": "economics", "source": "EC1002 Introduction to economics, subject guide (2023)",
     "chapters": [{"id": "tyiz8fqt", "title": "Elasticity", "guide": "Chapter 3: Elasticity",
                   "outcomes": ["..."], "topics": ["..."], "terms": ["..."]}],
     "unmatched": [{"id": "yd2a8pzt", "title": "Excel (recommended course)", "why": "..."}]}

The seed writes each listed chapter's outline as plain text (render()) to chapters.outline, every time, so a better
file reaches every environment; a chapter the file doesn't list keeps none."""

from __future__ import annotations

from collections.abc import Sequence
from typing import Any

from sqlalchemy.orm import Session

from app.models import Chapter

SEED_FILE = "chapter_outlines"
MAX_CHARS = 4000  # a chapter's rendered outline; longer is cut at a line


def _items(value: object) -> list[str]:
    return [v.strip() for v in value if isinstance(v, str) and v.strip()] if isinstance(value, list) else []


def render(entry: dict[str, Any], source: str | None = None) -> str | None:
    """A chapter's outline as the prompt shows it, or None when the entry says nothing."""
    lines = []
    guide = entry.get("guide")
    where = "; ".join(x for x in (source, guide if isinstance(guide, str) else None) if x)
    if where:
        lines.append(f"Study guide: {where}")
    for label, key in (("Learning outcomes", "outcomes"), ("Topics", "topics"), ("Key terms", "terms")):
        items = _items(entry.get(key))
        if items:
            lines.append(f"{label}: " + "; ".join(items))
    if len(lines) <= 1:
        return None
    text = "\n".join(lines)
    return text if len(text) <= MAX_CHARS else text[:MAX_CHARS].rsplit("\n", 1)[0]


def load(db: Session, modules: Sequence[dict[str, Any]]) -> int:
    """Each listed chapter's outline, on the chapters of the module the entry names. How many chapters changed."""
    changed = 0
    for module in modules:
        source = module.get("source") if isinstance(module.get("source"), str) else None
        for entry in module.get("chapters") or []:
            chapter = db.get(Chapter, entry.get("id")) if isinstance(entry.get("id"), str) else None
            if chapter is None or chapter.module_id != module.get("module"):
                continue
            outline = render(entry, source)
            if outline is not None and chapter.outline != outline:
                chapter.outline = outline
                changed += 1
    db.flush()
    return changed
