"""Slugs and plain-text helpers shared by the features.

- slugify(), unique_slug(): a title as an address, free in its column.
- clashes_on(): whether an IntegrityError is a clash on a column's own unique constraint.
- insert_with_unique_slug(): the one way to insert a row with a slug or id made from its title: a free one, and a
  retry when a parallel request takes it first (a race answers 409 `retry` at worst; any other integrity error is
  raised as it is).
- clip(): text cut to a length with an ellipsis, at a word if asked.
- snippet(): plain text around the first match of a search's words.
- short_id(), has_latin(): titles without Latin letters (Arabic, digits only) get a short id, not 'file-2'
  (decision D8)."""

from __future__ import annotations

import re
import secrets
import unicodedata
from typing import Any

from psycopg.errors import UniqueViolation
from sqlalchemy import Column, PrimaryKeyConstraint, UniqueConstraint, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import InstrumentedAttribute, Session

from app.core.errors import conflict
from app.models.base import Base

SLUG_TRIES = 3
SNIPPET_RADIUS = 80
SHORT_ID_ALPHABET = "abcdefghijklmnopqrstuvwxyz0123456789"
SHORT_ID_LENGTH = 6  # 36^6: two billion


def slugify(value: str, max_len: int = 64) -> str:
    """'How do I find the MGF?' -> 'how-do-i-find-the-mgf' (cut at a word when it is too long)."""
    s = unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    if len(s) <= max_len:
        return s
    cut = s[:max_len]
    i = cut.rfind("-")
    return cut[:i] if i > max_len // 2 else cut


def unique_slug(db: Session, column: InstrumentedAttribute[str], value: str, fallback: str = "item") -> str:
    """slugify(value), with -2, -3, ... appended until it is free in `column`."""
    base = slugify(value) or fallback
    taken = set(db.scalars(select(column).where(column.like(f"{base}%"))))
    if base not in taken:
        return base
    n = 2
    while f"{base}-{n}" in taken:
        n += 1
    return f"{base}-{n}"


def clip(text: str, limit: int, *, at_word: bool = False) -> str:
    """`text` when it fits in `limit` characters, else cut with "…" to `limit` in all. `at_word` cuts at the last
    space in the second half, and drops the punctuation left before the ellipsis."""
    if len(text) <= limit:
        return text
    cut = text[: limit - 1]
    if at_word:
        space = cut.rfind(" ")
        if space > limit // 2:
            cut = cut[:space]
        cut = cut.rstrip(" ,.;:?!")
    return cut.rstrip() + "\u2026"


def snippet(text: str | None, terms: list[str], radius: int = SNIPPET_RADIUS) -> str | None:
    """About 2 x radius characters of plain text around the first match of any term, cut at word boundaries."""
    t = re.sub(r"\s+", " ", text or "").strip()
    if not t:
        return None
    low = t.lower()
    hits = [i for i in (low.find(term) for term in terms) if i >= 0]
    if not hits:
        if len(t) <= radius * 2:
            return t
        return clip(t, radius * 2 + 1, at_word=True)
    i = min(hits)
    start, end = max(0, i - radius), min(len(t), i + radius)
    if start > 0:
        space = t.find(" ", start, i)
        start = space + 1 if space >= 0 else start
    if end < len(t):
        space = t.rfind(" ", i, end)
        end = space if space > i else end
    return f"{'…' if start > 0 else ''}{t[start:end].strip()}{'…' if end < len(t) else ''}"


def has_latin(text: str) -> bool:
    """Whether `text` has a Latin letter to make a slug from ('سؤال عن ST2133' has; 'سؤال' and '2024' haven't)."""
    return re.search("[a-z]", slugify(text)) is not None


def short_id() -> str:
    """Six random letters or digits ('x3k9q2'): the slug part for a title without Latin letters."""
    return "".join(secrets.choice(SHORT_ID_ALPHABET) for _ in range(SHORT_ID_LENGTH))


def clashes_on(error: IntegrityError, column: InstrumentedAttribute[Any]) -> bool:
    """Whether `error` is a clash on the constraint that keeps `column` unique on its own (its unique constraint or
    the primary key), and not some other integrity error: a CHECK, a foreign key, another unique column."""
    col = column.property.columns[0]
    assert isinstance(col, Column)
    names = {
        constraint.name
        for constraint in col.table.constraints
        if isinstance(constraint, UniqueConstraint | PrimaryKeyConstraint) and list(constraint.columns) == [col]
    }
    if not names:
        raise ValueError(f"{col.table.name}.{col.name} has no unique constraint of its own")
    return isinstance(error.orig, UniqueViolation) and error.orig.diag.constraint_name in names


def insert_with_unique_slug(
    db: Session, obj: Base, column: InstrumentedAttribute[str], text: str, *, fallback: str
) -> None:
    """Sets `column` on `obj` to a free slug of `text` ('-2', '-3', ... when taken; `fallback` when `text` makes
    none) and inserts it. Two requests can both see a slug as free; the one that loses the race retries with a short
    random suffix, and after SLUG_TRIES answers 409 `retry`. Any other integrity error (a CHECK, a foreign key, another
    unique column) is raised as it is."""
    base = unique_slug(db, column, text, fallback=fallback)
    for attempt in range(SLUG_TRIES):
        setattr(obj, column.key, base if attempt == 0 else f"{base}-{secrets.token_hex(2)}")
        try:
            with db.begin_nested():
                db.add(obj)
                db.flush()
        except IntegrityError as e:
            if clashes_on(e, column):
                continue
            raise
        return
    raise conflict("retry", "Someone saved something with the same name at the same moment. Try again.")
