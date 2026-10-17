"""Where a thread lives: its category (exactly one) and up to three tags. Both are tables that moderators edit in
Manage → Forum (forum/settings.py), with the forum's guidelines and tips; GET /forum/meta serves them all, and every
write is checked against them. A retired category or tag is no longer offered, and the threads that have it keep it.
Also the cohort a thread belongs to, which follows its category or else its module."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ForumCategory, ForumTag, ForumThread, Module
from app.schemas.forum import ForumCategoryOut, ForumDoc, ForumMeta, ForumTagOut
from app.services import documents
from app.services.documents import Kind

MAX_TAGS = 3

FORUM: Kind[ForumDoc] = Kind(
    key="forum",
    model=ForumDoc,
    seed="forum",
    title="Forum settings",
    action="forum.settings",
    changed="forum_changed",
    changed_message="Someone saved the forum's settings after you opened them. Load them again, then make your "
    "changes.",
)


@dataclass(frozen=True, slots=True)
class Taxonomy:
    """The categories and tags in their order (retired ones too), and where a thread goes when no year fits it."""

    categories: Sequence[ForumCategory]
    tags: Sequence[ForumTag]
    default_category: str

    def category(self, category_id: str | None) -> ForumCategory | None:
        return next((c for c in self.categories if c.id == category_id), None)

    def tag(self, tag_id: str) -> ForumTag | None:
        return next((t for t in self.tags if t.id == tag_id), None)

    def for_year(self, year: int | None) -> str | None:
        """The first category for that cohort that isn't retired, or None."""
        return next((c.id for c in self.categories if c.year is not None and c.year == year and not c.retired), None)


def categories(db: Session) -> list[ForumCategory]:
    return list(db.scalars(select(ForumCategory).order_by(ForumCategory.position, ForumCategory.id)))


def tags(db: Session) -> list[ForumTag]:
    return list(db.scalars(select(ForumTag).order_by(ForumTag.position, ForumTag.id)))


def doc(db: Session) -> ForumDoc:
    return documents.current(db, FORUM)


def load(db: Session) -> Taxonomy:
    return Taxonomy(categories(db), tags(db), doc(db).default_category)


def category_out(c: ForumCategory) -> ForumCategoryOut:
    return ForumCategoryOut.model_validate(c, from_attributes=True)


def tag_out(t: ForumTag) -> ForumTagOut:
    return ForumTagOut.model_validate(t, from_attributes=True)


def forum_meta(db: Session) -> ForumMeta:
    words = doc(db)
    return ForumMeta(
        categories=[category_out(c) for c in categories(db)],
        tags=[tag_out(t) for t in tags(db)],
        max_tags=MAX_TAGS,
        default_category=words.default_category,
        guidelines=words.guidelines,
        tips=words.tips,
    )


def place(t: Taxonomy, category: str | None, module: Module | None, *, module_wins: bool) -> tuple[str, Module | None]:
    """Where a thread lives. Without a category: its module's year's, else the default. A year category that
    disagrees with the module's year follows the module when the module was the person's choice, and drops the
    module when the category was."""
    if category is None:
        return (t.for_year(module.year) if module else None) or t.default_category, module
    cat = t.category(category)
    if module is not None and cat is not None and cat.year is not None and cat.year != module.year:
        if module_wins:
            return t.for_year(module.year) or category, module
        return category, None
    return category, module


def thread_year(db: Session, t: ForumThread) -> int | None:
    """The thread's cohort: its category's year, else its module's (None: forum-wide)."""
    year = db.scalar(select(ForumCategory.year).where(ForumCategory.id == t.category))
    if year is not None:
        return year
    return db.scalar(select(Module.year).where(Module.id == t.module_id)) if t.module_id else None
