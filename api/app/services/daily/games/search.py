"""Data Mine, as DSBA Daily plays it: the theme's words fill a 6 by 8 grid of letters exactly, each letter used by one
word, each word a chain of letters that touch (diagonals too). The player traces them. One of them, the spangram,
names the theme and runs from one side of the grid to the other. Any other real word of four letters or more is a
find of its own: three of them earn a hint, which outlines the letters of a theme word not found yet.

An item is one puzzle: a clue, the theme's name shown at the end, the spangram and the other words, 48 letters in all,
and their grid. The grid is laid out once, when the item is saved (layout(), which takes up to a few seconds), or comes
ready-made in a content file and is checked (laid_out()); no two paths cross diagonally, so the board stays readable."""

from __future__ import annotations

import datetime as dt
import gzip
import random
from collections.abc import Sequence
from dataclasses import dataclass, field
from functools import cache
from itertools import pairwise
from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import conflict
from app.schemas.daily import Cell, HintMove, Mark, Move, Picture, SearchFound, SearchView, TraceMove
from app.seed.loader import DAILY
from app.services.daily import content
from app.services.daily.content import Entry, Uses
from app.services.daily.games.base import ContentGame, Status, bad_move, rows_of

ROWS, COLS = 8, 6
LETTERS = ROWS * COLS  # a puzzle's words, the spangram with them, fill the grid exactly
MIN_LETTERS, MAX_LETTERS = 4, 12  # a theme word's length
MAX_SPANGRAM = 16  # the spangram is often two words in one: ISLAMICFINANCE
WORDS = (3, 9)  # theme words besides the spangram
PER_HINT = 3  # other words a hint takes
HINT_COST = 10
FLOOR = 40  # points for a finished grid, however many hints
ATTEMPTS = 400  # fresh starts generate() makes before it gives up
STEPS = 20_000  # moves one start may take

Spot = tuple[int, int]
Path = tuple[Spot, ...]


@cache
def dictionary() -> frozenset[str]:
    """English words of 4 to 12 letters (seed/data/daily/dictionary.txt.gz, from the MIT-licensed `word-list`): what
    counts as a word that isn't the theme's."""
    with gzip.open(DAILY / "dictionary.txt.gz", "rt", encoding="utf-8") as f:
        return frozenset(f.read().split())


# ── The grid ───────────────────────────────────────────────────────────────────────────────────────────────────────


def _in(r: int, c: int) -> bool:
    return 0 <= r < ROWS and 0 <= c < COLS


def _touch(a: Spot, b: Spot) -> bool:
    return a != b and abs(a[0] - b[0]) <= 1 and abs(a[1] - b[1]) <= 1


def is_path(cells: Sequence[Spot]) -> bool:
    """In the grid, each letter touching the one before, none used twice."""
    if not cells or len(set(cells)) != len(cells) or not all(_in(r, c) for r, c in cells):
        return False
    return all(_touch(cells[i - 1], cells[i]) for i in range(1, len(cells)))


def spans(cells: Sequence[Spot]) -> bool:
    """Whether a path touches two opposite sides: left and right, or top and bottom."""
    cols = {c for _, c in cells}
    rows = {r for r, _ in cells}
    return (0 in cols and COLS - 1 in cols) or (0 in rows and ROWS - 1 in rows)


def _cross(a: int, b: int) -> tuple[int, int] | None:
    """For a diagonal step between cells `a` and `b` (numbered row by row): its key and the key of the step that would
    cross it in the same square of four cells. None for a straight step."""
    ra, ca = divmod(a, COLS)
    rb, cb = divmod(b, COLS)
    if ra == rb or ca == cb:
        return None
    square = min(ra, rb) * COLS + min(ca, cb)
    down = (ra - rb) * (ca - cb) > 0
    return square * 2 + down, square * 2 + (not down)


# Each cell's neighbours, cells numbered row by row.
_NEAR = tuple(
    tuple((r + dr) * COLS + (c + dc) for dr in (-1, 0, 1) for dc in (-1, 0, 1) if (dr or dc) and _in(r + dr, c + dc))
    for r in range(ROWS)
    for c in range(COLS)
)


def generate(spangram: str, words: Sequence[str], r: random.Random) -> tuple[list[str], dict[str, Path]] | None:
    """Lays the spangram and the words out so they fill the grid exactly with no paths crossing: the grid's rows and
    each word's path, or None when no layout turned up (or a word comes twice). The spangram goes first, from an
    edge."""
    order = [spangram, *sorted(words, key=len, reverse=True)]
    if sum(map(len, order)) != LETTERS or len(set(order)) != len(order):
        return None
    for _ in range(ATTEMPTS):
        made = _attempt(order, r)
        if made is not None:
            grid = [["?"] * COLS for _ in range(ROWS)]
            for word, path in made.items():
                for (row, col), letter in zip(path, word, strict=True):
                    grid[row][col] = letter
            return ["".join(row) for row in grid], made
    return None


def _attempt(order: list[str], r: random.Random) -> dict[str, Path] | None:
    """One try at a layout, word by word, backing up when a word can't go on or would leave the rest no room."""
    owner = [-1] * LETTERS
    paths: list[list[int]] = []
    crossed: set[int] = set()
    steps = STEPS

    def fillable(remaining: list[int]) -> bool:
        """Every empty region can be filled exactly by some of the words left."""
        sums = {0}
        for length in remaining:
            sums |= {s + length for s in sums}
        seen = [False] * LETTERS
        for cell in range(LETTERS):
            if owner[cell] != -1 or seen[cell]:
                continue
            size, stack = 0, [cell]
            seen[cell] = True
            while stack:
                at = stack.pop()
                size += 1
                for n in _NEAR[at]:
                    if owner[n] == -1 and not seen[n]:
                        seen[n] = True
                        stack.append(n)
            if size not in sums:
                return False
        return True

    def free_count(cell: int) -> int:
        return sum(owner[n] == -1 for n in _NEAR[cell])

    def place(i: int) -> bool:
        if i == len(order):
            return True
        word = order[i]
        remaining = [len(w) for w in order[i + 1 :]]
        empty = [cell for cell in range(LETTERS) if owner[cell] == -1]
        if i == 0:  # the spangram starts on an edge it can cross the grid from
            starts = [cell for cell in empty if cell % COLS == 0 or (len(word) >= ROWS and cell < COLS)]
            r.shuffle(starts)
            starts = starts[:8]
        else:  # the tightest corners first: they are the hardest to fill later
            starts = sorted(empty, key=free_count)[:6]
            r.shuffle(starts)
        for start in starts:
            path = [start]
            owner[start] = i
            if extend(i, word, path, remaining):
                return True
            owner[start] = -1
            if steps <= 0:
                return False
        return False

    def extend(i: int, word: str, path: list[int], remaining: list[int]) -> bool:
        nonlocal steps
        steps -= 1
        if steps <= 0:
            return False
        if len(path) == len(word):
            if (i == 0 and not spans([divmod(c, COLS) for c in path])) or not fillable(remaining):
                return False
            paths.append(list(path))
            if place(i + 1):
                return True
            paths.pop()
            return False
        last = path[-1]
        options = [n for n in _NEAR[last] if owner[n] == -1]
        r.shuffle(options)
        for n in options:
            cross = _cross(last, n)
            if cross is not None and cross[1] in crossed:
                continue
            owner[n] = i
            path.append(n)
            if cross is not None:
                crossed.add(cross[0])
            if extend(i, word, path, remaining):
                return True
            if cross is not None:
                crossed.discard(cross[0])
            path.pop()
            owner[n] = -1
        return False

    if not place(0):
        return None
    return {w: tuple(divmod(c, COLS) for c in p) for w, p in zip(order, paths, strict=True)}


def layout(spangram: str, words: Sequence[str]) -> tuple[list[str], dict[str, Path]] | None:
    """The grid an item is saved with (the same words always give the same grid), or None when the words don't make
    one."""
    return generate(spangram, words, random.Random(spangram))  # noqa: S311 - repeatable, not secret


def laid_out(spangram: str, words: Sequence[str], grid: Sequence[str], paths: dict[str, Path]) -> bool:
    """Whether a grid made elsewhere (a content file's) is a fair one for these words: every word's path spells it, the
    paths share no letter and fill the grid, the spangram crosses it, and no two paths cross diagonally."""
    if len(grid) != ROWS or any(len(row) != COLS or not row.isascii() or not row.isupper() for row in grid):
        return False
    every = [spangram, *words]
    if sorted(paths) != sorted(every):
        return False
    used: set[Spot] = set()
    crossed: set[int] = set()
    for word in every:
        path = paths[word]
        if not is_path(path) or "".join(grid[r][c] for r, c in path) != word or used & set(path):
            return False
        used |= set(path)
        for a, b in pairwise(path):
            cross = _cross(a[0] * COLS + a[1], b[0] * COLS + b[1])
            if cross is not None:
                if cross[1] in crossed:
                    return False
                crossed.add(cross[0])
    return len(used) == LETTERS and spans(paths[spangram])


# ── The game ───────────────────────────────────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Puzzle:
    clue: str
    title: str  # the theme's name, shown once the play is over
    spangram: str
    words: tuple[str, ...]  # the theme's words besides the spangram
    grid: tuple[str, ...]
    paths: dict[str, Path]  # every theme word's letters, the spangram's too, in spelling order

    @property
    def all_words(self) -> tuple[str, ...]:
        return (*self.words, self.spangram)


@dataclass
class SearchState:
    found: list[str] = field(default_factory=list)  # theme words, in the order found
    others: list[str] = field(default_factory=list)  # real words that aren't the theme's
    hints: int = 0
    hinted: str | None = None  # the theme word a hint outlines, until it's found
    gave_up: bool = False


def _cells(path: Path) -> list[Cell]:
    return [Cell(row=r, col=c) for r, c in path]


def _next_hint(puzzle: Puzzle, state: SearchState) -> str | None:
    """The theme word a hint outlines: one not found yet, the spangram last."""
    left = [w for w in puzzle.all_words if w not in state.found]
    return next((w for w in left if w != puzzle.spangram), left[0] if left else None)


class SearchGame(ContentGame[Puzzle, SearchState]):
    id = "search"
    title = "Data Mine"
    tagline = "Trace the week's hidden words through the grid."
    how_to = (
        "The clue hints at the theme. Its words fill the grid: every letter belongs to one of them.",
        "Drag through letters that touch, diagonals too, or tap them one by one and tap the last again.",
        "One word, the spangram, names the theme and runs from one side of the grid to the other.",
        f"Any other word of {MIN_LETTERS} letters or more counts too: every {PER_HINT} earn a hint.",
    )
    scoring = f"100 points, less {HINT_COST} a hint. At least {FLOOR} when every word is found."
    max_points = 100
    moves = frozenset({"trace", "hint", "give-up"})
    max_moves = 300

    def choose(self, pool: list[Entry], used: Uses, day: dt.date, seed: bytes) -> list[Entry]:
        return content.spread(pool, used, day, 1, self.id, seed)

    def build(self, db: Session, day: dt.date, chosen: list[Entry], seed: bytes) -> Puzzle:
        """The item's own grid, laid out when it was saved (rules.py), so making the day's puzzle takes no time."""
        return self.load(db, chosen[0].data)

    def dump(self, puzzle: Puzzle) -> dict[str, Any]:
        return {
            "clue": puzzle.clue,
            "title": puzzle.title,
            "spangram": puzzle.spangram,
            "words": list(puzzle.words),
            "grid": list(puzzle.grid),
            "paths": {w: [list(at) for at in p] for w, p in puzzle.paths.items()},
        }

    def load(self, db: Session, data: dict[str, Any]) -> Puzzle:
        paths = {w: tuple((at[0], at[1]) for at in p) for w, p in data["paths"].items()}
        return Puzzle(data["clue"], data["title"], data["spangram"], tuple(data["words"]), tuple(data["grid"]), paths)

    def start(self, puzzle: Puzzle) -> SearchState:
        return SearchState()

    def apply(self, puzzle: Puzzle, state: SearchState, move: Move) -> str:
        if isinstance(move, TraceMove):
            return self._trace(puzzle, state, tuple((c.row, c.col) for c in move.cells))
        if isinstance(move, HintMove):
            if state.hinted is not None and state.hinted not in state.found:
                raise bad_move("Find the outlined word first.")
            if len(state.others) // PER_HINT <= state.hints:
                more = PER_HINT - len(state.others) % PER_HINT
                raise bad_move(f"Find {more} more {'word' if more == 1 else 'words'} to earn a hint.")
            hinted = _next_hint(puzzle, state)
            if hinted is None:
                raise bad_move("There's nothing left to hint.")
            state.hinted = hinted
            state.hints += 1
            return "hint"
        state.gave_up = True
        return "gave-up"

    def _trace(self, puzzle: Puzzle, state: SearchState, path: Path) -> str:
        if not is_path(path):
            raise bad_move("Trace letters that touch, without using one twice.")
        if len(path) < MIN_LETTERS:
            raise bad_move(f"Words have at least {MIN_LETTERS} letters.")
        word = "".join(puzzle.grid[r][c] for r, c in path)
        if puzzle.paths.get(word) == path:
            if word in state.found:
                raise conflict("already_tried", "You've found that word already.")
            state.found.append(word)
            if state.hinted == word:
                state.hinted = None
            return "spangram" if word == puzzle.spangram else "found"
        if word in state.others or word in state.found:
            raise conflict("already_tried", f"You've found “{word}” already.")
        if word not in dictionary():
            raise bad_move(f"“{word}” isn't a word we know.")
        state.others.append(word)
        return "word"

    def status(self, puzzle: Puzzle, state: SearchState) -> Status:
        if len(state.found) == len(puzzle.all_words):
            return "won"
        return "lost" if state.gave_up else "playing"

    def points(self, puzzle: Puzzle, state: SearchState, variant: str) -> int:
        if self.status(puzzle, state) != "won":
            return 0
        return max(FLOOR, self.max_points - state.hints * HINT_COST)

    def counts(self, state: SearchState) -> tuple[int, int]:
        return 0, state.hints

    def view(self, puzzle: Puzzle, state: SearchState, over: bool) -> SearchView:
        found = [SearchFound(word=w, cells=_cells(puzzle.paths[w]), spangram=w == puzzle.spangram) for w in state.found]
        if over:
            found += [
                SearchFound(word=w, cells=_cells(puzzle.paths[w]), spangram=w == puzzle.spangram, revealed=True)
                for w in puzzle.all_words
                if w not in state.found
            ]
        hinted = state.hinted if state.hinted is not None and state.hinted not in state.found and not over else None
        return SearchView(
            kind="search",
            clue=puzzle.clue,
            rows=ROWS,
            cols=COLS,
            grid=list(puzzle.grid),
            total=len(puzzle.all_words),
            found=found,
            others=len(state.others),
            hints_left=len(state.others) // PER_HINT - state.hints,
            hint_progress=len(state.others) % PER_HINT,
            # The outlined word's letters in reading order, so the hint doesn't spell it out.
            hint_cells=_cells(tuple(sorted(puzzle.paths[hinted]))) if hinted else [],
            title=puzzle.title if over else None,
        )

    def share(self, puzzle: Puzzle, state: SearchState, status: Status) -> str:
        marks = ["💡"] * state.hints + ["🟡" if w == puzzle.spangram else "🔵" for w in state.found]
        lines = ["".join(marks[i : i + 4]) for i in range(0, len(marks), 4)]
        return "\n".join([self.title, f"“{puzzle.clue}”", *lines])

    def picture(self, puzzle: Puzzle, state: SearchState) -> Picture:
        marks: list[Mark] = ["l1" if w == puzzle.spangram else "l3" for w in state.found]
        return rows_of(marks + ["miss"] * (len(puzzle.all_words) - len(state.found)), 4)
