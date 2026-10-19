"""Daily's content as one JSON file, to move it between installs and to keep the answers out of the public
repository: `python -m app.cli daily-content export FILE` writes what the database holds; `daily-content import FILE`,
or an admin's upload in Manage → Daily puzzles, adds what a file holds and the database lacks. A theme, a vocabulary
word or an item that is there already stays as it is, so loading the same file twice changes nothing. Everything
imported goes through the editor's rules.

    {
      "themes": [{"id", "title", "blurb", "inRotation"}],   in the rotation's order
      "guesses": ["CRANE", ...],                           guess-list words beyond the public list
      "vocabulary": [{"word", "tags", "near"}],             Nearest neighbour's words
      "items": [{"game", "theme", "retired", ...}]          each with its game's fields (schemas/daily_content.py)
    }

The import sets the rotation from the file only while the database has none (a new install); a theme joins it once it
has what every game needs. Services leave the commit to the caller."""

from __future__ import annotations

import json
from collections import Counter
from collections.abc import Sequence
from dataclasses import dataclass, field
from typing import Any, cast

from pydantic import BaseModel, Field, ValidationError
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.errors import ApiError, invalid
from app.core.time import bahrain_today
from app.models import DailyGuessWord, DailyItem, DailyNearestWord, DailyTheme, User
from app.schemas.daily_content import BundleCounts, BundleGameCounts, BundleIn, BundleReport, ContentGame
from app.seed.loader import add_guess_words, daily_guess_words, top_up_guess_list
from app.services import audit
from app.services.daily import editor, rules

MAX_CHARACTERS = 5_000_000  # a file the command reads; an upload is capped lower by its schema (BundleIn)
NOT_A_FILE = "This isn't a Daily content file. Export one with python -m app.cli daily-content export."


class BundleFile(BaseModel):
    """The file's shape. Each entry's fields are checked as it is imported, and reported when they don't fit."""

    themes: list[dict[str, Any]] = Field(default_factory=list, max_length=200)
    guesses: list[str] = Field(default_factory=list, max_length=50_000)
    vocabulary: list[dict[str, Any]] = Field(default_factory=list, max_length=20_000)
    items: list[dict[str, Any]] = Field(default_factory=list, max_length=20_000)


def read(text: str) -> BundleFile:
    """The file's content, or 422 on `content` when it isn't a content file."""
    if len(text) > MAX_CHARACTERS:
        raise invalid("content", "This file is too big for a Daily content file.")
    try:
        raw = json.loads(text)
    except ValueError:
        raise invalid("content", f"{NOT_A_FILE} This one isn't JSON.") from None
    if not isinstance(raw, dict) or not {"themes", "guesses", "vocabulary", "items"} & raw.keys():
        raise invalid("content", NOT_A_FILE)
    try:
        return BundleFile.model_validate(raw)
    except ValidationError as e:
        where = ".".join(str(p) for p in e.errors()[0]["loc"])
        raise invalid("content", f"{NOT_A_FILE} Its “{where}” doesn't fit.") from None


@dataclass
class ImportResult:
    themes: Counter[str] = field(default_factory=Counter)  # "added" / "kept"
    guesses: Counter[str] = field(default_factory=Counter)
    vocabulary: Counter[str] = field(default_factory=Counter)
    items: dict[str, Counter[str]] = field(default_factory=dict)  # game -> "added" / "kept"
    rotation: list[str] = field(default_factory=list)  # the themes the import put in the rotation
    problems: list[str] = field(default_factory=list)  # what wasn't imported, and why

    def item(self, game: str, what: str) -> None:
        self.items.setdefault(game, Counter())[what] += 1

    @property
    def changed(self) -> bool:
        added = (self.themes, self.guesses, self.vocabulary, *self.items.values())
        return bool(self.rotation) or any(c["added"] for c in added)


def _strings(value: Any) -> list[str]:
    return [str(v) for v in value] if isinstance(value, list) else []


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
    known = set(db.scalars(select(DailyTheme.id)))
    for t in raw:
        theme_id = str(t.get("id", "")).strip().lower()
        if not editor.THEME_ID.fullmatch(theme_id):
            out.problems.append(f"theme “{theme_id}”: not a theme id")
            continue
        if theme_id in known:
            out.themes["kept"] += 1
            continue
        try:
            title, blurb = editor.theme_text(str(t.get("title", "")), str(t.get("blurb", "")))
        except ApiError as e:
            out.problems.append(f"theme “{theme_id}”: {e.message}")
            continue
        db.add(DailyTheme(id=theme_id, title=title, blurb=blurb, position=position, in_rotation=False))
        known.add(theme_id)
        position += 1
        out.themes["added"] += 1
    db.flush()


def _guesses(db: Session, words: Sequence[str], out: ImportResult) -> None:
    """The file's guess words and answers that the guess list lacks; then, into a list that is still short, the
    shipped list, which files leave out (counted as added)."""
    good = sorted({w.strip().upper() for w in words if rules.ANSWER.fullmatch(w.strip().upper())})
    added = add_guess_words(db, good)
    out.guesses["added"] += added + top_up_guess_list(db)
    out.guesses["kept"] += len(good) - added


def _vocabulary(db: Session, raw: Sequence[dict[str, Any]], out: ImportResult) -> None:
    """Every new word first, then their close words (which may name words further down the file). A word that can't
    be added takes with it the words that name it as close."""
    known = set(db.scalars(select(DailyNearestWord.word)))
    fresh: dict[str, tuple[list[str], list[str]]] = {}  # word -> its tags and close words, as the file has them
    for w in raw:
        word = str(w.get("word", "")).strip().lower()
        if not rules.VOCABULARY_WORD.fullmatch(word):
            out.problems.append(f"vocabulary “{word}”: not a word, a to z")
            continue
        if word in known or word in fresh:
            out.vocabulary["kept"] += 1
            continue
        fresh[word] = (_strings(w.get("tags")), _strings(w.get("near")))
    names = known | set(fresh)
    rows: dict[str, DailyNearestWord] = {}
    for word, (tags, near) in fresh.items():
        try:
            clean_tags, clean_near = editor.check_tags_near(db, word, tags, near, names)
        except ApiError as e:
            out.problems.append(f"vocabulary “{word}”: {e.message}")
            continue
        rows[word] = DailyNearestWord(word=word, tags=clean_tags, near=clean_near)
    while gone := {w: n for w, r in rows.items() for n in r.near if n not in known and n not in rows}:
        for word, missing in gone.items():
            out.problems.append(f"vocabulary “{word}”: “{missing}” isn't in the vocabulary. Add it, or leave it out.")
            del rows[word]
    db.add_all(rows.values())
    db.flush()
    out.vocabulary["added"] += len(rows)


def _items(db: Session, raw: Sequence[dict[str, Any]], out: ImportResult) -> None:
    """Each item checked with the editor's rules against what the database and the file hold so far, read once, and
    the new ones added together."""
    look = rules.Batch(db)
    new: list[DailyItem] = []
    for n, fields in enumerate(raw, 1):
        theme = str(fields.get("theme", ""))
        retired = bool(fields.get("retired", False))
        values = {k: v for k, v in fields.items() if k not in ("theme", "retired")}
        try:
            data = editor.ITEM_DATA.validate_python(values)
        except ValidationError:
            out.problems.append(f"item {n}: it doesn't fit its game's fields")
            continue
        if look.holder(data.game, theme, rules.key_of(data)) is not None:
            out.item(data.game, "kept")
            continue
        try:
            checked = rules.check_item(look, theme, data)
        except ApiError as e:
            out.problems.append(f"item {n} ({data.game}, {theme}): {e.message}")
            continue
        item = DailyItem(game=data.game, theme_id=theme, data=checked.data, key=checked.key, retired=retired)
        new.append(item)
        look.add(item)
        out.item(data.game, "added")
    editor.rank_secret_words(db, [i for i in new if i.game == "nearest"])  # ranked before they're added
    db.add_all(new)
    db.flush()


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


def load(db: Session, bundle: BundleFile, actor: User | None = None, ip: str | None = None) -> ImportResult:
    """Adds the file's content that the database lacks, and audits it (counts only, never the content) when it
    changed anything. `actor`: the admin who uploaded it; none for the command line."""
    out = ImportResult()
    _themes(db, bundle.themes, out)
    answers = [str(i.get("word", "")) for i in bundle.items if i.get("game") == "word"]
    _guesses(db, [*bundle.guesses, *answers], out)
    _vocabulary(db, bundle.vocabulary, out)
    _items(db, bundle.items, out)
    editor.rank_secret_words(db)
    _rotation(db, bundle.themes, out)
    if out.changed:
        counts = {
            "themes": out.themes["added"],
            "guesses": out.guesses["added"],
            "vocabulary": out.vocabulary["added"],
            "items": sum(c["added"] for c in out.items.values()),
        }
        data: dict[str, Any] = {"title": "Daily puzzles' content", **counts, "rotation": out.rotation}
        if actor is None:
            data["via"] = "cli"
        audit.record(db, actor, "daily.content.import", "daily_theme", None, data, ip=ip)
    return out


def _counts(c: Counter[str]) -> BundleCounts:
    return BundleCounts(added=c["added"], kept=c["kept"])


def report(result: ImportResult, applied: bool) -> BundleReport:
    return BundleReport(
        applied=applied,
        themes=_counts(result.themes),
        guesses=_counts(result.guesses),
        vocabulary=_counts(result.vocabulary),
        items=[
            BundleGameCounts(game=cast(ContentGame, game), added=c["added"], kept=c["kept"])
            for game, c in sorted(result.items.items())
        ],
        rotation=result.rotation,
        problems=result.problems,
    )


def import_file(db: Session, user: User, body: BundleIn, ip: str | None) -> BundleReport:
    """An admin's upload: checked and counted, and (unless `body.dryRun`) loaded, the same way as the command line."""
    content = read(body.content)
    if not body.dry_run:
        return report(load(db, content, user, ip), applied=True)
    trial = db.begin_nested()
    try:
        return report(load(db, content, user, ip), applied=False)
    finally:
        trial.rollback()
