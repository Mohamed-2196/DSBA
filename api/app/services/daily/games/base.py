"""What a daily game is. A game makes the day's puzzle (deterministic from the date), replays moves onto a state,
says how the play stands, scores it, and shows it to the player without giving the answer away until it's over.
Adding a game is one module in this package, listed in `games/__init__.py`, plus its view and moves in
schemas/daily.py and its screen in the web app."""

from __future__ import annotations

import datetime as dt
from abc import ABC, abstractmethod
from typing import ClassVar, Generic, Literal, TypeVar

from sqlalchemy.orm import Session

from app.core.errors import ApiError, invalid
from app.schemas.daily import GameId, GameInfo, GameView, Move

P = TypeVar("P")  # the day's puzzle, including its answer: it never leaves the server unfinished
S = TypeVar("S")  # a play's state, rebuilt from its moves

Status = Literal["playing", "won", "lost"]


class Game(ABC, Generic[P, S]):
    id: ClassVar[GameId]
    title: ClassVar[str]
    tagline: ClassVar[str]
    how_to: ClassVar[tuple[str, ...]]
    scoring: ClassVar[str]
    variants: ClassVar[tuple[str, ...]] = ("",)
    max_points: ClassVar[int]
    moves: ClassVar[frozenset[str]]  # the move kinds the game takes
    max_moves: ClassVar[int]
    # A win faster than this earns no points: no person plays that fast. The clock starts when a signed-in player
    # first opens today's puzzle (Sudoku: at the first move), and stops at the last move.
    min_seconds: ClassVar[int] = 0

    def info(self) -> GameInfo:
        return GameInfo(
            id=self.id,
            title=self.title,
            tagline=self.tagline,
            how_to=list(self.how_to),
            scoring=self.scoring,
            variants=list(self.variants),
            max_points=self.max_points,
        )

    @abstractmethod
    def puzzle(self, db: Session, day: dt.date, variant: str) -> P:
        """The day's puzzle: the same for everyone, every time it's asked for."""

    @abstractmethod
    def start(self, puzzle: P) -> S: ...

    @abstractmethod
    def apply(self, puzzle: P, state: S, move: Move) -> str:
        """Plays one move onto `state` (in place) and says what it did ('hit', 'wrong', ...). Raises ApiError for a
        move that doesn't count (not a word, a cell already filled); the move is then not kept."""

    @abstractmethod
    def status(self, puzzle: P, state: S) -> Status: ...

    @abstractmethod
    def points(self, puzzle: P, state: S, variant: str, seconds: int) -> int:
        """Points for a finished play (0 when lost)."""

    @abstractmethod
    def counts(self, state: S) -> tuple[int, int]:
        """(mistakes, hints)."""

    @abstractmethod
    def view(self, puzzle: P, state: S, over: bool) -> GameView:
        """The play as the player sees it; the answer only when `over`."""

    @abstractmethod
    def share(self, puzzle: P, state: S, status: Status) -> str:
        """A result grid without spoilers (the first line names the game; the hub adds the date)."""


def bad_move(message: str = "That move doesn't fit this game.") -> ApiError:
    return invalid("move", message)


def unknown_word(message: str) -> ApiError:
    return ApiError(422, "unknown_word", message)
