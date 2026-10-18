"""Data Mine's eight words a day: they fit together (none inside another, 60 letters at most), and a theme the
readiness check calls ready makes every day, however tight its words are."""

from __future__ import annotations

import datetime as dt
import uuid

import pytest
from sqlalchemy.orm import Session

from app.services.daily import content, editor
from app.services.daily.content import Entry, NotReadyError, Uses
from app.services.daily.games.search import MAX_HIDDEN, WORDS, SearchGame, _fits

SEED = b"a seed for these tests"
DAY = dt.date(2026, 10, 20)
GAME = SearchGame()
# 65 letters: eight of them fit the grid only without one of the ten-letter words or the nine-letter one.
TIGHT = ["REGRESSION", "HYPOTHESIS", "PERCENTILE", "COVARIANCE", "HISTOGRAM", "MEAN", "MODE", "SKEW", "TAIL"]


def words(chosen: list[Entry]) -> list[str]:
    return [str(e.data["word"]) for e in chosen]


def test_a_tight_theme_makes_every_day(db: Session) -> None:
    pool = [Entry(uuid.uuid4(), "alpha", {"word": w}) for w in TIGHT]
    assert GAME.choose(pool, {}, DAY, editor.READINESS)  # the readiness check calls it ready
    used: Uses = {}
    stuck = 0
    for n in range(60):
        day = DAY + dt.timedelta(days=n)
        try:  # taking the first word that fits, in the day's order, gets stuck on some days
            content.spread(pool, used, day, WORDS, GAME.id, SEED, _fits)
        except NotReadyError:
            stuck += 1
        chosen = GAME.choose(pool, used, day, SEED)
        assert len(chosen) == WORDS
        assert sum(map(len, words(chosen))) <= MAX_HIDDEN
        GAME.build(db, day, chosen, SEED)  # and the grid takes them
        for e in chosen:
            used.setdefault(e.id, []).append(day)
    assert stuck > 0


def test_a_theme_without_eight_words_that_fit_is_not_ready() -> None:
    # Eight words, but two of them hold others: no eight fit together.
    crowded = [*TIGHT[:4], "MEANS", "MEAN", "MODES", "MODE"]
    pool = [Entry(uuid.uuid4(), "alpha", {"word": w}) for w in crowded]
    for order in (SEED, editor.READINESS):
        with pytest.raises(NotReadyError):
            GAME.choose(pool, {}, DAY, order)
