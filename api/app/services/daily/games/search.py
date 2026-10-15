"""Word search: eight words from the week's theme hidden in a 10 by 10 grid, in any of eight directions. A find is a
straight line from a word's first letter to its last; the server reads the letters on that line."""

from __future__ import annotations

import datetime as dt
import random
import string
from dataclasses import dataclass, field
from functools import cache

from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.errors import conflict
from app.schemas.daily import Cell, FindMove, HintMove, Move, SearchFound, SearchView
from app.services.daily import content
from app.services.daily.games.base import Game, Status, bad_move

SIZE = 10
WORDS = 8
HINT_COST = 10
MISS_FREE = 3  # misses that cost nothing
MISS_COST = 2
FLOOR = 30
DIRECTIONS = ((0, 1), (1, 0), (1, 1), (-1, 1), (0, -1), (-1, 0), (-1, -1), (1, -1))


@dataclass(frozen=True)
class Placed:
    word: str
    start: tuple[int, int]
    end: tuple[int, int]


@dataclass(frozen=True)
class Puzzle:
    grid: tuple[str, ...]
    placed: tuple[Placed, ...]  # alphabetical

    def word_at(self, start: Cell, end: Cell) -> str | None:
        """The letters on the straight line from `start` to `end`, or None when it isn't one."""
        dr, dc = end.row - start.row, end.col - start.col
        if (dr and dc and abs(dr) != abs(dc)) or (dr == 0 and dc == 0):
            return None
        steps = max(abs(dr), abs(dc))
        sr, sc = (dr > 0) - (dr < 0), (dc > 0) - (dc < 0)
        cells = [(start.row + sr * i, start.col + sc * i) for i in range(steps + 1)]
        if any(not (0 <= r < SIZE and 0 <= c < SIZE) for r, c in cells):
            return None
        return "".join(self.grid[r][c] for r, c in cells)


@dataclass
class SearchState:
    found: list[SearchFound] = field(default_factory=list)
    hints: list[Cell] = field(default_factory=list)
    misses: int = 0
    gave_up: bool = False


@cache
def bank() -> dict[str, tuple[str, ...]]:
    return {theme: tuple(w for w in words if len(w) <= SIZE) for theme, words in content.load("search.json").items()}


def _place(r: random.Random, words: list[str]) -> tuple[list[list[str]], list[Placed]] | None:
    grid = [[""] * SIZE for _ in range(SIZE)]
    placed: list[Placed] = []
    for word in sorted(words, key=len, reverse=True):
        spots = [
            (row, col, d)
            for row in range(SIZE)
            for col in range(SIZE)
            for d in DIRECTIONS
            if 0 <= row + d[0] * (len(word) - 1) < SIZE and 0 <= col + d[1] * (len(word) - 1) < SIZE
        ]
        r.shuffle(spots)
        for row, col, (dr, dc) in spots:
            cells = [(row + dr * i, col + dc * i) for i in range(len(word))]
            if all(grid[a][b] in ("", word[i]) for i, (a, b) in enumerate(cells)):
                for i, (a, b) in enumerate(cells):
                    grid[a][b] = word[i]
                placed.append(Placed(word, cells[0], cells[-1]))
                break
        else:
            return None
    return grid, placed


@cache
def _make(day: dt.date, _key: str) -> Puzzle:
    pool = bank()[content.theme_of(day).id]
    r = content.rng("search", day, "grid")
    words = content.pick_many(pool, WORDS, "search", day)
    for _ in range(20):
        made = _place(r, words)
        if made is not None:
            break
    else:  # pragma: no cover - eight short words always fit a 10 by 10 grid in a few tries
        raise RuntimeError("word search: no grid")
    grid, placed = made
    letters = string.ascii_uppercase
    rows = tuple("".join(ch or r.choice(letters) for ch in row) for row in grid)
    return Puzzle(rows, tuple(sorted(placed, key=lambda p: p.word)))


def _cell(at: tuple[int, int]) -> Cell:
    return Cell(row=at[0], col=at[1])


class SearchGame(Game[Puzzle, SearchState]):
    id = "search"
    title = "Word search"
    tagline = "Find eight of the week's words hidden in the grid."
    how_to = (
        "Words run in any direction: across, down, diagonally, and backwards.",
        "Drag from a word's first letter to its last, or tap the first letter and then the last.",
        "A hint shows where a word starts.",
    )
    scoring = (
        f"100 points, less {HINT_COST} a hint and {MISS_COST} a wrong line after the first {MISS_FREE}. "
        f"At least {FLOOR} when every word is found."
    )
    max_points = 100
    moves = frozenset({"find", "hint", "give-up"})
    max_moves = 200
    min_seconds = 15

    def puzzle(self, db: Session, day: dt.date, variant: str) -> Puzzle:
        return _make(day, get_settings().secret_key.get_secret_value())

    def start(self, puzzle: Puzzle) -> SearchState:
        return SearchState()

    def apply(self, puzzle: Puzzle, state: SearchState, move: Move) -> str:
        found = {f.word for f in state.found}
        if isinstance(move, FindMove):
            line = puzzle.word_at(move.start, move.end)
            if line is None:
                raise bad_move("Pick a straight line: across, down or diagonal.")
            for word in (line, line[::-1]):
                if any(p.word == word for p in puzzle.placed):
                    if word in found:
                        raise conflict("already_tried", "You've found that word already.")
                    start, end = (move.start, move.end) if word == line else (move.end, move.start)
                    state.found.append(SearchFound(word=word, start=start, end=end))
                    return "found"
            state.misses += 1
            return "miss"
        if isinstance(move, HintMove):
            hinted = {(h.row, h.col) for h in state.hints}
            left = [p for p in puzzle.placed if p.word not in found and p.start not in hinted]
            if not left:
                raise bad_move("There's nothing left to hint.")
            state.hints.append(_cell(left[0].start))
            return "hint"
        state.gave_up = True
        return "gave-up"

    def status(self, puzzle: Puzzle, state: SearchState) -> Status:
        if len(state.found) == len(puzzle.placed):
            return "won"
        return "lost" if state.gave_up else "playing"

    def points(self, puzzle: Puzzle, state: SearchState, variant: str, seconds: int) -> int:
        if self.status(puzzle, state) != "won":
            return 0
        cost = len(state.hints) * HINT_COST + max(0, state.misses - MISS_FREE) * MISS_COST
        return max(FLOOR, self.max_points - cost)

    def counts(self, state: SearchState) -> tuple[int, int]:
        return state.misses, len(state.hints)

    def view(self, puzzle: Puzzle, state: SearchState, over: bool) -> SearchView:
        found = list(state.found)
        if over:
            have = {f.word for f in found}
            found += [
                SearchFound(word=p.word, start=_cell(p.start), end=_cell(p.end))
                for p in puzzle.placed
                if p.word not in have
            ]
        return SearchView(
            kind="search",
            grid=list(puzzle.grid),
            words=[p.word for p in puzzle.placed],
            found=found,
            hints=state.hints,
            misses=state.misses,
        )

    def share(self, puzzle: Puzzle, state: SearchState, status: Status) -> str:
        n = len(state.found)
        hints = len(state.hints)
        head = f"Word search: {n}/{len(puzzle.placed)} words, {hints} hint{'s' if hints != 1 else ''}"
        return f"{head}\n{'🟩' * n}{'⬜' * (len(puzzle.placed) - n)}"
