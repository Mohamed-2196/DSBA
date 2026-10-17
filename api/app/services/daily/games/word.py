"""The word: a five-letter word from the week's theme in six guesses. Each guess must be a word; its letters come back
marked as in the right place, in the word elsewhere, or not in it."""

from __future__ import annotations

import datetime as dt
from collections import Counter
from dataclasses import dataclass, field
from functools import cache

from sqlalchemy.orm import Session

from app.core.errors import conflict
from app.schemas.daily import GuessMove, LetterMark, Move, WordRow, WordView
from app.services.daily import content
from app.services.daily.games.base import Game, Status, bad_move, unknown_word

LENGTH = 5
MAX_GUESSES = 6
POINTS = (100, 90, 80, 65, 50, 35)  # by the guess that found it
SQUARES = {"hit": "🟩", "near": "🟨", "miss": "⬜"}


@cache
def answers() -> dict[str, tuple[str, ...]]:
    """The answers by theme."""
    return {theme: tuple(words) for theme, words in content.load("words.json").items()}


@cache
def guesses() -> frozenset[str]:
    """Every word a guess may be: the dictionary's five-letter words, plurals of its four-letter ones, a few words
    it's too old to know, and every answer."""
    listed = (content.DATA / "guesses.txt").read_text(encoding="utf-8").split()
    listed += (content.DATA / "guesses_extra.txt").read_text(encoding="utf-8").split()
    return frozenset(w.upper() for w in listed) | {w for words in answers().values() for w in words}


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


class WordGame(Game[str, WordState]):
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

    def puzzle(self, db: Session, day: dt.date, variant: str) -> str:
        return content.pick(answers()[content.theme_of(day).id], self.id, day)

    def start(self, puzzle: str) -> WordState:
        return WordState()

    def apply(self, puzzle: str, state: WordState, move: Move) -> str:
        if not isinstance(move, GuessMove):
            state.gave_up = True
            return "gave-up"
        word = move.word.strip().upper()
        if len(word) != LENGTH or not word.isalpha() or not word.isascii():
            raise bad_move("Guesses are five letters.")
        if word not in guesses():
            raise unknown_word("That's not in our word list. Try another word.")
        if any(row.word == word for row in state.rows):
            raise conflict("already_tried", "You've tried that word already.")
        state.rows.append(WordRow(word=word, marks=marks(word, puzzle)))
        return "hit" if word == puzzle else "miss"

    def status(self, puzzle: str, state: WordState) -> Status:
        if state.rows and state.rows[-1].word == puzzle:
            return "won"
        if state.gave_up or len(state.rows) >= MAX_GUESSES:
            return "lost"
        return "playing"

    def points(self, puzzle: str, state: WordState, variant: str, seconds: int) -> int:
        return POINTS[len(state.rows) - 1] if self.status(puzzle, state) == "won" else 0

    def counts(self, state: WordState) -> tuple[int, int]:
        return 0, 0

    def view(self, puzzle: str, state: WordState, over: bool) -> WordView:
        return WordView(
            kind="word", length=LENGTH, max_guesses=MAX_GUESSES, rows=state.rows, answer=puzzle if over else None
        )

    def share(self, puzzle: str, state: WordState, status: Status) -> str:
        tries = str(len(state.rows)) if status == "won" else "X"
        grid = "\n".join("".join(SQUARES[m] for m in row.marks) for row in state.rows)
        return f"{self.title} {tries}/{MAX_GUESSES}\n{grid}".rstrip()
