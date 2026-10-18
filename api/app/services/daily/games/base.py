"""What a daily game is. A game makes the day's puzzle (the same for everyone), replays moves onto a state, says how
the play stands, scores it, and shows it to the player without giving the answer away until it's over. Adding a game
is one module in this package, listed in `games/__init__.py`, plus its view and moves in schemas/daily.py and its
screen in the web app. A game whose puzzles come from the content editors' items is a ContentGame; an editor can fix
today's puzzle of such a game, which makes a new version of it (`Edition.revision`)."""

from __future__ import annotations

import datetime as dt
from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, ClassVar, Generic, Literal, TypeVar

from sqlalchemy.orm import Session

from app.core.errors import ApiError, invalid
from app.schemas.daily import GameId, GameInfo, GameView, Move
from app.services.daily import content
from app.services.daily.content import Entry, Uses

P = TypeVar("P")  # the day's puzzle, including its answer: it never leaves the server unfinished
S = TypeVar("S")  # a play's state, rebuilt from its moves

Status = Literal["playing", "won", "lost"]


@dataclass(frozen=True)
class Edition(Generic[P]):
    """The day's puzzle as it stands, and its version: the fixes it has had today (0: as it was made)."""

    puzzle: P
    revision: int


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
    def edition(self, db: Session, day: dt.date, variant: str) -> Edition[P]:
        """The day's puzzle as it stands, and its version: the same for everyone, every time it's asked for."""

    def puzzle(self, db: Session, day: dt.date, variant: str) -> P:
        """The day's puzzle as it stands."""
        return self.edition(db, day, variant).puzzle

    def earlier(self, db: Session, day: dt.date, variant: str, revision: int) -> P | None:
        """The day's puzzle as it was at `revision`, before a fix replaced it (None: it never had that version)."""
        return None

    @abstractmethod
    def start(self, puzzle: P) -> S: ...

    @abstractmethod
    def apply(self, puzzle: P, state: S, move: Move) -> str:
        """Plays one move onto `state` (in place) and says what it did ('hit', 'wrong', ...). Raises ApiError for a
        move that doesn't count (not a word, a cell already filled); the move is then not kept."""

    @abstractmethod
    def status(self, puzzle: P, state: S) -> Status: ...

    @abstractmethod
    def points(self, puzzle: P, state: S, variant: str) -> int:
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


class ContentGame(Game[P, S]):
    """A game whose puzzles are made from the items of the day's theme (app/services/daily/content.py): the day's
    puzzle is made once, stored as `dump()` gives it, and read back with `load()` ever after. A fix to today's puzzle
    makes it again with `rebuild()`."""

    def edition(self, db: Session, day: dt.date, variant: str) -> Edition[P]:
        kept = content.day_puzzle(db, self, day)
        return Edition(self.load(db, kept.puzzle), kept.revision)

    def earlier(self, db: Session, day: dt.date, variant: str, revision: int) -> P | None:
        found = content.earlier_puzzle(db, day, self.id, variant, revision)
        return None if found is None else self.load(db, found)

    @abstractmethod
    def choose(self, pool: list[Entry], used: Uses, day: dt.date, seed: bytes) -> list[Entry]:
        """The day's items from the theme's (content.spread()). Raises content.NotReadyError when they can't make it."""

    @abstractmethod
    def build(self, db: Session, day: dt.date, chosen: list[Entry], seed: bytes) -> P:
        """The puzzle from the chosen items: the same items on the same day make the same puzzle."""

    @abstractmethod
    def dump(self, puzzle: P) -> dict[str, Any]:
        """The puzzle as stored (JSON)."""

    @abstractmethod
    def load(self, db: Session, data: dict[str, Any]) -> P: ...

    def rebuild(self, db: Session, day: dt.date, puzzle: P, before: list[Entry], after: list[Entry], seed: bytes) -> P:
        """Today's puzzle made again for a fix, from the items it took: `before` as they were and `after` as they are
        with the fix. It changes only what the fix needs. Raises content.CantFixError when today's puzzle can't take
        the fix. Here: made the way the day was, from the items as they are now."""
        return self.build(db, day, after, seed)


def bad_move(message: str = "That move doesn't fit this game.") -> ApiError:
    return invalid("move", message)


def unknown_word(message: str) -> ApiError:
    return ApiError(422, "unknown_word", message)
