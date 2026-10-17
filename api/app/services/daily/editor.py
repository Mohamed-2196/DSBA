"""Manage → Daily puzzles (holders of content.edit): the weekly themes and their schedule, each game's items, the
word game's guess list and Nearest neighbour's vocabulary, bulk imports, and a preview of any day's set.

- Items are checked against their game's rules, with the message on the field: an answer word is five letters and in
  the guess list; a group has four to eight different words and shares none with another group of its theme; a quiz
  question has two to six different options and one right answer; a secret word is in the vocabulary.
- Saves name the version they were loaded at (409 puzzle_changed when someone saved since), and every change is
  audited with what changed, before and after.
- A theme runs while it's in the rotation or named for this week or one to come. A change that would leave a theme
  that runs without enough items for one of its games is refused (409 theme_not_ready), so every day can be made.
- Changes reach the days still to come: a day that is out keeps its puzzles (content.py).
Services leave the commit to the handler."""

from __future__ import annotations

import csv
import datetime as dt
import io
import re
import uuid
from collections.abc import Callable, Iterable, Sequence
from typing import Any, NamedTuple, cast

from pydantic import TypeAdapter, ValidationError
from sqlalchemy import Text, delete, func, or_, select, text
from sqlalchemy import cast as sql_cast
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ApiError, conflict, invalid, not_found
from app.core.time import bahrain_today, utcnow
from app.models import (
    DailyGuessWord,
    DailyItem,
    DailyNearestWord,
    DailySet,
    DailySetItem,
    DailyTheme,
    DailyThemeWeek,
    Module,
    User,
)
from app.models.daily_content import UNIQUE_IN_THEME
from app.schemas.common import Page
from app.schemas.daily_content import (
    ContentGame,
    DailyContentOverview,
    DayPreview,
    GameCounts,
    GroupData,
    GuessAdd,
    GuessAddReport,
    GuessList,
    ImportIn,
    ImportReport,
    ImportRow,
    ItemCreate,
    ItemData,
    ItemOut,
    ItemSave,
    ItemStatus,
    NearestData,
    PreviewGame,
    PreviewGroup,
    PreviewGroups,
    PreviewNearest,
    PreviewPuzzle,
    PreviewQuestion,
    PreviewQuiz,
    PreviewSearch,
    PreviewWord,
    QuizData,
    SearchData,
    ThemeCreate,
    ThemeOrder,
    ThemeOut,
    ThemeSave,
    VocabularyIn,
    VocabularyOut,
    VocabularySave,
    WeekOut,
    WeekSave,
    WordData,
)
from app.services.content import record
from app.services.daily import content
from app.services.daily.content import Entry, NoThemeError, NotReadyError, Schedule
from app.services.daily.games import GAMES
from app.services.daily.games import groups as groups_game
from app.services.daily.games import nearest as nearest_game
from app.services.daily.games import quiz as quiz_game
from app.services.daily.games import search as search_game
from app.services.daily.games import word as word_game
from app.services.daily.games.base import ContentGame as Maker

ITEM_DATA: TypeAdapter[ItemData] = TypeAdapter(ItemData)
MAKERS: dict[str, Maker[Any, Any]] = {g.id: g for g in GAMES.values() if isinstance(g, Maker)}

CHANGED = "Someone saved this after you opened it. Load it again, then make your change."
ANSWER = re.compile(r"[A-Z]{5}")
GROUP_WORD = re.compile(r"[A-Z]{2,12}")
SEARCH_WORD = re.compile(rf"[A-Z]{{{search_game.MIN_LETTERS},{search_game.MAX_LETTERS}}}")
VOCABULARY_WORD = re.compile(r"[a-z]{2,24}")
TAG = re.compile(r"[a-z][a-z-]{1,23}")
THEME_ID = re.compile(r"[a-z][a-z0-9-]{1,31}")
SPLIT = re.compile(r"[\s,;|]+")
GROUP_WORDS = (4, 8)
OPTIONS = (2, 6)
TAGS = (3, 8)
NEAR_MOST = 6
IMPORT_ROWS = 500
SCHEDULE_WEEKS = 16
PREVIEW_DAYS = 400
GUESS_PAGE = 120
CLOSEST = 10
READINESS = b"can the theme make it"  # any order does: the check asks whether a choice exists, not which


def _title(game: str) -> str:
    return GAMES[cast(Any, game)].title


# ── checking an item ─────────────────────────────────────────────────────────────────────────


class Checked(NamedTuple):
    data: dict[str, Any]  # as stored: the game's fields, camelCase
    key: str  # what must be unique


def _text(raw: str) -> str:
    return " ".join(raw.split())


def unknown_theme() -> ApiError:
    return invalid("theme", "Pick one of the themes.")


def _theme(db: Session, theme_id: str) -> DailyTheme:
    theme = db.get(DailyTheme, theme_id)
    if theme is None:
        raise unknown_theme()
    return theme


def key_of(data: ItemData) -> str:
    """What must be unique about an item: its word, its group's name or its question, as stored."""
    if isinstance(data, GroupData):
        return _text(data.label).casefold()
    if isinstance(data, QuizData):
        return _text(data.question).casefold()
    if isinstance(data, NearestData):
        return data.word.strip().lower()
    return data.word.strip().upper()


def existing(db: Session, game: str, theme: str, key: str, item_id: uuid.UUID | None = None) -> DailyItem | None:
    """The item that already has this key: in the game (an answer word, a question, a secret word), or in the
    theme (a group's name, a word search word)."""
    q = select(DailyItem).where(DailyItem.game == game, DailyItem.key == key)
    if game in UNIQUE_IN_THEME:
        q = q.where(DailyItem.theme_id == theme)
    if item_id is not None:
        q = q.where(DailyItem.id != item_id)
    return db.scalars(q.limit(1)).first()


def _check_word(db: Session, data: WordData) -> Checked:
    word = data.word.strip().upper()
    if not ANSWER.fullmatch(word):
        raise invalid("data.word", "Answer words are five letters, A to Z.")
    if not word_game.in_guess_list(db, word):
        raise invalid("data.word", f"“{word}” isn't in the guess list. Add it there first, so it can be guessed.")
    return Checked({"word": word}, word)


def _check_group(db: Session, theme: str, data: GroupData, item_id: uuid.UUID | None) -> Checked:
    label = _text(data.label)
    if not 2 <= len(label) <= 60:
        raise invalid("data.label", "Say what the words share in 2 to 60 characters.")
    words = [w.strip().upper() for w in data.words if w.strip()]
    bad = next((w for w in words if not GROUP_WORD.fullmatch(w)), None)
    if bad is not None:
        raise invalid("data.words", f"Group words are 2 to 12 letters, A to Z, with no spaces: “{bad}” isn't.")
    if len(set(words)) != len(words):
        raise invalid("data.words", "Each word can be in the group once.")
    least, most = GROUP_WORDS
    if not least <= len(words) <= most:
        raise invalid("data.words", f"A group has {least} to {most} words. A day shows four of them.")
    others = select(DailyItem).where(
        DailyItem.game == "groups", DailyItem.theme_id == theme, DailyItem.retired.is_(False)
    )
    if item_id is not None:
        others = others.where(DailyItem.id != item_id)
    for other in db.scalars(others):
        shared = sorted(set(words) & set(other.data["words"]))
        if shared:
            raise invalid(
                "data.words",
                f"“{shared[0]}” is already in “{other.data['label']}”. A word can be in one group of a theme, so "
                "no board has it twice.",
            )
    return Checked({"label": label, "level": data.level, "words": words}, label.casefold())


def _check_search(data: SearchData) -> Checked:
    word = data.word.strip().upper()
    if not SEARCH_WORD.fullmatch(word):
        least, most = search_game.MIN_LETTERS, search_game.MAX_LETTERS
        raise invalid("data.word", f"Word search words are {least} to {most} letters, A to Z, with no spaces.")
    return Checked({"word": word}, word)


def _check_quiz(db: Session, data: QuizData) -> Checked:
    question = _text(data.question)
    if not 10 <= len(question) <= 200:
        raise invalid("data.question", "Write the question in 10 to 200 characters.")
    options = [_text(o) for o in data.options]
    if not all(options):
        raise invalid("data.options", "Fill in every option, or remove the empty ones.")
    least, most = OPTIONS
    if not least <= len(options) <= most:
        raise invalid("data.options", f"Give {least} to {most} options.")
    if any(len(o) > 80 for o in options):
        raise invalid("data.options", "Keep each option to 80 characters.")
    if len({o.casefold() for o in options}) != len(options):
        raise invalid("data.options", "Make every option different, so only one of them is right.")
    if not 0 <= data.answer < len(options):
        raise invalid("data.answer", "Pick the right answer.")
    explanation = _text(data.explanation)
    if not 1 <= len(explanation) <= 300:
        raise invalid("data.explanation", "Explain the answer in 300 characters or fewer.")
    module_id = (data.module_id or "").strip() or None
    if module_id is not None and db.get(Module, module_id) is None:
        raise invalid("data.moduleId", "Pick one of the modules.")
    fields = {
        "question": question,
        "options": options,
        "answer": data.answer,
        "explanation": explanation,
        "moduleId": module_id,
    }
    return Checked(fields, question.casefold())


def _check_nearest(db: Session, data: NearestData) -> Checked:
    word = data.word.strip().lower()
    if not VOCABULARY_WORD.fullmatch(word):
        raise invalid("data.word", "Secret words are 2 to 24 letters, a to z.")
    if db.get(DailyNearestWord, word) is None:
        raise invalid("data.word", f"“{word}” isn't in the vocabulary. Add it there first, with its tags.")
    return Checked({"word": word}, word)


_DUPLICATE: dict[str, Callable[[str, str], str]] = {
    "word": lambda key, where: f"“{key}” is already an answer word in {where}.",
    "groups": lambda key, where: f"{where} already has a group called “{key}”.",
    "search": lambda key, where: f"“{key}” is already in {where}'s word search.",
    "quiz": lambda key, where: f"This question is already in the quiz, in {where}.",
    "nearest": lambda key, where: f"“{key}” is already a secret word in {where}.",
}
_KEY_FIELD = {"groups": "data.label", "quiz": "data.question"}


def _check_unique(db: Session, game: str, theme: str, checked: Checked, item_id: uuid.UUID | None) -> None:
    other = existing(db, game, theme, checked.key, item_id)
    if other is None:
        return
    shown = checked.data.get("label") or checked.data.get("word") or checked.key
    message = _DUPLICATE[game](str(shown), _theme(db, other.theme_id).title)
    if other.retired:
        message += " It's retired: bring it back instead."
    raise invalid(_KEY_FIELD.get(game, "data.word"), message)


def check_item(db: Session, theme: str, data: ItemData, item_id: uuid.UUID | None = None) -> Checked:
    """The item's fields as stored, or 422 with what to fix on the field."""
    _theme(db, theme)
    if isinstance(data, WordData):
        checked = _check_word(db, data)
    elif isinstance(data, GroupData):
        checked = _check_group(db, theme, data, item_id)
    elif isinstance(data, SearchData):
        checked = _check_search(data)
    elif isinstance(data, QuizData):
        checked = _check_quiz(db, data)
    else:
        checked = _check_nearest(db, data)
    _check_unique(db, data.game, theme, checked, item_id)
    return checked


# ── whether a theme can run ──────────────────────────────────────────────────────────────────


def _listed(parts: Sequence[str]) -> str:
    return parts[0] if len(parts) == 1 else f"{', '.join(parts[:-1])} and {parts[-1]}"


def _problem(game: str, pool: Sequence[Entry]) -> str:
    """What a theme's items lack for a game."""
    if game == "groups":
        missing = [str(n) for n in range(1, groups_game.GROUPS + 1) if not any(e.data["level"] == n for e in pool)]
        if missing:
            return f"Groups needs a group at level {_listed(missing)}."
        return "Groups needs four groups, one a level, that share no words."
    if game == "search":
        if len(pool) >= search_game.WORDS:
            return (
                f"Word search needs {search_game.WORDS} words that fit together: none inside another, "
                f"{search_game.MAX_HIDDEN} letters at most."
            )
        return f"Word search needs at least {search_game.WORDS} words."
    if game == "quiz":
        return f"The quiz needs at least {quiz_game.FROM_THEME} questions."
    if game == "nearest":
        return "Nearest neighbour needs at least one secret word."
    return "The word needs at least one answer word."


def theme_problems(db: Session, theme: str, day: dt.date) -> list[str]:
    """What the theme's items lack for its games to run (empty when it can run)."""
    db.flush()
    return _problems(_pools(db, theme).get(theme, {}), day)


def _problems(pools: dict[str, list[Entry]], day: dt.date) -> list[str]:
    out = []
    for game_id, maker in MAKERS.items():
        pool = pools.get(game_id, [])
        try:
            maker.choose(pool, {}, day, READINESS)
        except NotReadyError:
            out.append(_problem(game_id, pool))
    return out


def _pools(db: Session, theme: str | None = None) -> dict[str, dict[str, list[Entry]]]:
    """theme -> game -> the items that can run (each secret word's ranking stands in for its presence only)."""
    q = select(DailyItem.id, DailyItem.game, DailyItem.theme_id, DailyItem.data, DailyItem.ranking.is_not(None)).where(
        DailyItem.retired.is_(False)
    )
    if theme is not None:
        q = q.where(DailyItem.theme_id == theme)
    out: dict[str, dict[str, list[Entry]]] = {}
    for item_id, game, theme_id, data, ranked in db.execute(q.order_by(DailyItem.created_at, DailyItem.id)):
        entry = Entry(item_id, theme_id, data, (data["word"],) if ranked else None)
        out.setdefault(theme_id, {}).setdefault(game, []).append(entry)
    return out


def _running(db: Session, today: dt.date) -> set[str]:
    """The themes that run: in the rotation, or named for this week or one to come."""
    rotation = set(db.scalars(select(DailyTheme.id).where(DailyTheme.in_rotation)))
    weeks = select(DailyThemeWeek.theme_id).where(DailyThemeWeek.week_start >= content.week_start(today))
    return rotation | set(db.scalars(weeks))


def _ensure_ready(db: Session, themes: Iterable[str]) -> None:
    """409 theme_not_ready when one of `themes` runs and its items can no longer make every game."""
    db.flush()
    today = bahrain_today()
    running = _running(db, today)
    for theme_id in sorted(set(themes) & running):
        problems = theme_problems(db, theme_id, today)
        if problems:
            title = _theme(db, theme_id).title
            raise conflict(
                "theme_not_ready", f"{title} runs on the hub, so it can't be left short. {problems[0]} Add one first."
            )


def _lock_themes(db: Session, *ids: str) -> None:
    """Item writes take their themes' rows in turn, so two editors can't each take a theme's last item."""
    for theme_id in sorted(set(ids)):
        db.get(DailyTheme, theme_id, with_for_update=True)


# ── items ────────────────────────────────────────────────────────────────────────────────────


def _snapshot(item: DailyItem) -> dict[str, Any]:
    return {"theme": item.theme_id, "data": dict(item.data), "retired": item.retired}


def _change(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    changed = [k for k in after if before.get(k) != after[k]]
    return {"before": {k: before.get(k) for k in changed}, "after": {k: after[k] for k in changed}}


def _label(item: DailyItem) -> str:
    """How the activity log names an item: 'Quick quiz: Which measure of centre…'."""
    text = item.data.get("label") or item.data.get("question") or item.data.get("word") or ""
    return f"{_title(item.game)}: {text}"


def _uses(db: Session, ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, tuple[int, dt.date]]:
    if not ids:
        return {}
    q = (
        select(DailySetItem.item_id, func.count(), func.max(DailySetItem.day))
        .where(DailySetItem.item_id.in_(ids))
        .group_by(DailySetItem.item_id)
    )
    return {item_id: (n, last) for item_id, n, last in db.execute(q)}


def _out(item: DailyItem, use: tuple[int, dt.date] | None) -> ItemOut:
    closest = list(item.ranking[1 : CLOSEST + 1]) if item.ranking else None
    return ItemOut(
        id=item.id,
        game=cast(ContentGame, item.game),
        theme=item.theme_id,
        data=ITEM_DATA.validate_python({"game": item.game, **item.data}),
        retired=item.retired,
        version=item.version,
        uses=use[0] if use else 0,
        last_used=use[1] if use else None,
        closest=closest,
        updated_at=item.updated_at,
    )


def item_out(db: Session, item: DailyItem) -> ItemOut:
    return _out(item, _uses(db, [item.id]).get(item.id))


def _escape(q: str) -> str:
    return q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def list_items(
    db: Session, game: ContentGame, theme: str | None, status: ItemStatus, q: str, limit: int, offset: int
) -> Page[ItemOut]:
    """A game's items, by theme and status, found by any of their words: in use first, then alphabetical."""
    where: list[Any] = [DailyItem.game == game]
    if theme:
        where.append(DailyItem.theme_id == theme)
    if status != "all":
        where.append(DailyItem.retired.is_(status == "retired"))
    if q.strip():
        pattern = f"%{_escape(q.strip())}%"
        fields = (
            DailyItem.key,
            sql_cast(DailyItem.data["words"], Text),
            sql_cast(DailyItem.data["options"], Text),
            DailyItem.data["explanation"].astext,
        )
        where.append(or_(*(f.ilike(pattern, escape="\\") for f in fields)))
    total = db.scalar(select(func.count()).select_from(DailyItem).where(*where)) or 0
    rows = list(
        db.scalars(
            select(DailyItem)
            .where(*where)
            .order_by(DailyItem.retired, DailyItem.key, DailyItem.id)
            .limit(limit)
            .offset(offset)
        )
    )
    used = _uses(db, [r.id for r in rows])
    return Page(items=[_out(r, used.get(r.id)) for r in rows], total=total, limit=limit, offset=offset)


def _item(db: Session, item_id: uuid.UUID) -> DailyItem:
    item = db.get(DailyItem, item_id, with_for_update=True)
    if item is None:
        raise not_found("This item doesn't exist any more.")
    return item


def _version(item: DailyItem | DailyTheme | DailyNearestWord, version: int) -> None:
    if item.version != version:
        raise conflict("puzzle_changed", CHANGED)


def _add(db: Session, rows: Sequence[DailyItem], field: str) -> None:
    """Adds new items; one someone else added a moment ago with the same text is refused on `field`."""
    try:
        with db.begin_nested():
            db.add_all(rows)
            db.flush()
    except IntegrityError:
        raise invalid(field, "Someone added this a moment ago. Load the list again.") from None


def create_item(db: Session, user: User, body: ItemCreate, ip: str | None) -> ItemOut:
    _lock_themes(db, body.theme)
    checked = check_item(db, body.theme, body.data)
    item = DailyItem(game=body.data.game, theme_id=body.theme, data=checked.data, key=checked.key)
    _add(db, [item], _KEY_FIELD.get(item.game, "data.word"))
    if item.game == "nearest":
        rank_secret_words(db, [item])
    record(
        db, user, "daily.item.create", "daily_item", item.id, _label(item), ip, game=item.game, after=_snapshot(item)
    )
    return _out(item, None)


def save_item(db: Session, user: User, item_id: uuid.UUID, body: ItemSave, ip: str | None) -> ItemOut:
    """Saves the whole item, if nobody saved it since `body.version` (409 puzzle_changed)."""
    item = _item(db, item_id)
    _version(item, body.version)
    if body.data.game != item.game:
        raise invalid("data.game", "An item stays in its game.")
    _lock_themes(db, item.theme_id, body.theme)
    checked = check_item(db, body.theme, body.data, item.id)
    before = _snapshot(item)
    item.theme_id, item.data, item.key = body.theme, checked.data, checked.key
    after = _snapshot(item)
    if after == before:
        return item_out(db, item)
    item.version += 1
    item.updated_at = utcnow()
    if item.game == "nearest":
        rank_secret_words(db, [item])
    if not item.retired:
        _ensure_ready(db, {before["theme"], item.theme_id})
    record(
        db, user, "daily.item.update", "daily_item", item.id, _label(item), ip, game=item.game, **_change(before, after)
    )
    return item_out(db, item)


def set_retired(db: Session, user: User, item_id: uuid.UUID, retired: bool, version: int, ip: str | None) -> ItemOut:
    """Retires an item (it never runs again; the days it ran keep it) or brings it back, checked again."""
    item = _item(db, item_id)
    _version(item, version)
    if item.retired == retired:
        return item_out(db, item)
    _lock_themes(db, item.theme_id)
    if not retired:
        check_item(db, item.theme_id, ITEM_DATA.validate_python({"game": item.game, **item.data}), item.id)
    item.retired = retired
    item.version += 1
    item.updated_at = utcnow()
    if retired:
        _ensure_ready(db, {item.theme_id})
    action = "daily.item.retire" if retired else "daily.item.restore"
    record(db, user, action, "daily_item", item.id, _label(item), ip, game=item.game)
    return item_out(db, item)


def delete_item(db: Session, user: User, item_id: uuid.UUID, version: int, ip: str | None) -> None:
    """Deletes an item that never ran. One that ran is kept by its days: retire it instead (409 content_in_use)."""
    item = _item(db, item_id)
    _version(item, version)
    ran = db.scalar(select(func.count()).where(DailySetItem.item_id == item.id)) or 0
    if ran:
        days = "day" if ran == 1 else "days"
        raise conflict(
            "content_in_use", f"It ran on {ran} {days}, which keep it. Retire it instead, so it doesn't run again."
        )
    _lock_themes(db, item.theme_id)
    record(
        db, user, "daily.item.delete", "daily_item", item.id, _label(item), ip, game=item.game, before=_snapshot(item)
    )
    db.delete(item)
    if not item.retired:
        _ensure_ready(db, {item.theme_id})
    db.flush()


# ── Nearest neighbour's vocabulary and rankings ──────────────────────────────────────────────


def rank_secret_words(db: Session, items: Sequence[DailyItem] | None = None) -> None:
    """Works out the secret words' rankings of the vocabulary as it is now: `items`, or every secret word."""
    db.flush()
    vocabulary = {w.word: (list(w.tags), list(w.near)) for w in db.scalars(select(DailyNearestWord))}
    targets = (
        list(items) if items is not None else list(db.scalars(select(DailyItem).where(DailyItem.game == "nearest")))
    )
    ranked = nearest_game.rankings(vocabulary, {t.data["word"] for t in targets})
    for target in targets:
        ranking = ranked.get(target.data["word"])
        if target.ranking != ranking:
            target.ranking = ranking
    db.flush()


def _vocabulary_out(db: Session, words: Sequence[DailyNearestWord]) -> list[VocabularyOut]:
    names = [w.word for w in words]
    secret: dict[str, str] = {}
    if names:
        q = select(DailyItem.key, DailyItem.theme_id).where(DailyItem.game == "nearest", DailyItem.key.in_(names))
        secret = dict(db.execute(q).tuples().all())
    return [
        VocabularyOut(
            word=w.word,
            tags=list(w.tags),
            near=list(w.near),
            secret_in=secret.get(w.word),
            version=w.version,
            updated_at=w.updated_at,
        )
        for w in words
    ]


def vocabulary(db: Session, q: str, limit: int, offset: int) -> Page[VocabularyOut]:
    """The vocabulary, alphabetical; `q` finds words starting with it, or any word with it as a tag."""
    where: list[Any] = []
    if q.strip():
        query = q.strip().lower()
        where.append(
            or_(
                DailyNearestWord.word.startswith(query, autoescape=True),
                DailyNearestWord.tags.contains([query]),
            )
        )
    total = db.scalar(select(func.count()).select_from(DailyNearestWord).where(*where)) or 0
    rows = list(
        db.scalars(select(DailyNearestWord).where(*where).order_by(DailyNearestWord.word).limit(limit).offset(offset))
    )
    return Page(items=_vocabulary_out(db, rows), total=total, limit=limit, offset=offset)


def check_tags_near(db: Session, word: str, tags: Sequence[str], near: Sequence[str]) -> tuple[list[str], list[str]]:
    clean_tags = list(dict.fromkeys(t.strip().lower() for t in tags if t.strip()))
    bad = next((t for t in clean_tags if not TAG.fullmatch(t)), None)
    if bad is not None:
        raise invalid("tags", f"Tags are short words, a to z (hyphens allowed): “{bad}” isn't.")
    least, most = TAGS
    if not least <= len(clean_tags) <= most:
        raise invalid("tags", f"Give {least} to {most} tags. Words that share tags count as close.")
    clean_near = list(dict.fromkeys(n.strip().lower() for n in near if n.strip()))
    if word in clean_near:
        raise invalid("near", "A word can't be listed as close to itself.")
    if len(clean_near) > NEAR_MOST:
        raise invalid("near", f"List {NEAR_MOST} close words at most.")
    known = set(db.scalars(select(DailyNearestWord.word).where(DailyNearestWord.word.in_(clean_near))))
    missing = [n for n in clean_near if n not in known]
    if missing:
        raise invalid("near", f"“{missing[0]}” isn't in the vocabulary. Add it first, or leave it out.")
    return clean_tags, clean_near


def add_vocabulary(db: Session, user: User, body: VocabularyIn, ip: str | None) -> VocabularyOut:
    word = body.word.strip().lower()
    if not VOCABULARY_WORD.fullmatch(word):
        raise invalid("word", "Words are 2 to 24 letters, a to z.")
    if db.get(DailyNearestWord, word) is not None:
        raise invalid("word", f"“{word}” is in the vocabulary already.")
    tags, near = check_tags_near(db, word, body.tags, body.near)
    row = DailyNearestWord(word=word, tags=tags, near=near)
    try:
        with db.begin_nested():
            db.add(row)
            db.flush()
    except IntegrityError:
        raise invalid("word", f"“{word}” was added a moment ago. Load the vocabulary again.") from None
    rank_secret_words(db)
    record(db, user, "daily.vocabulary.create", "daily_word", word, word, ip, after={"tags": tags, "near": near})
    return _vocabulary_out(db, [row])[0]


def save_vocabulary(db: Session, user: User, word: str, body: VocabularySave, ip: str | None) -> VocabularyOut:
    row = db.get(DailyNearestWord, word, with_for_update=True)
    if row is None:
        raise not_found("This word isn't in the vocabulary any more.")
    _version(row, body.version)
    tags, near = check_tags_near(db, word, body.tags, body.near)
    before = {"tags": list(row.tags), "near": list(row.near)}
    after = {"tags": tags, "near": near}
    if after == before:
        return _vocabulary_out(db, [row])[0]
    row.tags, row.near = tags, near
    row.version += 1
    row.updated_at = utcnow()
    rank_secret_words(db)
    record(db, user, "daily.vocabulary.update", "daily_word", word, word, ip, **_change(before, after))
    return _vocabulary_out(db, [row])[0]


def delete_vocabulary(db: Session, user: User, word: str, version: int, ip: str | None) -> None:
    """Deletes a word that isn't a secret word, and takes it off the close words of the others."""
    row = db.get(DailyNearestWord, word, with_for_update=True)
    if row is None:
        raise not_found("This word isn't in the vocabulary any more.")
    _version(row, version)
    secret = db.scalars(select(DailyItem).where(DailyItem.game == "nearest", DailyItem.key == word).limit(1)).first()
    if secret is not None:
        where = _theme(db, secret.theme_id).title
        raise conflict("content_in_use", f"“{word}” is a secret word in {where}. Delete or change that first.")
    for other in db.scalars(select(DailyNearestWord).where(DailyNearestWord.near.contains([word]))):
        other.near = [n for n in other.near if n != word]
        other.version += 1
    record(
        db, user, "daily.vocabulary.delete", "daily_word", word, word, ip, before={"tags": row.tags, "near": row.near}
    )
    db.delete(row)
    rank_secret_words(db)


# ── the word game's guess list ───────────────────────────────────────────────────────────────


def guess_list(db: Session, q: str) -> GuessList:
    prefix = q.strip().upper()
    total = db.scalar(select(func.count()).select_from(DailyGuessWord)) or 0
    query = select(DailyGuessWord.word).order_by(DailyGuessWord.word).limit(GUESS_PAGE + 1)
    if prefix:
        query = query.where(DailyGuessWord.word.startswith(prefix, autoescape=True))
    words = list(db.scalars(query))
    return GuessList(total=total, words=words[:GUESS_PAGE], more=len(words) > GUESS_PAGE)


def _split_guesses(text: str) -> tuple[list[str], list[str]]:
    """(five-letter words, the rest), each once, in the order given."""
    good: list[str] = []
    bad: list[str] = []
    for raw in SPLIT.split(text):
        word = raw.strip().upper()
        if word:
            (good if ANSWER.fullmatch(word) else bad).append(word)
    return list(dict.fromkeys(good)), list(dict.fromkeys(bad))


def add_guesses(db: Session, user: User, body: GuessAdd, ip: str | None) -> GuessAddReport:
    good, bad = _split_guesses(body.text)
    if not good and not bad:
        raise invalid("text", "Paste at least one word.")
    if len(good) + len(bad) > 5000:
        raise invalid("text", "Add up to 5,000 words at a time.")
    known = set(db.scalars(select(DailyGuessWord.word).where(DailyGuessWord.word.in_(good))))
    new = [w for w in good if w not in known]
    if new and not body.dry_run:
        db.execute(pg_insert(DailyGuessWord).values([{"word": w} for w in new]).on_conflict_do_nothing())
        record(
            db,
            user,
            "daily.guesses.add",
            "daily_guess_words",
            None,
            f"{len(new)} words",
            ip,
            count=len(new),
            words=new[:50],
        )
    total = (db.scalar(select(func.count()).select_from(DailyGuessWord)) or 0) + (len(new) if body.dry_run else 0)
    return GuessAddReport(new=new, known=[w for w in good if w in known], refused=bad, total=total)


_GUESSED = text(
    "SELECT 1 FROM daily_plays p WHERE p.game = 'word' AND EXISTS ("
    "SELECT 1 FROM jsonb_array_elements(p.moves) m WHERE m->>'kind' = 'guess' AND upper(btrim(m->>'word')) = :word"
    ") LIMIT 1"
)


def remove_guess(db: Session, user: User, word: str, ip: str | None) -> None:
    """Takes a word off the guess list, unless it's an answer word or a kept play guessed it (that play would no
    longer replay)."""
    word = word.strip().upper()
    if db.get(DailyGuessWord, word) is None:
        raise not_found("This word isn't in the guess list.")
    answer = db.scalars(select(DailyItem).where(DailyItem.game == "word", DailyItem.key == word).limit(1)).first()
    if answer is not None:
        where = _theme(db, answer.theme_id).title
        raise conflict("content_in_use", f"“{word}” is an answer word in {where}. Delete that first.")
    if db.execute(_GUESSED, {"word": word}).first() is not None:
        raise conflict(
            "content_in_use", f"Players have guessed “{word}”, and their games need it. It stays in the list."
        )
    db.execute(delete(DailyGuessWord).where(DailyGuessWord.word == word))
    record(db, user, "daily.guesses.remove", "daily_guess_words", word, word, ip)


# ── themes and the schedule ──────────────────────────────────────────────────────────────────


def _counts(pools: dict[str, list[Entry]]) -> GameCounts:
    return GameCounts(**{game: len(pools.get(game, [])) for game in MAKERS})


def _weeks(plan: Schedule, today: dt.date) -> list[WeekOut]:
    this_week = content.week_start(today)
    out: list[WeekOut] = []
    for n in range(SCHEDULE_WEEKS):
        week = this_week + n * content.WEEK
        try:
            theme = plan.theme_id(week)
        except NoThemeError:
            break
        started = week <= this_week
        out.append(WeekOut(week_start=week, theme=theme, pinned=not started and week in plan.pinned, started=started))
    return out


def overview(db: Session) -> DailyContentOverview:
    """The themes (the rotation first, in order) with what each has and lacks, the weeks to come, and the lists'
    sizes."""
    today = bahrain_today()
    plan = content.schedule(db)
    pools = _pools(db)
    this_week = content.week_start(today)
    ran = set(db.scalars(select(DailySet.theme_id).distinct())) | {
        theme for week, theme in plan.pinned.items() if week <= this_week
    }
    themes = sorted(db.scalars(select(DailyTheme)), key=lambda t: (not t.in_rotation, t.position, t.id))
    tags = sorted({tag for row in db.scalars(select(DailyNearestWord.tags)) for tag in row})
    return DailyContentOverview(
        today=today,
        first_day=content.FIRST_DAY,
        themes=[
            ThemeOut(
                id=t.id,
                title=t.title,
                blurb=t.blurb,
                in_rotation=t.in_rotation,
                position=t.position,
                version=t.version,
                counts=_counts(pools.get(t.id, {})),
                problems=_problems(pools.get(t.id, {}), today),
                used=t.id in ran,
            )
            for t in themes
        ],
        weeks=_weeks(plan, today),
        guess_words=db.scalar(select(func.count()).select_from(DailyGuessWord)) or 0,
        vocabulary_words=db.scalar(select(func.count()).select_from(DailyNearestWord)) or 0,
        tags=tags,
    )


def _theme_snapshot(theme: DailyTheme) -> dict[str, Any]:
    return {"title": theme.title, "blurb": theme.blurb, "inRotation": theme.in_rotation}


def theme_text(title: str, blurb: str) -> tuple[str, str]:
    title, blurb = _text(title), _text(blurb)
    if not 2 <= len(title) <= 60:
        raise invalid("title", "Name the theme in 2 to 60 characters.")
    if len(blurb) > 200:
        raise invalid("blurb", "Keep the line under the title to 200 characters.")
    return title, blurb


def create_theme(db: Session, user: User, body: ThemeCreate, ip: str | None) -> DailyContentOverview:
    """A new theme, out of the rotation until it has what every game needs."""
    theme_id = body.id.strip().lower()
    if not THEME_ID.fullmatch(theme_id):
        raise invalid("id", "Use 2 to 32 lower-case letters, digits and hyphens, starting with a letter.")
    title, blurb = theme_text(body.title, body.blurb)
    taken = conflict("slug_taken", "Another theme has this id. Choose another one.")
    if db.get(DailyTheme, theme_id) is not None:
        raise taken
    last = db.scalar(select(func.max(DailyTheme.position)))
    theme = DailyTheme(
        id=theme_id, title=title, blurb=blurb, position=(last if last is not None else -1) + 1, in_rotation=False
    )
    try:
        with db.begin_nested():
            db.add(theme)
            db.flush()
    except IntegrityError:
        raise taken from None
    record(db, user, "daily.theme.create", "daily_theme", theme_id, title, ip, after=_theme_snapshot(theme))
    return overview(db)


def _locked_theme(db: Session, theme_id: str) -> DailyTheme:
    theme = db.get(DailyTheme, theme_id, with_for_update=True)
    if theme is None:
        raise not_found("This theme doesn't exist any more.")
    return theme


def save_theme(db: Session, user: User, theme_id: str, body: ThemeSave, ip: str | None) -> DailyContentOverview:
    """A theme's title and line, and whether it's in the rotation. Joining needs what every game needs (409
    theme_not_ready); the rotation keeps at least one theme. Weeks that started keep their themes."""
    theme = _locked_theme(db, theme_id)
    _version(theme, body.version)
    title, blurb = theme_text(body.title, body.blurb)
    before = _theme_snapshot(theme)
    today = bahrain_today()
    if body.in_rotation != theme.in_rotation:
        if body.in_rotation:
            problems = theme_problems(db, theme_id, today)
            if problems:
                raise conflict("theme_not_ready", f"{title} can't join the rotation yet. {problems[0]}")
        elif not db.scalar(
            select(func.count()).where(DailyTheme.in_rotation, DailyTheme.id != theme_id).select_from(DailyTheme)
        ):
            raise invalid("inRotation", "At least one theme stays in the rotation.")
        content.keep_weeks(db, content.schedule(db), today)
    theme.title, theme.blurb, theme.in_rotation = title, blurb, body.in_rotation
    after = _theme_snapshot(theme)
    if after == before:
        return overview(db)
    theme.version += 1
    theme.updated_at = utcnow()
    db.flush()
    record(db, user, "daily.theme.update", "daily_theme", theme.id, title, ip, **_change(before, after))
    return overview(db)


def order_themes(db: Session, user: User, body: ThemeOrder, ip: str | None) -> DailyContentOverview:
    """The rotation in a new order: its themes take the places they held, in that order. Weeks that started keep
    their themes."""
    themes = list(db.scalars(select(DailyTheme).order_by(DailyTheme.position, DailyTheme.id).with_for_update()))
    rotation = [t.id for t in themes if t.in_rotation]
    if sorted(body.ids) != sorted(rotation) or len(set(body.ids)) != len(body.ids):
        raise conflict("puzzle_changed", "The rotation changed while you were ordering it. Load it again.")
    if body.ids == rotation:
        return overview(db)
    content.keep_weeks(db, content.schedule(db), bahrain_today())
    places = sorted(t.position for t in themes if t.in_rotation)
    by_id = {t.id: t for t in themes}
    for place, theme_id in zip(places, body.ids, strict=True):
        by_id[theme_id].position = place
    db.flush()
    record(db, user, "daily.theme.order", "daily_theme", None, "The rotation", ip, before=rotation, after=body.ids)
    return overview(db)


def delete_theme(db: Session, user: User, theme_id: str, version: int, ip: str | None) -> DailyContentOverview:
    """Deletes a theme that never ran and has no items (409 content_in_use otherwise)."""
    theme = _locked_theme(db, theme_id)
    _version(theme, version)
    if theme.in_rotation:
        raise conflict("content_in_use", f"{theme.title} is in the rotation. Take it out first.")
    items = db.scalar(select(func.count()).where(DailyItem.theme_id == theme_id)) or 0
    if items:
        raise conflict("content_in_use", f"{theme.title} has {items} puzzle items. Move or delete them first.")
    weeks = list(db.scalars(select(DailyThemeWeek.week_start).where(DailyThemeWeek.theme_id == theme_id)))
    ran = db.scalar(select(DailySet.day).where(DailySet.theme_id == theme_id).limit(1)) is not None
    this_week = content.week_start(bahrain_today())
    if ran or any(w <= this_week for w in weeks):
        raise conflict(
            "content_in_use", f"{theme.title} has run on the hub, so it stays. Leave it out of the rotation."
        )
    if weeks:
        first = min(weeks)
        raise conflict(
            "content_in_use", f"{theme.title} is planned for the week of {first.day} {first:%b %Y}. Change that first."
        )
    record(db, user, "daily.theme.delete", "daily_theme", theme_id, theme.title, ip, before=_theme_snapshot(theme))
    db.delete(theme)
    db.flush()
    return overview(db)


def set_week(db: Session, user: User, week: dt.date, body: WeekSave, ip: str | None) -> DailyContentOverview:
    """Names the theme for a week to come, or (theme null) gives the week back to the rotation. A week that started
    keeps its theme; a theme runs only once it has what every game needs (409 theme_not_ready)."""
    today = bahrain_today()
    if week.weekday() != 6:
        raise invalid("weekStart", "Weeks start on Sunday.")
    if week <= content.week_start(today):
        raise invalid("weekStart", "This week has started, so its theme stays.")
    if week > today + dt.timedelta(days=PREVIEW_DAYS):
        raise invalid("weekStart", "Plan up to a year ahead.")
    plan = content.schedule(db)
    before = plan.theme_id(week) if plan.rotation or plan.pinned else None
    if body.theme is None:
        if week not in plan.pinned:
            return overview(db)
        db.execute(delete(DailyThemeWeek).where(DailyThemeWeek.week_start == week))
    else:
        theme = _theme(db, body.theme)
        problems = theme_problems(db, theme.id, today)
        if problems:
            raise conflict("theme_not_ready", f"{theme.title} can't run yet. {problems[0]}")
        if plan.pinned.get(week) == theme.id:
            return overview(db)
        db.execute(
            pg_insert(DailyThemeWeek)
            .values(week_start=week, theme_id=theme.id)
            .on_conflict_do_update(index_elements=["week_start"], set_={"theme_id": theme.id})
        )
    after = content.schedule(db).theme_id(week)
    record(
        db,
        user,
        "daily.schedule.update",
        "daily_theme_week",
        week.isoformat(),
        f"the week of {week.day} {week:%b %Y}",
        ip,
        week=week.isoformat(),
        before=before,
        after=after,
        chosen=body.theme is not None,
    )
    return overview(db)


# ── bulk import ──────────────────────────────────────────────────────────────────────────────

Parsed = tuple[int, str, ItemData | None, str | None]  # line, the row as read, what it reads as, why not


def _short(text: str) -> str:
    text = _text(text)
    return text if len(text) <= 120 else f"{text[:119]}…"


def _word_rows(game: ContentGame, text: str) -> list[Parsed]:
    out: list[Parsed] = []
    for line, row in enumerate(text.splitlines(), 1):
        for word in SPLIT.split(row):
            if not word:
                continue
            data: ItemData
            if game == "word":
                data = WordData(game="word", word=word[:40])
            elif game == "search":
                data = SearchData(game="search", word=word[:40])
            else:
                data = NearestData(game="nearest", word=word[:40])
            out.append((line, word, data, None))
    return out


def _header(name: str) -> str:
    return re.sub(r"[^a-z0-9]", "", name.lower())


def _table(text: str) -> tuple[list[str], list[tuple[int, list[str]]]]:
    """The header and the rows of pasted CSV, or of cells copied from a spreadsheet (tabs), with their lines."""
    first = text.lstrip().split("\n", 1)[0]
    delimiter = "\t" if "\t" in first else (";" if ";" in first and "," not in first else ",")
    reader = csv.reader(io.StringIO(text.strip()), delimiter=delimiter)
    header = next(reader, [])
    rows = [(reader.line_num, cells) for cells in reader if any(c.strip() for c in cells)]
    return [_header(h) for h in header], rows


QUIZ_COLUMNS = {
    "question": "question",
    "prompt": "question",
    "answer": "answer",
    "correct": "answer",
    "correctanswer": "answer",
    "rightanswer": "answer",
    "explanation": "explanation",
    "explain": "explanation",
    "why": "explanation",
    "module": "module",
    "unitcode": "module",
}
QUIZ_HEADER = "question, answer, wrong 1, wrong 2, wrong 3, explanation, module"
GROUP_COLUMNS = {"label": "label", "group": "label", "connection": "label", "level": "level", "words": "words"}
GROUP_HEADER = "label, level, words"


def _quiz_rows(db: Session, text: str) -> list[Parsed]:
    header, rows = _table(text)
    columns = [
        QUIZ_COLUMNS.get(h) or ("wrong" if h.startswith(("wrong", "incorrect", "other")) else None) for h in header
    ]
    if "question" not in columns or "answer" not in columns or "wrong" not in columns:
        raise invalid("text", f"Start with a header row naming the columns: {QUIZ_HEADER}.")
    modules: dict[str, str] = {}
    for module_id, unit_code in db.execute(select(Module.id, Module.unit_code)):
        modules[module_id.casefold()] = module_id
        if unit_code:
            modules[unit_code.casefold()] = module_id
    out: list[Parsed] = []
    for line, cells in rows:
        values: dict[str, str] = {}
        wrong: list[str] = []
        for column, cell in zip(columns, cells, strict=False):
            if column == "wrong":
                if cell.strip():
                    wrong.append(cell)
            elif column is not None and column not in values:
                values[column] = cell
        shown = _short(" · ".join(c.strip() for c in cells if c.strip()))
        named = values.get("module", "").strip()
        module_id = modules.get(named.casefold()) if named else None
        if named and module_id is None:
            out.append((line, shown, None, f"There's no module “{named}”. Use its unit code, like ST2133."))
            continue
        try:
            data = QuizData(
                game="quiz",
                question=values.get("question", ""),
                options=[values.get("answer", ""), *wrong],
                answer=0,
                explanation=values.get("explanation", ""),
                module_id=module_id,
            )
        except ValidationError:
            out.append((line, shown, None, "Some of this row is too long for a quiz question."))
            continue
        out.append((line, shown, data, None))
    return out


def _group_rows(text: str) -> list[Parsed]:
    header, rows = _table(text)
    columns = [GROUP_COLUMNS.get(h) or ("words" if h.startswith("word") else None) for h in header]
    if "label" not in columns or "level" not in columns or "words" not in columns:
        raise invalid("text", f"Start with a header row naming the columns: {GROUP_HEADER}.")
    out: list[Parsed] = []
    for line, cells in rows:
        values: dict[str, str] = {}
        words: list[str] = []
        for column, cell in zip(columns, cells, strict=False):
            if column == "words":
                words += [w for w in SPLIT.split(cell) if w]
            elif column is not None and column not in values:
                values[column] = cell
        shown = _short(" · ".join(c.strip() for c in cells if c.strip()))
        level = re.sub(r"\D", "", values.get("level", ""))
        if level not in ("1", "2", "3", "4"):
            out.append((line, shown, None, "Give the level as 1 (plainest) to 4 (trickiest)."))
            continue
        try:
            data = GroupData(game="groups", label=values.get("label", ""), level=int(level), words=words)
        except ValidationError:
            out.append((line, shown, None, "Some of this row is too long for a group."))
            continue
        out.append((line, shown, data, None))
    return out


def _parse(db: Session, game: ContentGame, text: str) -> list[Parsed]:
    if game == "quiz":
        return _quiz_rows(db, text)
    if game == "groups":
        return _group_rows(text)
    return _word_rows(game, text)


def import_items(db: Session, user: User, body: ImportIn, ip: str | None) -> ImportReport:
    """Checks every pasted item as a form would, and adds those that pass in one go (none on a dry run). Items that
    clash with one listed earlier in the paste are refused too."""
    theme = _theme(db, body.theme)
    parsed = _parse(db, body.game, body.text)
    if not parsed:
        raise invalid("text", "Paste at least one item.")
    if len(parsed) > IMPORT_ROWS:
        raise invalid("text", f"Import up to {IMPORT_ROWS} items at a time.")
    _lock_themes(db, theme.id)
    trial = db.begin_nested() if body.dry_run else None
    if body.game == "word" and body.add_guesses:
        answers = [d.word.strip().upper() for _, _, d, _ in parsed if isinstance(d, WordData)]
        fresh = [w for w in dict.fromkeys(answers) if ANSWER.fullmatch(w)]
        if fresh:
            db.execute(pg_insert(DailyGuessWord).values([{"word": w} for w in fresh]).on_conflict_do_nothing())
    rows: list[ImportRow] = []
    keys: set[str] = set()
    claimed: set[str] = set()
    good: list[DailyItem] = []
    for line, shown, data, problem in parsed:
        read: ItemData | None = data
        if data is not None and problem is None:
            try:
                checked = check_item(db, theme.id, data)
            except ApiError as e:
                problem = e.message
            else:
                read = ITEM_DATA.validate_python({"game": data.game, **checked.data})
                grouped: set[str] = set(checked.data.get("words", []))
                if checked.key in keys:
                    problem = "It's in the list twice."
                elif grouped & claimed:
                    problem = f"“{min(grouped & claimed)}” is in another group of this list."
                else:
                    keys.add(checked.key)
                    claimed |= grouped
                    good.append(DailyItem(game=data.game, theme_id=theme.id, data=checked.data, key=checked.key))
        rows.append(ImportRow(line=line, text=shown, data=read, problem=problem))
    if trial is not None:
        trial.rollback()
        return ImportReport(rows=rows, added=0)
    if good:
        _add(db, good, "text")
        if body.game == "nearest":
            rank_secret_words(db, good)
        record(
            db,
            user,
            "daily.item.import",
            "daily_theme",
            theme.id,
            f"{_title(body.game)}: {len(good)} items in {theme.title}",
            ip,
            game=body.game,
            count=len(good),
            items=[_label(i) for i in good[:50]],
        )
    return ImportReport(rows=rows, added=len(good))


# ── preview ──────────────────────────────────────────────────────────────────────────────────


def _preview(puzzle: Any) -> PreviewPuzzle:
    if isinstance(puzzle, word_game.Puzzle):
        return PreviewWord(game="word", answer=puzzle.answer)
    if isinstance(puzzle, groups_game.Puzzle):
        groups = [PreviewGroup(label=g.label, level=g.level, words=list(g.words)) for g in puzzle.groups]
        return PreviewGroups(game="groups", groups=groups)
    if isinstance(puzzle, search_game.Puzzle):
        return PreviewSearch(game="search", words=[p.word for p in puzzle.placed], grid=list(puzzle.grid))
    if isinstance(puzzle, nearest_game.Puzzle):
        return PreviewNearest(game="nearest", target=puzzle.target, closest=list(puzzle.by_rank[1 : CLOSEST + 1]))
    questions = cast(tuple[quiz_game.Question, ...], puzzle)
    return PreviewQuiz(
        game="quiz",
        questions=[
            PreviewQuestion(
                prompt=q.prompt, options=list(q.options), answer=q.answer, explain=q.explain, source=q.source
            )
            for q in questions
        ],
    )


def preview(db: Session, day: dt.date) -> DayPreview:
    """A day's set: as it went out for a day that's out, otherwise as it would be made with the content as it is."""
    today = bahrain_today()
    if day < content.FIRST_DAY:
        first = content.FIRST_DAY
        raise invalid("day", f"The puzzles started on {first.day} {first:%B %Y}.")
    if day > today + dt.timedelta(days=PREVIEW_DAYS):
        raise invalid("day", "Preview a day in the next year.")
    games: list[PreviewGame] = []
    theme = None
    try:
        for game_id, maker in MAKERS.items():
            planned = content.plan_day(db, maker, day, today)
            theme = planned.theme
            game = cast(ContentGame, game_id)
            if planned.puzzle is None:
                problem = _problem(game_id, content.entries(db, game_id, planned.theme.id))
                games.append(PreviewGame(game=game, fixed=False, puzzle=None, problem=problem))
            else:
                games.append(PreviewGame(game=game, fixed=planned.fixed, puzzle=_preview(planned.puzzle), problem=None))
    except NoThemeError:
        raise invalid("day", "No theme runs that week. Put a theme in the rotation first.") from None
    if theme is None:  # pragma: no cover - MAKERS is never empty
        raise not_found()
    return DayPreview(day=day, theme=theme.public(), games=games)
