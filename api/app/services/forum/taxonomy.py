"""Where a thread lives: its category (exactly one) and up to three tags, as the prototype defined them
(web/src/features/forum/data/taxonomy.js). GET /forum/meta serves them and every write is checked against them.
Also the cohort a thread belongs to, which follows its category or else its module."""

from __future__ import annotations

from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ForumThread, Module
from app.schemas.forum import ForumMeta


@dataclass(frozen=True, slots=True)
class CategoryDef:
    id: str
    label: str
    short: str
    year: int | None
    blurb: str


@dataclass(frozen=True, slots=True)
class TagDef:
    id: str
    label: str


# Every thread lives in exactly one category, so category counts add up to the total.
CATEGORIES: tuple[CategoryDef, ...] = (
    CategoryDef("year-1", "Year 1", "Year 1", 1, "Maths, statistics, economics and business"),
    CategoryDef("year-2", "Year 2", "Year 2", 2, "Distribution theory, inference, programming and more"),
    CategoryDef("year-3", "Year 3", "Year 3", 3, "Machine learning, asset pricing and more"),
    CategoryDef("study-groups", "Study groups", "Study group", None, "Find people to revise with"),
    CategoryDef("general", "General", "General", None, "Exams, campus and everything else"),
)
CATEGORY_BY_ID = {c.id: c for c in CATEGORIES}
# Categories without a cohort: their threads without a module are forum-wide (every year sees them).
FORUM_WIDE_CATEGORIES = tuple(c.id for c in CATEGORIES if c.year is None)

TAGS: tuple[TagDef, ...] = (
    TagDef("exam-prep", "Exam prep"),
    TagDef("past-papers", "Past papers"),
    TagDef("coursework", "Coursework"),
    TagDef("formula-sheet", "Formula sheets"),
    TagDef("r", "R"),
    TagDef("python", "Python"),
    TagDef("excel", "Excel"),
    TagDef("exams", "Exam rules"),
    TagDef("calculators", "Calculators"),
    TagDef("module-choice", "Module choice"),
    TagDef("campus", "Campus"),
    TagDef("lost-and-found", "Lost and found"),
)
TAG_BY_ID = {t.id: t for t in TAGS}
MAX_TAGS = 3


def category_for_year(year: int | None) -> str | None:
    """'year-2' for 2, None otherwise."""
    return f"year-{year}" if year in (1, 2, 3) else None


def forum_meta() -> ForumMeta:
    return ForumMeta.model_validate(
        {
            "categories": [
                {"id": c.id, "label": c.label, "short": c.short, "year": c.year, "blurb": c.blurb} for c in CATEGORIES
            ],
            "tags": [{"id": t.id, "label": t.label} for t in TAGS],
            "max_tags": MAX_TAGS,
        }
    )


def place(category: str | None, module: Module | None, *, module_wins: bool) -> tuple[str, Module | None]:
    """Where a thread lives. A year category that disagrees with the module's year follows the module when the module
    was the person's choice, and drops the module when the category was (as the prototype's composer does)."""
    if category is None:
        return (category_for_year(module.year) if module else None) or "general", module
    cat = CATEGORY_BY_ID[category]
    if module is not None and cat.year is not None and cat.year != module.year:
        if module_wins:
            return category_for_year(module.year) or category, module
        return category, None
    return category, module


def thread_year(db: Session, t: ForumThread) -> int | None:
    """The thread's cohort: its category's year, else its module's (None: forum-wide)."""
    cat = CATEGORY_BY_ID.get(t.category)
    if cat is not None and cat.year is not None:
        return cat.year
    return db.scalar(select(Module.year).where(Module.id == t.module_id)) if t.module_id else None
