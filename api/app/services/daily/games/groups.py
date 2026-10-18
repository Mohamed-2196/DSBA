"""Groups: sixteen words from the week's theme that make four groups of four, one group at each level (1 plainest
to 4 trickiest). Pick four you think belong together; four wrong tries end the play."""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import conflict
from app.schemas.daily import FoundGroup, GroupMove, GroupsView, Move
from app.services.daily import content
from app.services.daily.content import Entry, Uses
from app.services.daily.games.base import ContentGame, Status, bad_move

GROUPS = 4
SIZE = 4
TRIES = 4
MISTAKE_COST = 20
POINTS_PER_GROUP_LOST = 10  # a lost play still earns this for each group found
SQUARES = {1: "🟨", 2: "🟩", 3: "🟦", 4: "🟧"}  # the levels' colours in the web app


@dataclass(frozen=True)
class Group:
    id: str
    label: str
    level: int
    words: tuple[str, ...]


@dataclass(frozen=True)
class Puzzle:
    groups: tuple[Group, ...]  # easiest first, each cut to four words
    order: tuple[str, ...]  # the sixteen words as the board shows them

    def group_of(self, word: str) -> Group:
        return next(g for g in self.groups if word in g.words)


@dataclass
class GroupsState:
    found: list[Group] = field(default_factory=list)
    guesses: list[list[str]] = field(default_factory=list)
    levels: list[list[int]] = field(default_factory=list)  # each try's words by group level, for sharing
    mistakes: int = 0
    one_away: bool = False
    gave_up: bool = False


def _group(data: dict[str, Any]) -> Group:
    return Group(str(data["id"]), str(data["label"]), int(data["level"]), tuple(data["words"]))


class GroupsGame(ContentGame[Puzzle, GroupsState]):
    id = "groups"
    title = "Groups"
    tagline = "Sort sixteen words into four groups of four."
    how_to = (
        "Pick four words that share something, then press Submit.",
        "Groups run from yellow (plainest) to purple (trickiest). Some words seem to fit more than one group.",
        "Three right out of four? We'll tell you you're one away. Four mistakes end the game.",
    )
    scoring = f"100 points, less {MISTAKE_COST} a mistake. A lost game earns {POINTS_PER_GROUP_LOST} a group found."
    max_points = 100
    moves = frozenset({"group", "give-up"})
    max_moves = GROUPS + TRIES + 1
    min_seconds = 8

    def choose(self, pool: list[Entry], used: Uses, day: dt.date, seed: bytes) -> list[Entry]:
        """One group a level, sharing no word with another."""
        taken: set[str] = set()

        def fits(_: list[Entry], e: Entry) -> bool:
            return not taken & set(e.data["words"])

        chosen: list[Entry] = []
        for level in range(1, GROUPS + 1):
            at_level = [e for e in pool if e.data["level"] == level]
            group = content.spread(at_level, used, day, 1, f"{self.id}-{level}", seed, fits)
            taken.update(group[0].data["words"])
            chosen += group
        return chosen

    def build(self, db: Session, day: dt.date, chosen: list[Entry], seed: bytes) -> Puzzle:
        r = content.rng(seed, self.id, day, "words")
        groups: list[Group] = []
        for e in chosen:  # by level
            words = list(e.data["words"])
            r.shuffle(words)
            groups.append(Group(str(e.id), e.data["label"], e.data["level"], tuple(words[:SIZE])))
        order = [w for g in groups for w in g.words]
        r.shuffle(order)
        return Puzzle(tuple(groups), tuple(order))

    def dump(self, puzzle: Puzzle) -> dict[str, Any]:
        groups = [{"id": g.id, "label": g.label, "level": g.level, "words": list(g.words)} for g in puzzle.groups]
        return {"groups": groups, "order": list(puzzle.order)}

    def load(self, db: Session, data: dict[str, Any]) -> Puzzle:
        return Puzzle(tuple(_group(g) for g in data["groups"]), tuple(data["order"]))

    def start(self, puzzle: Puzzle) -> GroupsState:
        return GroupsState()

    def apply(self, puzzle: Puzzle, state: GroupsState, move: Move) -> str:
        if not isinstance(move, GroupMove):
            state.gave_up = True
            return "gave-up"
        words = sorted({w.strip().upper() for w in move.words})
        found_words = {w for g in state.found for w in g.words}
        if len(words) != SIZE or any(w not in puzzle.order or w in found_words for w in words):
            raise bad_move("Pick four different words from the board.")
        if words in state.guesses:
            raise conflict("already_tried", "You've tried those four already.")
        state.guesses.append(words)
        state.levels.append(sorted(puzzle.group_of(w).level for w in words))
        groups = [puzzle.group_of(w) for w in words]
        best = max(groups.count(g) for g in groups)
        if best == SIZE:
            state.found.append(groups[0])
            state.one_away = False
            return "found"
        state.mistakes += 1
        state.one_away = best == SIZE - 1
        return "one-away" if state.one_away else "miss"

    def status(self, puzzle: Puzzle, state: GroupsState) -> Status:
        if len(state.found) == GROUPS:
            return "won"
        if state.gave_up or state.mistakes >= TRIES:
            return "lost"
        return "playing"

    def points(self, puzzle: Puzzle, state: GroupsState, variant: str, seconds: int) -> int:
        if self.status(puzzle, state) == "won":
            return max(20, self.max_points - state.mistakes * MISTAKE_COST)
        return len(state.found) * POINTS_PER_GROUP_LOST

    def counts(self, state: GroupsState) -> tuple[int, int]:
        return state.mistakes, 0

    def view(self, puzzle: Puzzle, state: GroupsState, over: bool) -> GroupsView:
        found = list(state.found)
        if over:
            found += [g for g in puzzle.groups if g not in found]
        taken = {w for g in found for w in g.words}
        return GroupsView(
            kind="groups",
            words=[w for w in puzzle.order if w not in taken],
            found=[FoundGroup(label=g.label, level=g.level, words=list(g.words)) for g in found],
            mistakes_left=max(0, TRIES - state.mistakes),
            guesses=state.guesses,
            one_away=state.one_away,
        )

    def share(self, puzzle: Puzzle, state: GroupsState, status: Status) -> str:
        rows = "\n".join("".join(SQUARES[level] for level in levels) for levels in state.levels)
        head = f"Groups: {len(state.found)}/{GROUPS}, {state.mistakes} mistake{'s' if state.mistakes != 1 else ''}"
        return f"{head}\n{rows}".rstrip()
