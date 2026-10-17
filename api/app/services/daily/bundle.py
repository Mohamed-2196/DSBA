"""Daily's content as one JSON file, to move it between installs and to keep the answers out of the public
repository: `python -m app.cli daily-content export FILE` writes what the database holds, and `daily-content import
FILE` adds what a file holds and the database lacks (a theme, a vocabulary word or an item that is there already stays
as it is). Everything imported goes through the editor's rules.

    {
      "themes": [{"id", "title", "blurb", "inRotation"}],   in the rotation's order
      "guesses": ["CRANE", ...],                           guess-list words beyond the public list
      "vocabulary": [{"word", "tags", "near"}],             Nearest neighbour's words
      "items": [{"game", "theme", "retired", ...}]          each with its game's fields (schemas/daily_content.py)
    }

The import sets the rotation from the file only while the database has none (a new install); a theme joins it once it
has what every game needs."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any

from pydantic import ValidationError
from sqlalchemy import func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.core.time import bahrain_today
from app.models import DailyGuessWord, DailyItem, DailyNearestWord, DailyTheme
from app.seed.loader import daily_guess_words
from app.services import audit
from app.services.daily import editor


@dataclass
class ImportResult:
    themes: int = 0
    guesses: int = 0
    vocabulary: int = 0
    items: int = 0
    kept: int = 0  # items the database had already
    rotation: list[str] = field(default_factory=list)  # the themes the import put in the rotation
    problems: list[str] = field(default_factory=list)  # what wasn't imported, and why


def _item_fields(item: DailyItem) -> dict[str, Any]:
    return {"game": item.game, "theme": item.theme_id, "retired": item.retired, **item.data}


def export(db: Session) -> dict[str, Any]:
    themes = sorted(db.scalars(select(DailyTheme)), key=lambda t: (not t.in_rotation, t.position, t.id))
    public = set(daily_guess_words())
    guesses = [w for w in db.scalars(select(DailyGuessWord.word).order_by(DailyGuessWord.word)) if w not in public]
    words = db.scalars(select(DailyNearestWord).order_by(DailyNearestWord.word))
    items = db.scalars(select(DailyItem).order_by(DailyItem.game, DailyItem.theme_id, DailyItem.created_at))
    return {
        "themes": [{"id": t.id, "title": t.title, "blurb": t.blurb, "inRotation": t.in_rotation} for t in themes],
        "guesses": guesses,
        "vocabulary": [{"word": w.word, "tags": list(w.tags), "near": list(w.near)} for w in words],
        "items": [_item_fields(i) for i in items],
    }


def _themes(db: Session, raw: Sequence[dict[str, Any]], out: ImportResult) -> None:
    last = db.scalar(select(func.max(DailyTheme.position)))
    position = (last if last is not None else -1) + 1
    for t in raw:
        theme_id = str(t.get("id", "")).strip().lower()
        if not editor.THEME_ID.fullmatch(theme_id):
            out.problems.append(f"theme “{theme_id}”: not a theme id")
            continue
        if db.get(DailyTheme, theme_id) is not None:
            continue
        try:
            title, blurb = editor.theme_text(str(t.get("title", "")), str(t.get("blurb", "")))
        except ApiError as e:
            out.problems.append(f"theme “{theme_id}”: {e.message}")
            continue
        db.add(DailyTheme(id=theme_id, title=title, blurb=blurb, position=position, in_rotation=False))
        position += 1
        out.themes += 1
    db.flush()


def _guesses(db: Session, words: Sequence[str], out: ImportResult) -> None:
    good = sorted({w.strip().upper() for w in words if editor.ANSWER.fullmatch(w.strip().upper())})
    if not good:
        return
    before = db.scalar(select(func.count()).select_from(DailyGuessWord)) or 0
    db.execute(pg_insert(DailyGuessWord).values([{"word": w} for w in good]).on_conflict_do_nothing())
    out.guesses += (db.scalar(select(func.count()).select_from(DailyGuessWord)) or 0) - before


def _vocabulary(db: Session, raw: Sequence[dict[str, Any]], out: ImportResult) -> None:
    """Every new word first, then their close words (which may name words further down the file)."""
    added: list[tuple[DailyNearestWord, list[str]]] = []
    for w in raw:
        word = str(w.get("word", "")).strip().lower()
        if not editor.VOCABULARY_WORD.fullmatch(word):
            out.problems.append(f"vocabulary “{word}”: not a word, a to z")
            continue
        if db.get(DailyNearestWord, word) is not None:
            continue
        row = DailyNearestWord(word=word, tags=[], near=[])
        db.add(row)
        added.append((row, [str(n) for n in w.get("near", [])]))
        row.tags = [str(t) for t in w.get("tags", [])]
    db.flush()
    for row, near in added:
        try:
            row.tags, row.near = editor.check_tags_near(db, row.word, row.tags, near)
        except ApiError as e:
            out.problems.append(f"vocabulary “{row.word}”: {e.message}")
            db.delete(row)
            continue
        out.vocabulary += 1
    db.flush()


def _items(db: Session, raw: Sequence[dict[str, Any]], out: ImportResult) -> None:
    for n, fields in enumerate(raw, 1):
        theme = str(fields.get("theme", ""))
        retired = bool(fields.get("retired", False))
        values = {k: v for k, v in fields.items() if k not in ("theme", "retired")}
        try:
            data = editor.ITEM_DATA.validate_python(values)
        except ValidationError:
            out.problems.append(f"item {n}: it doesn't fit its game's fields")
            continue
        if editor.existing(db, data.game, theme, editor.key_of(data)) is not None:
            out.kept += 1
            continue
        try:
            checked = editor.check_item(db, theme, data)
        except ApiError as e:
            out.problems.append(f"item {n} ({data.game}, {theme}): {e.message}")
            continue
        db.add(DailyItem(game=data.game, theme_id=theme, data=checked.data, key=checked.key, retired=retired))
        db.flush()
        out.items += 1


def _rotation(db: Session, raw: Sequence[dict[str, Any]], out: ImportResult) -> None:
    """The file's rotation, on an install that has none yet."""
    if db.scalar(select(func.count()).select_from(DailyTheme).where(DailyTheme.in_rotation)):
        return
    wanted = [str(t.get("id", "")).strip().lower() for t in raw if t.get("inRotation")]
    themes = {t.id: t for t in db.scalars(select(DailyTheme))}
    order = [t for t in wanted if t in themes] + sorted(
        (t for t in themes if t not in wanted), key=lambda t: (themes[t].position, t)
    )
    for position, theme_id in enumerate(order):
        themes[theme_id].position = position
    today = bahrain_today()
    for theme_id in wanted:
        if theme_id not in themes:
            continue
        problems = editor.theme_problems(db, theme_id, today)
        if problems:
            out.problems.append(f"theme “{theme_id}” stays out of the rotation: {problems[0]}")
            continue
        themes[theme_id].in_rotation = True
        out.rotation.append(theme_id)
    db.flush()


def load(db: Session, bundle: dict[str, Any]) -> ImportResult:
    """Adds the file's content that the database lacks. The caller commits."""
    out = ImportResult()
    _themes(db, bundle.get("themes", []), out)
    answers = [str(i.get("word", "")) for i in bundle.get("items", []) if i.get("game") == "word"]
    _guesses(db, [*bundle.get("guesses", []), *answers], out)
    _vocabulary(db, bundle.get("vocabulary", []), out)
    _items(db, bundle.get("items", []), out)
    editor.rank_secret_words(db)
    _rotation(db, bundle.get("themes", []), out)
    audit.record(
        db,
        None,
        "daily.content.import",
        "daily_theme",
        None,
        {
            "title": "Daily puzzles' content",
            "via": "cli",
            "themes": out.themes,
            "guesses": out.guesses,
            "vocabulary": out.vocabulary,
            "items": out.items,
        },
    )
    return out
