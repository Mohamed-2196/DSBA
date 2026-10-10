"""Slugs and plain-text helpers shared by the features."""

from __future__ import annotations

import re
import unicodedata

from sqlalchemy import select
from sqlalchemy.orm import InstrumentedAttribute, Session


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
