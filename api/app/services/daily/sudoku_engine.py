"""Sudoku without guesswork for the player: a solver that counts solutions, a seeded generator of puzzles with exactly
one solution, and a grader that checks which solving techniques a puzzle needs.

A grid is 81 ints in reading order, 0 for an empty cell."""

from __future__ import annotations

import random
from collections.abc import Sequence
from typing import Literal

Difficulty = Literal["easy", "medium", "hard"]
ALL = 0x3FE  # bits 1..9
UNITS: list[list[int]] = (
    [[r * 9 + c for c in range(9)] for r in range(9)]
    + [[r * 9 + c for r in range(9)] for c in range(9)]
    + [[(br * 3 + r) * 9 + bc * 3 + c for r in range(3) for c in range(3)] for br in range(3) for bc in range(3)]
)
PEERS: list[tuple[int, ...]] = [
    tuple(sorted({p for unit in UNITS if i in unit for p in unit} - {i})) for i in range(81)
]
UNITS_OF: list[tuple[list[int], ...]] = [tuple(unit for unit in UNITS if i in unit) for i in range(81)]

# Clues left in a puzzle, and how far the generator may go: easy falls to singles alone, medium needs hidden singles
# too, hard needs more than both (or is simply very sparse).
TARGET_GIVENS: dict[Difficulty, int] = {"easy": 38, "medium": 30, "hard": 24}


def _bits(mask: int) -> list[int]:
    return [d for d in range(1, 10) if mask >> d & 1]


def _candidates(grid: Sequence[int], i: int) -> int:
    used = 0
    for p in PEERS[i]:
        used |= 1 << grid[p]
    return ALL & ~used


def count_solutions(grid: Sequence[int], limit: int = 2) -> int:
    """How many solutions the grid has, counting no further than `limit`."""
    cells = list(grid)
    found = 0

    def search() -> bool:
        nonlocal found
        best, best_mask, best_n = -1, 0, 10
        for i in range(81):
            if cells[i] == 0:
                mask = _candidates(cells, i)
                n = mask.bit_count()
                if n == 0:
                    return False
                if n < best_n:
                    best, best_mask, best_n = i, mask, n
                    if n == 1:
                        break
        if best < 0:
            found += 1
            return found >= limit
        for d in _bits(best_mask):
            cells[best] = d
            if search():
                return True
        cells[best] = 0
        return False

    search()
    return found


def solve(grid: Sequence[int]) -> list[int] | None:
    """The first solution found, or None."""
    cells = list(grid)

    def search() -> bool:
        best, best_mask, best_n = -1, 0, 10
        for i in range(81):
            if cells[i] == 0:
                mask = _candidates(cells, i)
                n = mask.bit_count()
                if n == 0:
                    return False
                if n < best_n:
                    best, best_mask, best_n = i, mask, n
        if best < 0:
            return True
        for d in _bits(best_mask):
            cells[best] = d
            if search():
                return True
        cells[best] = 0
        return False

    return cells if search() else None


def _full_grid(rng: random.Random) -> list[int]:
    cells = [0] * 81

    def fill(i: int) -> bool:
        if i == 81:
            return True
        digits = _bits(_candidates(cells, i))
        rng.shuffle(digits)
        for d in digits:
            cells[i] = d
            if fill(i + 1):
                return True
        cells[i] = 0
        return False

    fill(0)
    return cells


def logic_level(grid: Sequence[int]) -> Literal["singles", "hidden", "beyond"]:
    """The simplest techniques that solve the grid: naked singles alone, singles with hidden singles, or more."""
    cells = list(grid)
    used_hidden = False
    while 0 in cells:
        progress = False
        for i in range(81):
            if cells[i] == 0:
                mask = _candidates(cells, i)
                if mask.bit_count() == 1:
                    cells[i] = mask.bit_length() - 1
                    progress = True
        if progress:
            continue
        for unit in UNITS:
            for d in range(1, 10):
                if any(cells[i] == d for i in unit):
                    continue
                spots = [i for i in unit if cells[i] == 0 and _candidates(cells, i) >> d & 1]
                if len(spots) == 1:
                    cells[spots[0]] = d
                    progress = used_hidden = True
        if not progress:
            return "beyond"
    return "hidden" if used_hidden else "singles"


def _fits(grid: Sequence[int], difficulty: Difficulty) -> bool:
    if count_solutions(grid) != 1:
        return False
    level = logic_level(grid)
    if difficulty == "easy":
        return level == "singles"
    if difficulty == "medium":
        return level in ("singles", "hidden")
    return True


def _carve(rng: random.Random, difficulty: Difficulty) -> tuple[list[int], list[int]]:
    solution = _full_grid(rng)
    puzzle = list(solution)
    target = TARGET_GIVENS[difficulty]
    givens = 81
    pairs = list(range(41))  # 40 symmetric pairs and the centre
    rng.shuffle(pairs)
    singles = list(range(81))  # then single cells, for the sparse end
    rng.shuffle(singles)
    for cells in [{i, 80 - i} for i in pairs] + [{i} for i in singles]:
        if givens - len(cells) < target or any(puzzle[c] == 0 for c in cells):
            continue
        trial = list(puzzle)
        for c in cells:
            trial[c] = 0
        if _fits(trial, difficulty):
            puzzle = trial
            givens -= len(cells)
    return puzzle, solution


# What each difficulty prefers among a few tries: medium wants hidden singles, hard wants more than singles.
WANTED: dict[Difficulty, tuple[str, ...]] = {"easy": ("singles",), "medium": ("hidden",), "hard": ("beyond",)}
TRIES = 6


def generate(rng: random.Random, difficulty: Difficulty) -> tuple[list[int], list[int]]:
    """(puzzle, solution): a puzzle with exactly one solution. Clues come out (in symmetric pairs, then one by one)
    while it stays at the difficulty, down to the difficulty's number of clues. Of a few tries, the first that needs
    the difficulty's techniques wins; otherwise the sparsest."""
    best: tuple[list[int], list[int]] | None = None
    for _ in range(TRIES):
        made = _carve(rng, difficulty)
        if logic_level(made[0]) in WANTED[difficulty]:
            return made
        if best is None or made[0].count(0) > best[0].count(0):
            best = made
    assert best is not None
    return best
