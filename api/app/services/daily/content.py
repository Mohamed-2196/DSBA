"""The puzzles' content and the day's choices. Everything comes from the JSON files in `data/` (checked by
tests/daily/test_content.py), and every choice is a pure function of the Bahrain date, so a day's set is the same
for everyone. The choices are seeded with a key derived from DSBA_SECRET_KEY: the content is in the repository, but
which puzzle falls on which day can't be worked out ahead of time."""

from __future__ import annotations

import datetime as dt
import hashlib
import hmac
import json
import random
from collections.abc import Callable, Sequence
from functools import cache
from pathlib import Path
from typing import Any, TypeVar

from app.config import get_settings
from app.schemas.daily import Theme

T = TypeVar("T")
DATA = Path(__file__).parent / "data"

# The first daily set. Theme weeks start on Sunday, as the week does in Bahrain.
FIRST_DAY = dt.date(2026, 10, 1)
EPOCH = dt.date(2026, 9, 27)  # the Sunday of FIRST_DAY's week


def load(name: str) -> Any:
    return json.loads((DATA / name).read_text(encoding="utf-8"))


@cache
def themes() -> tuple[Theme, ...]:
    return tuple(Theme.model_validate(t) for t in load("themes.json"))


def week_start(day: dt.date) -> dt.date:
    """The Sunday that starts `day`'s week."""
    return day - dt.timedelta(days=(day.weekday() + 1) % 7)


def _week_index(day: dt.date) -> int:
    return (week_start(day) - EPOCH).days // 7


def theme_of(day: dt.date) -> Theme:
    """The week's theme: the themes take turns, a week each."""
    all_themes = themes()
    return all_themes[_week_index(day) % len(all_themes)]


def _theme_slot(day: dt.date) -> int:
    """How many of the theme's days came before `day`: the nth time a theme comes round, times seven, plus the day
    of the week. Picking item `slot` of a shuffled pool gives each theme day its own item until the pool runs out."""
    return (_week_index(day) // len(themes())) * 7 + (day - week_start(day)).days


def rng(*parts: object) -> random.Random:
    """A random generator for one choice (`rng("sudoku", day, "hard")`): the same parts give the same numbers."""
    key = hmac.new(get_settings().secret_key.get_secret_value().encode(), b"dsba-daily", hashlib.sha256).digest()
    seed = hmac.new(key, "|".join(map(str, parts)).encode(), hashlib.sha256).digest()
    return random.Random(int.from_bytes(seed[:16], "big"))  # noqa: S311 - repeatable puzzles, not secrets


def _stream(pool: Sequence[T], game: str, theme: str, start: int) -> Callable[[], T]:
    """The pool as an endless sequence, reshuffled each time round, read from position `start`."""
    position = start

    def take() -> T:
        nonlocal position
        cycle, at = divmod(position, len(pool))
        order = list(pool)
        rng(game, theme, "cycle", cycle).shuffle(order)
        position += 1
        return order[at]

    return take


def pick(pool: Sequence[T], game: str, day: dt.date) -> T:
    """The day's item from a theme's pool: no repeats until the whole pool has had its turn."""
    return _stream(pool, game, theme_of(day).id, _theme_slot(day))()


def pick_many(
    pool: Sequence[T], n: int, game: str, day: dt.date, fits: Callable[[list[T], T], bool] | None = None
) -> list[T]:
    """`n` different items for the day, in the same way as pick(); `fits(chosen, item)` can refuse an item that
    clashes with those already chosen. Raises ValueError when the pool can't give `n`."""
    take = _stream(pool, game, theme_of(day).id, _theme_slot(day) * n)
    chosen: list[T] = []
    for _ in range(len(pool) * 3):
        item = take()
        if item not in chosen and (fits is None or fits(chosen, item)):
            chosen.append(item)
            if len(chosen) == n:
                return chosen
    raise ValueError(f"{game}: the pool can't give {n} items")
