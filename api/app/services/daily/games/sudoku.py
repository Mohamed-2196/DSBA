"""Sudoku: three puzzles a day (easy, medium, hard), each with exactly one solution. Every digit is checked on the
server, so the solution never reaches the browser before the end; pencil marks and undo stay in the browser."""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from functools import cache
from typing import cast

from sqlalchemy.orm import Session

from app.config import get_settings
from app.schemas.daily import HintMove, Move, PlaceMove, SudokuDifficulty, SudokuView
from app.services.daily import content
from app.services.daily.games.base import Game, Status, bad_move
from app.services.daily.sudoku_engine import PEERS, generate

BASE: dict[str, int] = {"easy": 60, "medium": 100, "hard": 150}
MISTAKE_COST = 10
HINT_COST = 20
FLOOR = 10  # a solved puzzle earns at least this


@dataclass(frozen=True)
class Puzzle:
    difficulty: SudokuDifficulty
    givens: tuple[int, ...]
    solution: tuple[int, ...]


@dataclass
class SudokuState:
    filled: dict[int, int] = field(default_factory=dict)
    hinted: list[int] = field(default_factory=list)
    mistakes: int = 0
    wrong: PlaceMove | None = None
    gave_up: bool = False


@cache
def _make(day: dt.date, difficulty: SudokuDifficulty, _key: str) -> Puzzle:
    givens, solution = generate(content.rng("sudoku", day, difficulty), difficulty)
    return Puzzle(difficulty, tuple(givens), tuple(solution))


def _hint_cell(puzzle: Puzzle, state: SudokuState) -> int:
    """The empty cell with the fewest digits left to it: the most useful one to reveal."""
    grid = [puzzle.givens[i] or state.filled.get(i, 0) for i in range(81)]
    empty = [i for i in range(81) if grid[i] == 0]
    if not empty:
        raise bad_move("There's no empty cell left.")
    return min(empty, key=lambda i: (9 - len({grid[p] for p in PEERS[i]} - {0}), i))


class SudokuGame(Game[Puzzle, SudokuState]):
    id = "sudoku"
    title = "Sudoku"
    tagline = "Fill the grid so every row, column and box holds 1 to 9."
    how_to = (
        "Every row, column and 3 by 3 box holds each digit from 1 to 9 once.",
        "Pick a cell, then a digit. Pencil marks keep your options; they don't count as moves.",
        "A wrong digit counts as a mistake. A hint fills a cell for you.",
        "Your points come from the first difficulty you start each day; the others are practice.",
    )
    scoring = (
        f"Easy {BASE['easy']}, medium {BASE['medium']}, hard {BASE['hard']}. "
        f"Each mistake costs {MISTAKE_COST} and each hint {HINT_COST}."
    )
    variants = ("easy", "medium", "hard")
    max_points = BASE["hard"]
    moves = frozenset({"place", "hint", "give-up"})
    max_moves = 400
    min_seconds = 40

    def puzzle(self, db: Session, day: dt.date, variant: str) -> Puzzle:
        return _make(day, cast(SudokuDifficulty, variant), get_settings().secret_key.get_secret_value())

    def start(self, puzzle: Puzzle) -> SudokuState:
        return SudokuState()

    def apply(self, puzzle: Puzzle, state: SudokuState, move: Move) -> str:
        state.wrong = None
        if isinstance(move, PlaceMove):
            if puzzle.givens[move.cell] or move.cell in state.filled:
                raise bad_move("That cell is already filled.")
            if puzzle.solution[move.cell] == move.digit:
                state.filled[move.cell] = move.digit
                return "correct"
            state.mistakes += 1
            state.wrong = move
            return "wrong"
        if isinstance(move, HintMove):
            cell = move.cell if move.cell is not None else _hint_cell(puzzle, state)
            if puzzle.givens[cell] or cell in state.filled:
                raise bad_move("That cell is already filled.")
            state.filled[cell] = puzzle.solution[cell]
            state.hinted.append(cell)
            return "hint"
        state.gave_up = True
        return "gave-up"

    def status(self, puzzle: Puzzle, state: SudokuState) -> Status:
        if state.gave_up:
            return "lost"
        if all(puzzle.givens[i] or i in state.filled for i in range(81)):
            return "won"
        return "playing"

    def points(self, puzzle: Puzzle, state: SudokuState, variant: str, seconds: int) -> int:
        if self.status(puzzle, state) != "won":
            return 0
        cost = state.mistakes * MISTAKE_COST + len(state.hinted) * HINT_COST
        return max(FLOOR, BASE[puzzle.difficulty] - cost)

    def counts(self, state: SudokuState) -> tuple[int, int]:
        return state.mistakes, len(state.hinted)

    def view(self, puzzle: Puzzle, state: SudokuState, over: bool) -> SudokuView:
        filled = (
            [0 if puzzle.givens[i] else puzzle.solution[i] for i in range(81)]
            if over
            else [state.filled.get(i, 0) for i in range(81)]
        )
        return SudokuView(
            kind="sudoku",
            difficulty=puzzle.difficulty,
            givens=list(puzzle.givens),
            filled=filled,
            hinted=list(state.hinted),
            wrong=state.wrong,
        )

    def share(self, puzzle: Puzzle, state: SudokuState, status: Status) -> str:
        head = f"{self.title}, {puzzle.difficulty}: {'solved' if status == 'won' else 'not solved'}"
        mistakes = f"{state.mistakes} mistake{'s' if state.mistakes != 1 else ''}"
        hints = f"{len(state.hinted)} hint{'s' if len(state.hinted) != 1 else ''}"
        return f"{head}\n{mistakes}, {hints}"
