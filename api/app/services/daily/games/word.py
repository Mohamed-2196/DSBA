"""The word: a five-letter word from the week's theme in six guesses. Each guess must be in the guess list; its
letters come back marked as in the right place, in the word elsewhere, or not in it."""

from __future__ import annotations

import datetime as dt
from collections import Counter
from collections.abc import Callable
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import conflict
from app.models import DailyGuessWord
from app.schemas.daily import GuessMove, LetterMark, Move, WordRow, WordView
from app.services.daily import content
from app.services.daily.content import Entry, Uses
from app.services.daily.games.base import ContentGame, Status, bad_move, unknown_word

LENGTH = 5
MAX_GUESSES = 6
POINTS = (100, 90, 80, 65, 50, 35)  # by the guess that found it
SQUARES = {"hit": "🟩", "near": "🟨", "miss": "⬜"}


def in_guess_list(db: Session, word: str) -> bool:
    return db.scalar(select(DailyGuessWord.word).where(DailyGuessWord.word == word)) is not None


def _guess_list(db: Session) -> Callable[[str], bool]:
    """A check against the guess list, asking the database once per word."""
    known: dict[str, bool] = {}

    def check(word: str) -> bool:
        if word not in known:
            known[word] = in_guess_list(db, word)
        return known[word]

    return check


@dataclass(frozen=True)
class Puzzle:
    answer: str
    is_word: Callable[[str], bool] = field(compare=False, repr=False)


def marks(guess: str, answer: str) -> list[LetterMark]:
    """Right place first, then letters elsewhere, each letter of the answer used once."""
    out: list[LetterMark] = ["miss"] * len(guess)
    left = Counter(a for g, a in zip(guess, answer, strict=True) if g != a)
    for i, (g, a) in enumerate(zip(guess, answer, strict=True)):
        if g == a:
            out[i] = "hit"
        elif left[g] > 0:
            out[i] = "near"
            left[g] -= 1
    return out


@dataclass
class WordState:
    rows: list[WordRow] = field(default_factory=list)
    gave_up: bool = False


class WordGame(ContentGame[Puzzle, WordState]):
    id = "word"
    title = "The Word"
    tagline = "Guess the week's five-letter word in six tries."
    how_to = (
        "Type a five-letter word and press Enter. Your guesses can be any English word.",
        "Green: the letter is in the word, in that spot. Yellow: it's in the word, in another spot. Grey: it isn't in "
        "the word.",
        "The word fits the week's theme.",
    )
    scoring = "100 points in one guess, down to 35 in six."
    max_points = POINTS[0]
    moves = frozenset({"guess", "give-up"})
    max_moves = MAX_GUESSES + 1
    min_seconds = 4  # from opening the puzzle: a first-guess win any faster was looked up

    def choose(self, pool: list[Entry], used: Uses, day: dt.date, seed: bytes) -> list[Entry]:
        return content.spread(pool, used, day, 1, self.id, seed)

    def build(self, db: Session, day: dt.date, chosen: list[Entry], seed: bytes) -> Puzzle:
        return Puzzle(str(chosen[0].data["word"]), _guess_list(db))

    def dump(self, puzzle: Puzzle) -> dict[str, Any]:
        return {"answer": puzzle.answer}

    def load(self, db: Session, data: dict[str, Any]) -> Puzzle:
        return Puzzle(str(data["answer"]), _guess_list(db))

    def start(self, puzzle: Puzzle) -> WordState:
        return WordState()

    def apply(self, puzzle: Puzzle, state: WordState, move: Move) -> str:
        if not isinstance(move, GuessMove):
            state.gave_up = True
            return "gave-up"
        word = move.word.strip().upper()
        if len(word) != LENGTH or not word.isalpha() or not word.isascii():
            raise bad_move("Guesses are five letters.")
        if word != puzzle.answer and not puzzle.is_word(word):
            raise unknown_word("That's not in our word list. Try another word.")
        if any(row.word == word for row in state.rows):
            raise conflict("already_tried", "You've tried that word already.")
        state.rows.append(WordRow(word=word, marks=marks(word, puzzle.answer)))
        return "hit" if word == puzzle.answer else "miss"

    def status(self, puzzle: Puzzle, state: WordState) -> Status:
        if state.rows and state.rows[-1].word == puzzle.answer:
            return "won"
        if state.gave_up or len(state.rows) >= MAX_GUESSES:
            return "lost"
        return "playing"

    def points(self, puzzle: Puzzle, state: WordState, variant: str, seconds: int) -> int:
        return POINTS[len(state.rows) - 1] if self.status(puzzle, state) == "won" else 0

    def counts(self, state: WordState) -> tuple[int, int]:
        return 0, 0

    def view(self, puzzle: Puzzle, state: WordState, over: bool) -> WordView:
        return WordView(
            kind="word", length=LENGTH, max_guesses=MAX_GUESSES, rows=state.rows, answer=puzzle.answer if over else None
        )

    def share(self, puzzle: Puzzle, state: WordState, status: Status) -> str:
        tries = str(len(state.rows)) if status == "won" else "X"
        grid = "\n".join("".join(SQUARES[m] for m in row.marks) for row in state.rows)
        return f"{self.title} {tries}/{MAX_GUESSES}\n{grid}".rstrip()
