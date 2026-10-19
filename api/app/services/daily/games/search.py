"""Word search: eight words from the week's theme hidden in a 10 by 10 grid, in any of eight directions. A find is a
straight line from a word's first letter to its last; the server reads the letters on that line."""

from __future__ import annotations

import datetime as dt
import random
import string
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import conflict
from app.schemas.daily import Cell, FindMove, HintMove, Mark, Move, Picture, SearchFound, SearchView
from app.services.daily import content
from app.services.daily.content import CantFixError, Entry, NotReadyError, Uses
from app.services.daily.games.base import ContentGame, Status, bad_move, rows_of

SIZE = 10
WORDS = 8
MIN_LETTERS, MAX_LETTERS = 4, SIZE  # a word's length
MAX_HIDDEN = 60  # letters in the day's eight words together, so they fit the grid with room to spare
CHOICES = 20_000  # the most words choose() weighs for a day before it calls the theme not ready
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


def _fits(chosen: list[Entry], entry: Entry) -> bool:
    """No word inside another (a find of one would read as the other), and room in the grid."""
    word = entry.data["word"]
    others = [c.data["word"] for c in chosen]
    return all(word not in o and o not in word for o in others) and len(word) + sum(map(len, others)) <= MAX_HIDDEN


def _can_finish(chosen: list[Entry], rest: list[Entry]) -> bool:
    """Whether the words left could still fill the day's places: enough of them fit with those chosen, and the
    shortest of them leave room in the grid."""
    need = WORDS - len(chosen)
    lengths = sorted(len(e.data["word"]) for e in rest if _fits(chosen, e))
    letters = sum(len(e.data["word"]) for e in chosen)
    return len(lengths) >= need and letters + sum(lengths[:need]) <= MAX_HIDDEN


def _cell(at: tuple[int, int]) -> Cell:
    return Cell(row=at[0], col=at[1])


class SearchGame(ContentGame[Puzzle, SearchState]):
    id = "search"
    title = "Data Mine"
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

    def choose(self, pool: list[Entry], used: Uses, day: dt.date, seed: bytes) -> list[Entry]:
        """Eight words that fit together, in the order content.ranked() gives: a word is taken only when the words
        after it can still fill the places left, and a choice that leads nowhere is undone. So a day finds eight
        whenever the theme has eight that fit, whatever the order, and the readiness check can ask any order."""
        ranked = content.ranked(pool, used, day, self.id, seed)
        weighed = 0

        def pick(chosen: list[Entry], start: int) -> list[Entry] | None:
            nonlocal weighed
            if len(chosen) == WORDS:
                return chosen
            for at in range(start, len(ranked)):
                entry = ranked[at]
                weighed += 1
                if weighed > CHOICES:
                    raise NotReadyError("search: too many ways to weigh")
                taken = [*chosen, entry]
                if _fits(chosen, entry) and _can_finish(taken, ranked[at + 1 :]):
                    found = pick(taken, at + 1)
                    if found is not None:
                        return found
            return None

        found = pick([], 0)
        if found is None:
            raise NotReadyError(f"search: the theme's words can't give {WORDS} that fit together")
        return found

    def build(self, db: Session, day: dt.date, chosen: list[Entry], seed: bytes) -> Puzzle:
        r = content.rng(seed, self.id, day, "grid")
        words = [str(e.data["word"]) for e in chosen]
        for _ in range(50):
            made = _place(r, words)
            if made is not None:
                break
        else:  # pragma: no cover - eight words of at most 60 letters fit a 10 by 10 grid in a few tries
            raise NotReadyError("word search: no grid")
        grid, placed = made
        letters = string.ascii_uppercase
        rows = tuple("".join(ch or r.choice(letters) for ch in row) for row in grid)
        return Puzzle(rows, tuple(sorted(placed, key=lambda p: p.word)))

    def rebuild(
        self, db: Session, day: dt.date, puzzle: Puzzle, before: list[Entry], after: list[Entry], seed: bytes
    ) -> Puzzle:
        """The grid stays while the words do; a word fixed lays the grid out again."""
        words = sorted(str(e.data["word"]) for e in after)
        if words == sorted(p.word for p in puzzle.placed):
            return puzzle
        for e in after:
            word = str(e.data["word"])
            inside = next((w for w in words if w != word and word in w), None)
            if inside is not None:
                raise CantFixError(
                    "data.word",
                    f"“{word}” is inside “{inside}”, another of today's words: a find of one would read as both.",
                )
        letters = sum(map(len, words))
        if letters > MAX_HIDDEN:
            raise CantFixError(
                "data.word", f"Today's eight words would come to {letters} letters, and the grid takes {MAX_HIDDEN}."
            )
        return self.build(db, day, sorted(after, key=lambda e: str(e.data["word"])), seed)

    def dump(self, puzzle: Puzzle) -> dict[str, Any]:
        placed = [{"word": p.word, "start": list(p.start), "end": list(p.end)} for p in puzzle.placed]
        return {"grid": list(puzzle.grid), "placed": placed}

    def load(self, db: Session, data: dict[str, Any]) -> Puzzle:
        placed = (Placed(p["word"], (p["start"][0], p["start"][1]), (p["end"][0], p["end"][1])) for p in data["placed"])
        return Puzzle(tuple(data["grid"]), tuple(placed))

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

    def points(self, puzzle: Puzzle, state: SearchState, variant: str) -> int:
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
                SearchFound(word=p.word, start=_cell(p.start), end=_cell(p.end), revealed=True)
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
        head = f"{self.title} {n}/{len(puzzle.placed)} words, {hints} hint{'s' if hints != 1 else ''}"
        return f"{head}\n{'🟩' * n}{'⬜' * (len(puzzle.placed) - n)}"

    def picture(self, puzzle: Puzzle, state: SearchState) -> Picture:
        found: list[Mark] = ["hit"] * len(state.found)
        return rows_of(found + ["miss"] * (len(puzzle.placed) - len(state.found)), 4)
