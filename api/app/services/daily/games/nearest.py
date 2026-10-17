"""Nearest neighbour: find the secret word by closeness. Every guess comes back with its rank: 1 is the secret word,
2 the closest word to it, and so on through the vocabulary.

Closeness comes from a curated vocabulary (daily_nearest_words, edited in Manage): each word has tags, and a few
strongly related words. Each secret word's ranking of the vocabulary is worked out whenever the vocabulary changes
(rankings()), and a day's puzzle keeps the ranking it was made with, so playing needs no AI and no maths."""

from __future__ import annotations

import datetime as dt
import difflib
import math
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import conflict
from app.schemas.daily import GuessMove, HintMove, Move, NearestGuess, NearestView
from app.services.daily import content
from app.services.daily.content import Entry, NotReadyError, Uses
from app.services.daily.games.base import ContentGame, Status, bad_move, unknown_word

NEAR_BONUS = 0.5
FREE_GUESSES = 10  # full points up to here
GUESS_COST = 2
HINT_COST = 10
FLOOR = 20
CLOSE, WARM = 50, 200  # rank bands for colours and sharing

Vocabulary = Mapping[str, tuple[Sequence[str], Sequence[str]]]  # word -> (tags, near words)


def rankings(vocabulary: Vocabulary, targets: Iterable[str]) -> dict[str, list[str]]:
    """For each target in the vocabulary, every word from closest to farthest, the target first: cosine similarity
    of their tag sets, plus a bonus for a near word (listed on either of the two); ties alphabetical."""
    words = sorted(vocabulary)
    near: dict[str, set[str]] = {w: set() for w in words}
    for w, (_, close) in vocabulary.items():
        for n in close:
            if n in near:
                near[w].add(n)
                near[n].add(w)
    tags = {w: set(t) for w, (t, _) in vocabulary.items()}

    def closeness(a: str, b: str) -> float:
        shared = len(tags[a] & tags[b]) / math.sqrt(len(tags[a]) * len(tags[b])) if tags[a] and tags[b] else 0.0
        return shared + (NEAR_BONUS if b in near[a] else 0.0)

    out: dict[str, list[str]] = {}
    for target in targets:
        if target in tags:
            out[target] = [target, *sorted((w for w in words if w != target), key=lambda w: (-closeness(target, w), w))]
    return out


@dataclass(frozen=True)
class Puzzle:
    target: str
    rank_of: dict[str, int]  # word -> rank (1 for the target)
    by_rank: tuple[str, ...]  # rank - 1 -> word


@dataclass
class NearestState:
    guesses: list[NearestGuess] = field(default_factory=list)
    gave_up: bool = False

    @property
    def best(self) -> int:
        return min((g.rank for g in self.guesses), default=0)


def _puzzle(ranking: Sequence[str]) -> Puzzle:
    order = tuple(ranking)
    return Puzzle(order[0], {w: r + 1 for r, w in enumerate(order)}, order)


def _normal(word: str) -> str:
    return word.strip().lower()


def suggestions(word: str, known: dict[str, int], n: int = 2) -> list[str]:
    """Known words a guess the game doesn't know may have meant: longer forms of it ("invest": investment), then
    near spellings."""
    longer = sorted((w for w in known if len(word) >= 4 and w.startswith(word)), key=lambda w: (len(w), w))
    close = difflib.get_close_matches(word, known, n=n, cutoff=0.8)
    return list(dict.fromkeys(longer + close))[:n]


def _unknown(word: str, known: dict[str, int]) -> str:
    tries = suggestions(word, known)
    if not tries or not word.isalpha():
        return "We don't know that word. Try another."
    return f"We don't know “{word}”. Try {' or '.join(tries)}."


class NearestGame(ContentGame[Puzzle, NearestState]):
    id = "nearest"
    title = "Nearest Neighbour"
    tagline = "Find the secret word. Each guess shows how close it is."
    how_to = (
        "Type a word and see its rank: 1 is the secret word, 2 the closest word to it, and so on.",
        "Closeness is about meaning, not spelling: words used together sit close. The game knows hundreds of words "
        "from data, business, study and everyday life.",
        "Stuck? A hint shows a word closer than your best so far.",
    )
    scoring = (
        f"100 points within {FREE_GUESSES} guesses, then {GUESS_COST} less a guess. "
        f"Each hint costs {HINT_COST}. At least {FLOOR} when you find it."
    )
    max_points = 100
    moves = frozenset({"guess", "hint", "give-up"})
    max_moves = 300
    min_seconds = 4  # from opening the puzzle: a first-guess win any faster was looked up

    def choose(self, pool: list[Entry], used: Uses, day: dt.date, seed: bytes) -> list[Entry]:
        return content.spread(pool, used, day, 1, self.id, seed, lambda _, e: bool(e.ranking))

    def build(self, db: Session, day: dt.date, chosen: list[Entry], seed: bytes) -> Puzzle:
        ranking = chosen[0].ranking
        if not ranking:  # pragma: no cover - choose() takes only words with a ranking
            raise NotReadyError("nearest: no ranking")
        return _puzzle(ranking)

    def dump(self, puzzle: Puzzle) -> dict[str, Any]:
        return {"ranking": list(puzzle.by_rank)}

    def load(self, db: Session, data: dict[str, Any]) -> Puzzle:
        return _puzzle(data["ranking"])

    def start(self, puzzle: Puzzle) -> NearestState:
        return NearestState()

    def apply(self, puzzle: Puzzle, state: NearestState, move: Move) -> str:
        if isinstance(move, GuessMove):
            word = _normal(move.word)
            if word not in puzzle.rank_of and word.endswith("s") and word[:-1] in puzzle.rank_of:
                word = word[:-1]
            if word not in puzzle.rank_of:
                raise unknown_word(_unknown(word, puzzle.rank_of))
            if any(g.word == word for g in state.guesses):
                raise conflict("already_tried", "You've tried that word already.")
            rank = puzzle.rank_of[word]
            state.guesses.append(NearestGuess(word=word, rank=rank, hint=False))
            return "hit" if rank == 1 else "miss"
        if isinstance(move, HintMove):
            best = state.best or len(puzzle.by_rank)
            if best <= 2:
                raise bad_move("You're one word away: no hint can help now.")
            tried = {g.word for g in state.guesses}
            rank = max(2, min(best, 2 * WARM) // 2)
            while rank > 2 and puzzle.by_rank[rank - 1] in tried:
                rank -= 1
            state.guesses.append(NearestGuess(word=puzzle.by_rank[rank - 1], rank=rank, hint=True))
            return "hint"
        state.gave_up = True
        return "gave-up"

    def status(self, puzzle: Puzzle, state: NearestState) -> Status:
        if any(g.rank == 1 for g in state.guesses):
            return "won"
        return "lost" if state.gave_up else "playing"

    def points(self, puzzle: Puzzle, state: NearestState, variant: str, seconds: int) -> int:
        if self.status(puzzle, state) != "won":
            return 0
        guesses = sum(not g.hint for g in state.guesses)
        hints = len(state.guesses) - guesses
        cost = max(0, guesses - FREE_GUESSES) * GUESS_COST + hints * HINT_COST
        return max(FLOOR, self.max_points - cost)

    def counts(self, state: NearestState) -> tuple[int, int]:
        return 0, sum(g.hint for g in state.guesses)

    def view(self, puzzle: Puzzle, state: NearestState, over: bool) -> NearestView:
        return NearestView(
            kind="nearest",
            vocabulary=len(puzzle.by_rank),
            guesses=state.guesses,
            answer=puzzle.target if over else None,
        )

    def share(self, puzzle: Puzzle, state: NearestState, status: Status) -> str:
        guesses = [g for g in state.guesses if not g.hint]
        close = sum(g.rank <= CLOSE for g in guesses)
        warm = sum(CLOSE < g.rank <= WARM for g in guesses)
        cold = len(guesses) - close - warm
        hints = len(state.guesses) - len(guesses)
        head = f"{self.title}: {'found' if status == 'won' else 'not found'} in {len(guesses)} guesses"
        head += f", {hints} hint{'s' if hints != 1 else ''}"
        return f"{head}\n🟩 {close}  🟨 {warm}  ⬜ {cold}"
