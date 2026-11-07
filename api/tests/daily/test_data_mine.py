"""Data Mine, DSBA Daily's way: the layout fills the grid exactly with no paths crossing, a grid from elsewhere is
checked as strictly, and a play finds theme words, the spangram and other words, which earn hints."""

from __future__ import annotations

import datetime as dt
import random
import uuid

import pytest
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.schemas.daily import Cell, GiveUpMove, HintMove, TraceMove
from app.services.daily.content import Entry
from app.services.daily.games import search
from app.services.daily.games.search import COLS, LETTERS, ROWS, Puzzle, SearchGame
from tests.daily.conftest import SEARCH, search_data

GAME = SearchGame()
DAY = dt.date(2026, 11, 1)
SPANGRAM, WORDS = SEARCH["alpha"][0][2], SEARCH["alpha"][0][3]


def puzzle(db: Session) -> Puzzle:
    return GAME.build(db, DAY, [Entry(uuid.uuid4(), "alpha", search_data(SPANGRAM))], b"seed")


def trace(path: tuple[tuple[int, int], ...]) -> TraceMove:
    return TraceMove(kind="trace", cells=[Cell(row=r, col=c) for r, c in path])


def other_words(p: Puzzle, n: int) -> list[tuple[tuple[int, int], ...]]:
    """`n` paths through the grid that spell real words which aren't the theme's."""
    found: dict[str, tuple[tuple[int, int], ...]] = {}

    def walk(path: list[tuple[int, int]]) -> None:
        if len(found) >= n:
            return
        word = "".join(p.grid[r][c] for r, c in path)
        if len(path) >= 4 and word in search.dictionary() and word not in p.paths and word not in found:
            found[word] = tuple(path)
        if len(path) == 6:
            return
        r, c = path[-1]
        for dr in (-1, 0, 1):
            for dc in (-1, 0, 1):
                nxt = (r + dr, c + dc)
                if 0 <= nxt[0] < ROWS and 0 <= nxt[1] < COLS and nxt not in path:
                    walk([*path, nxt])

    for r in range(ROWS):
        for c in range(COLS):
            walk([(r, c)])
    assert len(found) >= n, "the test grid has too few other words"
    return list(found.values())[:n]


def test_the_layout_fills_the_grid_and_the_spangram_crosses_it() -> None:
    made = search.layout(SPANGRAM, WORDS)
    assert made is not None
    grid, paths = made
    assert len(grid) == ROWS
    assert all(len(row) == COLS for row in grid)
    assert sorted(paths) == sorted([SPANGRAM, *WORDS])
    assert sum(len(p) for p in paths.values()) == LETTERS
    assert search.spans(paths[SPANGRAM])
    assert search.laid_out(SPANGRAM, WORDS, grid, paths)
    assert search.layout(SPANGRAM, WORDS) == made  # the same words, the same grid


def test_words_that_dont_fill_the_grid_have_no_layout() -> None:
    assert search.layout(SPANGRAM, WORDS[:-1]) is None
    assert search.generate("ABCDEFGHIJKL", ["MNOP"] * 9, random.Random(1)) is None


def test_a_grid_from_elsewhere_is_checked() -> None:
    made = search.layout(SPANGRAM, WORDS)
    assert made is not None
    grid, paths = made
    swapped = [grid[0][::-1], *grid[1:]]
    assert not search.laid_out(SPANGRAM, WORDS, swapped, paths)  # a path no longer spells its word
    short = {w: p for w, p in paths.items() if w != WORDS[0]}
    assert not search.laid_out(SPANGRAM, WORDS, grid, short)  # a word without a path


def test_paths_are_letters_that_touch() -> None:
    assert search.is_path(((0, 0), (1, 1), (2, 1)))
    assert not search.is_path(((0, 0), (0, 2)))  # a gap
    assert not search.is_path(((0, 0), (0, 1), (0, 0)))  # a letter twice
    assert not search.is_path(((0, 0), (0, -1)))  # off the grid


def test_a_play_finds_words_earns_hints_and_wins(db: Session) -> None:
    p = puzzle(db)
    state = GAME.start(p)
    with pytest.raises(ApiError, match="at least 4 letters"):
        GAME.apply(p, state, trace(p.paths[WORDS[0]][:3]))
    with pytest.raises(ApiError, match="Find 3 more words"):
        GAME.apply(p, state, HintMove(kind="hint"))
    for path in other_words(p, 3):
        assert GAME.apply(p, state, trace(path)) == "word"
    with pytest.raises(ApiError, match="already"):
        GAME.apply(p, state, trace(other_words(p, 1)[0]))
    assert GAME.apply(p, state, HintMove(kind="hint")) == "hint"
    view = GAME.view(p, state, over=False)
    assert (view.hints_left, len(view.hint_cells)) == (0, len(state.hinted or ""))
    assert state.hinted != SPANGRAM  # the spangram is hinted last
    with pytest.raises(ApiError, match="outlined word first"):
        GAME.apply(p, state, HintMove(kind="hint"))
    for word in p.all_words:
        assert GAME.apply(p, state, trace(p.paths[word])) == ("spangram" if word == SPANGRAM else "found")
    assert GAME.status(p, state) == "won"
    assert GAME.points(p, state, "") == 90
    assert GAME.view(p, state, over=True).title == "Statistics"
    assert GAME.share(p, state, "won").splitlines()[:3] == ["Data Mine", "“Numbers that tell a story”", "💡🔵🔵🔵"]


def test_a_theme_word_counts_only_along_its_own_path(db: Session) -> None:
    p = puzzle(db)
    state = GAME.start(p)
    backwards = tuple(reversed(p.paths[WORDS[0]]))
    with pytest.raises(ApiError):
        GAME.apply(p, state, trace(backwards))
    assert state.found == []


def test_giving_up_shows_every_word_and_no_title_before(db: Session) -> None:
    p = puzzle(db)
    state = GAME.start(p)
    assert GAME.view(p, state, over=False).title is None
    GAME.apply(p, state, trace(p.paths[WORDS[0]]))
    GAME.apply(p, state, GiveUpMove(kind="give-up"))
    assert GAME.status(p, state) == "lost"
    view = GAME.view(p, state, over=True)
    assert [f.revealed for f in view.found].count(False) == 1
    assert len(view.found) == len(p.all_words)
    assert GAME.points(p, state, "") == 0
