"""Slugs and plain-text helpers shared by the features.

- slugify(), unique_slug(): a title as an address, free in its column.
- insert_with_unique_slug(): the one way to insert a row with a slug or id made from its title: a free one, and a
  retry when a parallel request takes it first (code quality review CQ-6 and CQ-14: a race answers 409 `retry` at
  worst, never a 500).
- short_id(), has_latin(): titles without Latin letters (Arabic, digits only) get a short id, not 'file-2'
  (decision D8)."""

from __future__ import annotations

import re
import secrets
import unicodedata

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import InstrumentedAttribute, Session

from app.core.errors import conflict
from app.models.base import Base

SLUG_TRIES = 3
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


def has_latin(text: str) -> bool:
    """Whether `text` has a Latin letter to make a slug from ('سؤال عن ST2133' has; 'سؤال' and '2024' haven't)."""
    return re.search("[a-z]", slugify(text)) is not None


def short_id() -> str:
    """Six random letters or digits ('x3k9q2'): the slug part for a title without Latin letters."""
    return "".join(secrets.choice(SHORT_ID_ALPHABET) for _ in range(SHORT_ID_LENGTH))


def insert_with_unique_slug(
    db: Session, obj: Base, column: InstrumentedAttribute[str], text: str, *, fallback: str
) -> None:
    """Sets `column` on `obj` to a free slug of `text` ('-2', '-3', ... when taken; `fallback` when `text` makes
    none) and inserts it. Two requests can both see a slug as free; the one that loses the race retries with a short
    random suffix, and after SLUG_TRIES answers 409 `retry`."""
    base = unique_slug(db, column, text, fallback=fallback)
    for attempt in range(SLUG_TRIES):
        setattr(obj, column.key, base if attempt == 0 else f"{base}-{secrets.token_hex(2)}")
        try:
            with db.begin_nested():
                db.add(obj)
                db.flush()
        except IntegrityError:
            continue
        return
    raise conflict("retry", "Someone saved something with the same name at the same moment. Try again.")
