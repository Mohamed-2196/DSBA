"""Spelling tolerance for search: when a query finds nothing, each word the hub has never used is read as the
closest word it has ("hypothisis" as "hypothesis"), by trigram similarity (the pg_trgm extension, migration 0044).

The words the hub knows are those of what students can find: module names, chapter and video titles, published
library titles, visible thread titles, calendar titles and published newsletter titles. They are read from those
tables when a correction is needed (a query that found nothing), so nothing has to be kept in step with them."""

from __future__ import annotations

import re
from typing import Any

from sqlalchemy import func, literal, select, union_all
from sqlalchemy.orm import Session

from app.models import (
    CalendarEvent,
    Chapter,
    ForumThread,
    IssueStatus,
    ItemStatus,
    Lesson,
    LibraryItem,
    Module,
    NewsletterIssue,
    PostStatus,
)

MIN_LENGTH = 4  # shorter words are left as typed: "lse" isn't a misspelt "use"
MIN_SIMILARITY = 0.4  # "hypothisis" ~ "hypothesis" 0.57, "exam" ~ "example" 0.44, "lagrange" ~ "language" 0.29
WORD_SPLIT = "[^[:alnum:]]+"
_WORD = re.compile(r"[^\W_]+")


def _vocabulary() -> Any:
    """Every lower-cased word of the titles students can find, once each (a subquery with one column, `w`)."""

    def words_of(column: Any, *where: Any) -> Any:
        word = func.regexp_split_to_table(func.lower(func.coalesce(column, "")), WORD_SPLIT).label("w")
        return select(word).where(*where)

    split = union_all(
        words_of(Module.name, Module.hidden.is_(False)),
        words_of(Module.short_name, Module.hidden.is_(False)),
        words_of(Chapter.title, Chapter.hidden.is_(False)),
        words_of(Lesson.title, Lesson.hidden.is_(False)),
        words_of(LibraryItem.title, LibraryItem.status == ItemStatus.published),
        words_of(ForumThread.title, ForumThread.status == PostStatus.visible),
        words_of(CalendarEvent.title),
        words_of(NewsletterIssue.title, NewsletterIssue.status == IssueStatus.published),
    ).subquery()
    return select(split.c.w).where(func.length(split.c.w) >= 3).distinct().subquery()


def corrections(db: Session, terms: list[str]) -> dict[str, str]:
    """{typed: meant} for the words of `terms` the hub doesn't use and that are close to one it does. Words with
    digits (module codes, years) and short words are never corrected."""
    candidates = [t for t in dict.fromkeys(terms) if len(t) >= MIN_LENGTH and t.isalpha()]
    if not candidates:
        return {}
    vocab = _vocabulary()
    known = set(db.scalars(select(vocab.c.w).where(vocab.c.w.in_(candidates))))
    found: dict[str, str] = {}
    for term in candidates:
        if term in known:
            continue
        score = func.similarity(vocab.c.w, literal(term))
        best = db.scalar(
            select(vocab.c.w)
            .where(score >= MIN_SIMILARITY)
            .order_by(score.desc(), func.abs(func.length(vocab.c.w) - len(term)), vocab.c.w)
            .limit(1)
        )
        if best:
            found[term] = best
    return found


def corrected_query(q: str, fixes: dict[str, str]) -> str:
    """`q` with each corrected word replaced (whole words, any case), the rest as typed."""
    if not fixes:
        return q
    return _WORD.sub(lambda m: fixes.get(m.group(0).lower(), m.group(0)), q)
