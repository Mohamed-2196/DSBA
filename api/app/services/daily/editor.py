"""Manage → Daily puzzles (holders of content.edit): the weekly themes and their schedule, each game's items, the
word game's guess list and Nearest neighbour's vocabulary, bulk imports, and a preview of any day's set.

- Items are checked against their game's rules, with the message on the field: an answer word is five letters and in
  the guess list; a group has four to eight different words (another group of its theme may have some of them: a day
  with both shows neither group those words); a quiz question has two to six different options and one right answer;
  a secret word is in the vocabulary.
- Saves name the version they were loaded at (409 puzzle_changed when someone saved since), and every change is
  audited with what changed, before and after.
- A theme runs while it's in the rotation or named for this week or one to come. A change that would leave a theme
  that runs without enough items for one of its games is refused (409 theme_not_ready), so every day can be made.
- Changes reach the days still to come: a day that is out keeps its puzzles (content.py). A fix to today's puzzle
  (today.py) is the one way to change a day that is out.
Services leave the commit to the handler."""

from __future__ import annotations

import csv
import datetime as dt
import io
import re
import uuid
from collections.abc import Iterable, Sequence
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
from app.seed.loader import SHORT_GUESS_LIST, guess_list_size
from app.services.content import record
from app.services.daily import content, rules
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
TAG = re.compile(r"[a-z][a-z-]{1,23}")
THEME_ID = re.compile(r"[a-z][a-z0-9-]{1,31}")
SPLIT = re.compile(r"[\s,;|]+")
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


# ── an item's rules (rules.py) ───────────────────────────────────────────────────────────────


def _theme(db: Session, theme_id: str) -> DailyTheme:
    return rules.known_theme(rules.Lookups(db), theme_id)


def check_item(db: Session, theme: str, data: ItemData, item_id: uuid.UUID | None = None) -> rules.Checked:
    """The item's fields as stored, or 422 with what to fix on the field (rules.py)."""
    return rules.check_item(rules.Lookups(db), theme, data, item_id)


# ── whether a theme can run ──────────────────────────────────────────────────────────────────


def _listed(parts: Sequence[str]) -> str:
    return parts[0] if len(parts) == 1 else f"{', '.join(parts[:-1])} and {parts[-1]}"


def problem_of(game: str, pool: Sequence[Entry]) -> str:
    """What a theme's items lack for a game, which it names as the hub does."""
    if game == "groups":
        name = groups_game.GroupsGame.title
        missing = [str(n) for n in range(1, groups_game.GROUPS + 1) if not any(e.data["level"] == n for e in pool)]
        if missing:
            return f"{name} needs a group at level {_listed(missing)}."
        return f"{name} needs four groups, one a level, that each keep four words the other three don't have."
    if game == "search":
        name = search_game.SearchGame.title
        if len(pool) >= search_game.WORDS:
            return (
                f"{name} needs {search_game.WORDS} words that fit together: none inside another, "
                f"{search_game.MAX_HIDDEN} letters at most."
            )
        return f"{name} needs at least {search_game.WORDS} words."
    if game == "quiz":
        return f"{quiz_game.QuizGame.title} needs at least {quiz_game.FROM_THEME} questions."
    if game == "nearest":
        return f"{nearest_game.NearestGame.title} needs at least one secret word."
    return f"{word_game.WordGame.title} needs at least one answer word."


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
            out.append(problem_of(game_id, pool))
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


def lock_themes(db: Session, *ids: str) -> None:
    """Item writes take their themes' rows in turn, so two editors can't each take a theme's last item."""
    for theme_id in sorted(set(ids)):
        db.get(DailyTheme, theme_id, with_for_update=True)


# ── items ────────────────────────────────────────────────────────────────────────────────────


def _snapshot(item: DailyItem) -> dict[str, Any]:
    return {"theme": item.theme_id, "data": dict(item.data), "retired": item.retired}


def what_changed(before: dict[str, Any], after: dict[str, Any]) -> dict[str, Any]:
    changed = [k for k in after if before.get(k) != after[k]]
    return {"before": {k: before.get(k) for k in changed}, "after": {k: after[k] for k in changed}}


def label_of(item: DailyItem) -> str:
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


def _in_today(db: Session, ids: Sequence[uuid.UUID]) -> set[uuid.UUID]:
    """Those of `ids` that today's puzzles, out already, took."""
    if not ids:
        return set()
    q = select(DailySetItem.item_id).where(DailySetItem.day == bahrain_today(), DailySetItem.item_id.in_(ids))
    return set(db.scalars(q))


def _out(item: DailyItem, use: tuple[int, dt.date] | None, in_today: bool) -> ItemOut:
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
        in_today=in_today,
        closest=closest,
        updated_at=item.updated_at,
    )


def items_out(db: Session, items: Sequence[DailyItem]) -> list[ItemOut]:
    ids = [i.id for i in items]
    used, today = _uses(db, ids), _in_today(db, ids)
    return [_out(i, used.get(i.id), i.id in today) for i in items]


def item_out(db: Session, item: DailyItem) -> ItemOut:
    return items_out(db, [item])[0]


def _escape(q: str) -> str:
    return q.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


def list_items(
    db: Session, game: ContentGame, theme: str | None, status: ItemStatus, q: str, limit: int, offset: int
) -> Page[ItemOut]:
    """A game's items, by theme and status, found by any of their words: in use first, by theme (and a group's
    level), then alphabetical."""
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
    order = (DailyItem.retired, DailyTheme.position, DailyItem.theme_id, DailyItem.data["level"].as_integer())
    rows = list(
        db.scalars(
            select(DailyItem)
            .join(DailyTheme, DailyTheme.id == DailyItem.theme_id)
            .where(*where)
            .order_by(*order, DailyItem.key, DailyItem.id)
            .limit(limit)
            .offset(offset)
        )
    )
    return Page(items=items_out(db, rows), total=total, limit=limit, offset=offset)


def locked_item(db: Session, item_id: uuid.UUID) -> DailyItem:
    item = db.get(DailyItem, item_id, with_for_update=True)
    if item is None:
        raise not_found("This item doesn't exist any more.")
    return item


def check_version(item: DailyItem | DailyTheme | DailyNearestWord, version: int) -> None:
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
    lock_themes(db, body.theme)
    checked = check_item(db, body.theme, body.data)
    item = DailyItem(game=body.data.game, theme_id=body.theme, data=checked.data, key=checked.key)
    _add(db, [item], rules.KEY_FIELD.get(item.game, "data.word"))
    if item.game == "nearest":
        rank_secret_words(db, [item])
    record(
        db, user, "daily.item.create", "daily_item", item.id, label_of(item), ip, game=item.game, after=_snapshot(item)
    )
    return _out(item, None, in_today=False)


class Saved(NamedTuple):
    before: dict[str, Any]  # the item's theme, fields and whether it's retired, before the save
    after: dict[str, Any]


def edit_item(db: Session, item: DailyItem, theme: str, data: ItemData) -> Saved | None:
    """Saves the item's fields as `data` has them, in `theme`, checked with its game's rules and undone (409
    theme_not_ready) when it would leave a theme that runs short. None when nothing changes. The caller has locked
    the item (locked_item) and checked its version and game."""
    lock_themes(db, item.theme_id, theme)
    checked = check_item(db, theme, data, item.id)
    before = _snapshot(item)
    after = {**before, "theme": theme, "data": checked.data}
    if after == before:
        return None
    with db.begin_nested():  # undone if it leaves a theme short
        item.theme_id, item.data, item.key = theme, checked.data, checked.key
        item.version += 1
        item.updated_at = utcnow()
        if item.game == "nearest":
            rank_secret_words(db, [item])
        if not item.retired:
            _ensure_ready(db, {before["theme"], item.theme_id})
    return Saved(before, after)


def save_item(db: Session, user: User, item_id: uuid.UUID, body: ItemSave, ip: str | None) -> ItemOut:
    """Saves the whole item, if nobody saved it since `body.version` (409 puzzle_changed)."""
    item = locked_item(db, item_id)
    check_version(item, body.version)
    if body.data.game != item.game:
        raise invalid("data.game", "An item stays in its game.")
    saved = edit_item(db, item, body.theme, body.data)
    if saved is not None:
        changes = what_changed(saved.before, saved.after)
        record(db, user, "daily.item.update", "daily_item", item.id, label_of(item), ip, game=item.game, **changes)
    return item_out(db, item)


def set_retired(db: Session, user: User, item_id: uuid.UUID, retired: bool, version: int, ip: str | None) -> ItemOut:
    """Retires an item (it never runs again; the days it ran keep it) or brings it back, checked again."""
    item = locked_item(db, item_id)
    check_version(item, version)
    if item.retired == retired:
        return item_out(db, item)
    lock_themes(db, item.theme_id)
    if not retired:
        check_item(db, item.theme_id, ITEM_DATA.validate_python({"game": item.game, **item.data}), item.id)
    with db.begin_nested():  # undone if it leaves a theme short
        item.retired = retired
        item.version += 1
        item.updated_at = utcnow()
        if retired:
            _ensure_ready(db, {item.theme_id})
    action = "daily.item.retire" if retired else "daily.item.restore"
    record(db, user, action, "daily_item", item.id, label_of(item), ip, game=item.game)
    return item_out(db, item)


def delete_item(db: Session, user: User, item_id: uuid.UUID, version: int, ip: str | None) -> None:
    """Deletes an item that never ran. One that ran is kept by its days: retire it instead (409 content_in_use)."""
    item = locked_item(db, item_id)
    check_version(item, version)
    ran = db.scalar(select(func.count()).where(DailySetItem.item_id == item.id)) or 0
    if ran:
        days = "1 day, which keeps" if ran == 1 else f"{ran} days, which keep"
        raise conflict("content_in_use", f"It ran on {days} it. Retire it instead, so it doesn't run again.")
    lock_themes(db, item.theme_id)
    before = _snapshot(item)
    with db.begin_nested():  # undone if it leaves a theme short
        db.delete(item)
        if not before["retired"]:
            _ensure_ready(db, {before["theme"]})
    record(db, user, "daily.item.delete", "daily_item", item_id, label_of(item), ip, game=item.game, before=before)


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


def check_tags_near(
    db: Session, word: str, tags: Sequence[str], near: Sequence[str], known: set[str] | None = None
) -> tuple[list[str], list[str]]:
    """A word's tags and close words as stored, or 422 with what to fix. `known`: the vocabulary's words, when the
    caller has read them already (a content file)."""
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
    if known is None:
        known = set(db.scalars(select(DailyNearestWord.word).where(DailyNearestWord.word.in_(clean_near))))
    missing = [n for n in clean_near if n not in known]
    if missing:
        raise invalid("near", f"“{missing[0]}” isn't in the vocabulary. Add it first, or leave it out.")
    return clean_tags, clean_near


def add_vocabulary(db: Session, user: User, body: VocabularyIn, ip: str | None) -> VocabularyOut:
    word = body.word.strip().lower()
    if not rules.VOCABULARY_WORD.fullmatch(word):
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
    check_version(row, body.version)
    tags, near = check_tags_near(db, word, body.tags, body.near)
    before = {"tags": list(row.tags), "near": list(row.near)}
    after = {"tags": tags, "near": near}
    if after == before:
        return _vocabulary_out(db, [row])[0]
    row.tags, row.near = tags, near
    row.version += 1
    row.updated_at = utcnow()
    rank_secret_words(db)
    record(db, user, "daily.vocabulary.update", "daily_word", word, word, ip, **what_changed(before, after))
    return _vocabulary_out(db, [row])[0]


def delete_vocabulary(db: Session, user: User, word: str, version: int, ip: str | None) -> None:
    """Deletes a word that isn't a secret word, and takes it off the close words of the others."""
    row = db.get(DailyNearestWord, word, with_for_update=True)
    if row is None:
        raise not_found("This word isn't in the vocabulary any more.")
    check_version(row, version)
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
            (good if rules.ANSWER.fullmatch(word) else bad).append(word)
    return list(dict.fromkeys(good)), list(dict.fromkeys(bad))


def add_guesses(db: Session, user: User, body: GuessAdd, ip: str | None) -> GuessAddReport:
    good, bad = _split_guesses(body.text)
    if not good and not bad:
        raise invalid("text", "Paste at least one word.")
    if len(good) + len(bad) > 5000:
        raise invalid("text", "Add up to 5,000 words at a time.")
    known = _known_guesses(db, good)
    new = [w for w in good if w not in known]
    if not body.dry_run:
        _insert_guesses(db, user, new, ip)
    total = (db.scalar(select(func.count()).select_from(DailyGuessWord)) or 0) + (len(new) if body.dry_run else 0)
    return GuessAddReport(new=new, known=[w for w in good if w in known], refused=bad, total=total)


def _known_guesses(db: Session, words: Sequence[str]) -> set[str]:
    return set(db.scalars(select(DailyGuessWord.word).where(DailyGuessWord.word.in_(words))))


def _insert_guesses(db: Session, user: User, words: Sequence[str], ip: str | None) -> None:
    """Adds words the guess list lacks, and audits them."""
    new = [w for w in words if w not in _known_guesses(db, words)]
    if not new:
        return
    db.execute(pg_insert(DailyGuessWord).values([{"word": w} for w in new]).on_conflict_do_nothing())
    title = f"{len(new)} words"
    record(db, user, "daily.guesses.add", "daily_guess_words", None, title, ip, count=len(new), words=new[:50])


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
    guesses = guess_list_size(db)
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
        guess_words=guesses,
        guess_list_short=guesses < SHORT_GUESS_LIST,
        vocabulary_words=db.scalar(select(func.count()).select_from(DailyNearestWord)) or 0,
        tags=tags,
    )


def _theme_snapshot(theme: DailyTheme) -> dict[str, Any]:
    return {"title": theme.title, "blurb": theme.blurb, "inRotation": theme.in_rotation}


def theme_text(title: str, blurb: str) -> tuple[str, str]:
    title, blurb = rules.tidy(title), rules.tidy(blurb)
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
    check_version(theme, body.version)
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
    record(db, user, "daily.theme.update", "daily_theme", theme.id, title, ip, **what_changed(before, after))
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
    check_version(theme, version)
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


def _theme_of_week(plan: Schedule, week: dt.date) -> str | None:
    try:
        return plan.theme_id(week)
    except NoThemeError:
        return None


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
    before = _theme_of_week(plan, week)
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
    after = _theme_of_week(content.schedule(db), week)
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
    text = rules.tidy(text)
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
    try:
        header = next(reader, [])
        rows = [(reader.line_num, cells) for cells in reader if any(c.strip() for c in cells)]
    except csv.Error:
        raise invalid(
            "text", "These rows can't be read. Copy them from the spreadsheet again, or paste plain text."
        ) from None
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
    lock_themes(db, theme.id)
    trial = db.begin_nested() if body.dry_run else None
    if body.game == "word" and body.add_guesses:  # audited like a paste into the guess list (a dry run undoes both)
        answers = [d.word.strip().upper() for _, _, d, _ in parsed if isinstance(d, WordData)]
        _insert_guesses(db, user, [w for w in dict.fromkeys(answers) if rules.ANSWER.fullmatch(w)], ip)
    rows: list[ImportRow] = []
    keys: set[str] = set()
    good: list[DailyItem] = []
    look = rules.Batch(db)  # what the rows' checks read, read once
    for line, shown, data, problem in parsed:
        read: ItemData | None = data
        if data is not None and problem is None:
            try:
                checked = rules.check_item(look, theme.id, data)
            except ApiError as e:
                problem = e.message
            else:
                read = ITEM_DATA.validate_python({"game": data.game, **checked.data})
                if checked.key in keys:
                    problem = "It's in the list twice."
                else:
                    keys.add(checked.key)
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
            items=[label_of(i) for i in good[:50]],
        )
    return ImportReport(rows=rows, added=len(good))


# ── preview ──────────────────────────────────────────────────────────────────────────────────


def preview_of(puzzle: Any) -> PreviewPuzzle:
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
                problem = problem_of(game_id, content.entries(db, game_id, planned.theme.id))
                games.append(PreviewGame(game=game, fixed=False, puzzle=None, problem=problem))
            else:
                games.append(
                    PreviewGame(game=game, fixed=planned.fixed, puzzle=preview_of(planned.puzzle), problem=None)
                )
    except NoThemeError:
        raise invalid("day", "No theme runs that week. Put a theme in the rotation first.") from None
    if theme is None:  # pragma: no cover - MAKERS is never empty
        raise not_found()
    return DayPreview(day=day, theme=theme.public(), games=games)
