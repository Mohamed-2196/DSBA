"""Chapters' study-guide outlines: what each module's study guide says a chapter covers (its learning outcomes, main
topics and key terms), so Claude tags a past paper's questions by what the chapter teaches, not by its title alone.

They are seed data (app/seed/data/chapter_outlines.json, written from the study guides in the library), one entry a
module:

    {"module": "economics", "source": "EC1002 Introduction to economics, subject guide (2023)",
     "chapters": [{"id": "tyiz8fqt", "title": "Elasticity", "guide": "Chapter 3: Elasticity",
                   "outcomes": ["..."], "topics": [{"id": "price-elasticity-of-demand", "title": "..."}],
                   "terms": ["..."]}],
     "unmatched": [{"id": "yd2a8pzt", "title": "Excel (recommended course)", "why": "..."}]}

The seed writes each listed chapter's outline as plain text (render(): its outcomes and key terms) to
chapters.outline, and its topics, in order, to chapter_topics, every time, so a better file reaches every environment;
a chapter the file doesn't list keeps what it has. A topic's id is made from its title (topic_id()) and the tags of
past questions name it (`<chapter id>:<topic id>` in app/seed/data/paper_questions.json): a topic the file drops goes,
and its tags' topics with it."""

from __future__ import annotations

import re
from collections.abc import Sequence
from typing import Any

from sqlalchemy.orm import Session

from app.models import Chapter, ChapterTopic
from app.schemas.modules import TOPIC_ID_MAX

SEED_FILE = "chapter_outlines"
MAX_CHARS = 4000  # a chapter's rendered outline; longer is cut at a line
TOPIC_ID_CUT = 48  # a topic id's characters before a '-2' that tells two of a chapter's titles apart
TOPIC_TITLE_MAX = 200  # chapter_topics.title
_NOT_ID = re.compile(r"[^a-z0-9]+")
_TOPIC_ID = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")


def topic_id(title: str, taken: set[str] | frozenset[str] = frozenset()) -> str:
    """A topic's id from its title: lower case, each run of characters other than a-z and 0-9 a hyphen, no hyphen at
    either end, cut to 48 characters (and no hyphen left at the end); '-2', '-3' after it when `taken` (the chapter's
    ids so far) has it. 'Opportunity cost, absolute and comparative advantage' ->
    'opportunity-cost-absolute-and-comparative-advant'."""
    base = _NOT_ID.sub("-", title.lower()).strip("-")[:TOPIC_ID_CUT].rstrip("-")
    out, n = base, 1
    while out in taken:
        n += 1
        out = f"{base}-{n}"
    return out


def _items(value: object) -> list[str]:
    return [v.strip() for v in value if isinstance(v, str) and v.strip()] if isinstance(value, list) else []


def render(entry: dict[str, Any], source: str | None = None) -> str | None:
    """A chapter's outline as the prompt shows it, or None when the entry says nothing."""
    lines = []
    guide = entry.get("guide")
    where = "; ".join(x for x in (source, guide if isinstance(guide, str) else None) if x)
    if where:
        lines.append(f"Study guide: {where}")
    for label, key in (("Learning outcomes", "outcomes"), ("Key terms", "terms")):
        items = _items(entry.get(key))
        if items:
            lines.append(f"{label}: " + "; ".join(items))
    if len(lines) <= 1:
        return None
    text = "\n".join(lines)
    return text if len(text) <= MAX_CHARS else text[:MAX_CHARS].rsplit("\n", 1)[0]


def topics_of(entry: dict[str, Any]) -> list[tuple[str, str]]:
    """A chapter entry's topics as (id, title), in order: each with a well-formed id the chapter hasn't given yet and
    a title."""
    out: dict[str, str] = {}
    for t in entry.get("topics") or []:
        if not isinstance(t, dict):
            continue
        tid, title = t.get("id"), t.get("title")
        if not isinstance(tid, str) or not isinstance(title, str) or not title.strip():
            continue
        if len(tid) <= TOPIC_ID_MAX and _TOPIC_ID.match(tid) and tid not in out:
            out[tid] = title.strip()[:TOPIC_TITLE_MAX]
    return list(out.items())


def _set_topics(chapter: Chapter, topics: list[tuple[str, str]]) -> bool:
    """The chapter's topics made these, in this order; whether anything changed."""
    if [(t.id, t.title) for t in chapter.topics] == topics:
        return False
    have = {t.id: t for t in chapter.topics}
    kept = []
    for position, (tid, title) in enumerate(topics):
        row = have.get(tid) or ChapterTopic(chapter_id=chapter.id, id=tid)
        row.position, row.title = position, title
        kept.append(row)
    chapter.topics = kept
    return True


def load(db: Session, modules: Sequence[dict[str, Any]]) -> int:
    """Each listed chapter's outline and topics, on the chapters of the module the entry names. How many chapters
    changed."""
    changed = 0
    for module in modules:
        source = module.get("source") if isinstance(module.get("source"), str) else None
        for entry in module.get("chapters") or []:
            chapter = db.get(Chapter, entry.get("id")) if isinstance(entry.get("id"), str) else None
            if chapter is None or chapter.module_id != module.get("module"):
                continue
            outline = render(entry, source)
            touched = outline is not None and chapter.outline != outline
            if touched:
                chapter.outline = outline
            if _set_topics(chapter, topics_of(entry)) or touched:
                changed += 1
    db.flush()
    return changed
