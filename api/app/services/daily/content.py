"""The puzzles' content and each day's choices. The content lives in the database, edited in Manage
(app/services/daily/editor.py) and loaded from a file kept out of the repository (bundle.py).

- Themes take turns, a week each, from Sunday (the week in Bahrain): the themes in the rotation, in order. The
  schedule can name a theme for a week to come, and the rotation carries on after it. Once a week has started its
  theme is kept (daily_theme_weeks), so changing the rotation never changes a week that ran.
- A game's puzzle for a day is made the first time anyone asks for it, from the items of the day's theme (Sudoku
  from the seed alone), and stored with the items it took (daily_sets): plays are checked against the stored puzzle,
  so neither editing the content nor changing a key ever changes a day that is out. Only today and past days are
  stored; the editor's preview makes days to come without storing them.
- Each item runs as far as it can from its other days: items that never ran first, then those that ran longest ago.
  Ties go by an order drawn from the date with Daily's own random seed (daily_seed, made once per install), so the
  same content gives the same day for everyone, and which item falls on which day can't be worked out ahead."""

from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import math
import random
import secrets
import uuid
from collections.abc import Callable, Sequence
from contextlib import suppress
from dataclasses import dataclass
from typing import TYPE_CHECKING, Any

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.models import DailyItem, DailySeed, DailySet, DailySetItem, DailyTheme, DailyThemeWeek
from app.schemas.daily import Theme

if TYPE_CHECKING:
    from app.services.daily.games.base import ContentGame

# The first daily set. Theme weeks start on Sunday, as the week does in Bahrain.
FIRST_DAY = dt.date(2026, 10, 1)
EPOCH = dt.date(2026, 9, 27)  # the Sunday of FIRST_DAY's week
WEEK = dt.timedelta(days=7)


def week_start(day: dt.date) -> dt.date:
    """The Sunday that starts `day`'s week."""
    return day - dt.timedelta(days=(day.weekday() + 1) % 7)


def daily_seed(db: Session) -> bytes:
    """Daily's own random key, made the first time it's needed and kept (the caller commits)."""
    stored = db.scalar(select(DailySeed.seed).where(DailySeed.id == 1))
    if stored is None:
        db.execute(pg_insert(DailySeed).values(id=1, seed=secrets.token_hex(32)).on_conflict_do_nothing())
        stored = db.execute(select(DailySeed.seed).where(DailySeed.id == 1)).scalar_one()
    return bytes.fromhex(stored)


def _digest(seed: bytes, parts: tuple[object, ...]) -> bytes:
    return hmac.new(seed, "|".join(map(str, parts)).encode(), hashlib.sha256).digest()


def rng(seed: bytes, *parts: object) -> random.Random:
    """A random generator for one choice (`rng(seed, "sudoku", day, "hard")`): the same parts give the same
    numbers."""
    return random.Random(int.from_bytes(_digest(seed, parts)[:16], "big"))  # noqa: S311 - repeatable, not secret


def _order(seed: bytes, *parts: object) -> bytes:
    """A place in the day's own order of items, the same every time for the same parts."""
    return _digest(seed, parts)


# ── themes and the schedule ──────────────────────────────────────────────────────────────────


class NoThemeError(Exception):
    """No theme can run: the rotation is empty and no theme is scheduled."""


@dataclass(frozen=True)
class ThemeInfo:
    id: str
    title: str
    blurb: str
    position: int
    in_rotation: bool

    def public(self) -> Theme:
        return Theme(id=self.id, title=self.title, blurb=self.blurb)


@dataclass(frozen=True)
class Schedule:
    """Which theme runs which week: the weeks kept or chosen (`pinned`), and the rotation for the others."""

    themes: dict[str, ThemeInfo]
    pinned: dict[dt.date, str]  # week start -> theme id

    @property
    def rotation(self) -> list[str]:
        return [t.id for t in sorted(self.themes.values(), key=lambda t: (t.position, t.id)) if t.in_rotation]

    def theme_id(self, day: dt.date) -> str:
        week = week_start(day)
        if week in self.pinned:
            return self.pinned[week]
        rotation = self.rotation
        if not rotation:
            raise NoThemeError
        earlier = [w for w in self.pinned if w < week]
        if not earlier:
            return rotation[((week - EPOCH).days // 7) % len(rotation)]
        last = max(earlier)
        return self._after(self.pinned[last], (week - last).days // 7)

    def _after(self, theme_id: str, steps: int) -> str:
        """The theme `steps` turns after `theme_id` in the rotation. A theme out of the rotation sits where its
        position puts it, so the rotation carries on with the next theme after it."""
        rotation = self.rotation
        if theme_id in rotation:
            at = rotation.index(theme_id)
        else:
            place = self.themes[theme_id].position
            at = sum(self.themes[t].position <= place for t in rotation) - 1
        return rotation[(at + steps) % len(rotation)]

    def theme(self, day: dt.date) -> ThemeInfo:
        return self.themes[self.theme_id(day)]


def schedule(db: Session) -> Schedule:
    themes = {
        t.id: ThemeInfo(t.id, t.title, t.blurb, t.position, t.in_rotation) for t in db.scalars(select(DailyTheme))
    }
    pinned = dict(db.execute(select(DailyThemeWeek.week_start, DailyThemeWeek.theme_id)).tuples().all())
    return Schedule(themes, pinned)


def not_set_up() -> ApiError:
    return ApiError(404, "not_out_yet", "The daily puzzles aren't set up yet. Try again later.")


def theme_of(db: Session, day: dt.date) -> Theme:
    """The theme of `day`'s week, as the hub shows it."""
    try:
        return schedule(db).theme(day).public()
    except NoThemeError:
        raise not_set_up() from None


def themes_of(db: Session, days: Sequence[dt.date]) -> list[Theme]:
    """Each day's theme, as the hub shows it (one read of the schedule for them all)."""
    plan = schedule(db)
    try:
        return [plan.theme(d).public() for d in days]
    except NoThemeError:
        raise not_set_up() from None


def keep_weeks(db: Session, plan: Schedule, through: dt.date) -> None:
    """Fixes the theme of every week up to `through`'s, as it stands, so a change to the rotation leaves them be. A
    week with no theme (no rotation yet) has nothing to keep."""
    week, last = EPOCH, week_start(through)
    rows = []
    while week <= last:
        if week not in plan.pinned:
            with suppress(NoThemeError):
                rows.append({"week_start": week, "theme_id": plan.theme_id(week)})
        week += WEEK
    if rows:
        db.execute(pg_insert(DailyThemeWeek).values(rows).on_conflict_do_nothing())


# ── choosing a day's items ───────────────────────────────────────────────────────────────────


class NotReadyError(Exception):
    """The theme's items can't make this game's puzzle (too few of them, or none at a level)."""


@dataclass(frozen=True)
class Entry:
    """An item as the games use it: its id, theme and fields (and Nearest neighbour's ranking of the vocabulary)."""

    id: uuid.UUID
    theme: str
    data: dict[str, Any]
    ranking: tuple[str, ...] | None = None


Uses = dict[uuid.UUID, list[dt.date]]  # item -> the days it ran on


def entries(db: Session, game: str, theme: str) -> list[Entry]:
    """The theme's items for a game that can run (not retired), oldest first."""
    q = (
        select(DailyItem)
        .where(DailyItem.game == game, DailyItem.theme_id == theme, DailyItem.retired.is_(False))
        .order_by(DailyItem.created_at, DailyItem.id)
    )
    return [
        Entry(i.id, i.theme_id, dict(i.data), tuple(i.ranking) if i.ranking is not None else None)
        for i in db.scalars(q)
    ]


def uses(db: Session, game: str) -> Uses:
    out: Uses = {}
    for item_id, day in db.execute(select(DailySetItem.item_id, DailySetItem.day).where(DailySetItem.game == game)):
        out.setdefault(item_id, []).append(day)
    return out


def spread(
    pool: Sequence[Entry],
    used: Uses,
    day: dt.date,
    n: int,
    key: str,
    seed: bytes,
    fits: Callable[[list[Entry], Entry], bool] | None = None,
) -> list[Entry]:
    """`n` items for `day`, each as far as it can be from the days it ran on (items that never ran first); ties in
    the day's own order. `fits(chosen, item)` can refuse an item that clashes with those already chosen. Raises
    NotReadyError when the pool can't give `n`."""

    def distance(entry: Entry) -> float:
        days = used.get(entry.id)
        return min(abs((day - d).days) for d in days) if days else math.inf

    chosen: list[Entry] = []
    for entry in sorted(pool, key=lambda e: (-distance(e), _order(seed, key, day, e.id))):
        if fits is None or fits(chosen, entry):
            chosen.append(entry)
            if len(chosen) == n:
                return chosen
    raise NotReadyError(f"{key}: the theme's items can't give {n}")


# ── a day's puzzle ───────────────────────────────────────────────────────────────────────────


def make(
    db: Session, game: ContentGame[Any, Any], day: dt.date, theme: str, used: Uses, seed: bytes
) -> tuple[list[Entry], Any]:
    """The game's puzzle for `day` from the theme's items as they are now: (the items it took, the puzzle)."""
    chosen = game.choose(entries(db, game.id, theme), used, day, seed)
    return chosen, game.build(db, day, chosen, seed)


def not_ready() -> ApiError:
    return ApiError(404, "not_out_yet", "This puzzle isn't ready today. Try another game.")


def _stored(db: Session, day: dt.date, game: str, variant: str) -> dict[str, Any] | None:
    q = select(DailySet.puzzle).where(DailySet.day == day, DailySet.game == game, DailySet.variant == variant)
    found: dict[str, Any] | None = db.scalar(q)
    return found


def _store(
    db: Session,
    day: dt.date,
    game: str,
    variant: str,
    theme: str | None,
    puzzle: dict[str, Any],
    chosen: Sequence[Entry],
) -> dict[str, Any]:
    """Keeps a day's puzzle with the items it took, unless another request kept one first: then that one is the
    day's. The week's theme is kept with it."""
    added = db.execute(
        pg_insert(DailySet)
        .values(day=day, game=game, variant=variant, theme_id=theme, puzzle=puzzle)
        .on_conflict_do_nothing()
        .returning(DailySet.day)
    ).first()
    if added is None:
        kept = _stored(db, day, game, variant)
        if kept is None:  # pragma: no cover - the row that stopped the insert is there
            raise not_ready()
        return kept
    if chosen:
        rows = [{"day": day, "game": game, "variant": variant, "item_id": e.id} for e in chosen]
        db.execute(pg_insert(DailySetItem).values(rows))
    if theme is not None:
        week = pg_insert(DailyThemeWeek).values(week_start=week_start(day), theme_id=theme)
        db.execute(week.on_conflict_do_nothing())
    return puzzle


def day_puzzle(db: Session, game: ContentGame[Any, Any], day: dt.date) -> dict[str, Any]:
    """The game's puzzle for `day` as stored: made and stored the first time it's asked for. The caller commits.
    Raises not_out_yet (404) when the day's theme can't make it."""
    found = _stored(db, day, game.id, "")
    if found is not None:
        return found
    seed = daily_seed(db)
    try:
        theme = schedule(db).theme(day)
        chosen, puzzle = make(db, game, day, theme.id, uses(db, game.id), seed)
    except NoThemeError:
        raise not_set_up() from None
    except NotReadyError:
        raise not_ready() from None
    return _store(db, day, game.id, "", theme.id, game.dump(puzzle), chosen)


def seeded_puzzle(
    db: Session, game: str, variant: str, day: dt.date, make_one: Callable[[bytes], dict[str, Any]]
) -> dict[str, Any]:
    """A puzzle made from Daily's seed alone (Sudoku), as stored: made and stored the first time it's asked for."""
    found = _stored(db, day, game, variant)
    if found is not None:
        return found
    return _store(db, day, game, variant, None, make_one(daily_seed(db)), ())


@dataclass(frozen=True)
class Planned:
    fixed: bool  # stored: the puzzle as it went out
    puzzle: Any | None  # None when the theme can't make it
    theme: ThemeInfo


def plan_day(db: Session, game: ContentGame[Any, Any], day: dt.date, today: dt.date) -> Planned:
    """The game's puzzle for `day` without storing anything: as it went out when it's stored, otherwise as it would
    be made with the content as it is, after the days before it from today on."""
    plan = schedule(db)
    stored = db.get(DailySet, (day, game.id, ""))
    if stored is not None:
        theme = plan.themes[stored.theme_id] if stored.theme_id is not None else plan.theme(day)
        return Planned(True, game.load(db, stored.puzzle), theme)
    theme = plan.theme(day)
    seed = daily_seed(db)
    used = uses(db, game.id)
    out = set(db.scalars(select(DailySet.day).where(DailySet.game == game.id, DailySet.day >= today)))
    pools: dict[str, list[Entry]] = {}
    d = min(today, day)
    while d < day:
        if d not in out:
            theme_id = plan.theme_id(d)
            if theme_id not in pools:
                pools[theme_id] = entries(db, game.id, theme_id)
            try:
                for e in game.choose(pools[theme_id], used, d, seed):
                    used.setdefault(e.id, []).append(d)
            except NotReadyError:
                pass  # that day has no puzzle for this game: it takes nothing
        d += dt.timedelta(days=1)
    try:
        _, puzzle = make(db, game, day, theme.id, used, seed)
    except NotReadyError:
        return Planned(False, None, theme)
    return Planned(False, puzzle, theme)
