"""Groups: sixteen words from the week's theme that make four groups of four. Pick four you think belong together;
four wrong tries end the play."""

from __future__ import annotations

import datetime as dt
from dataclasses import dataclass, field
from functools import cache

from sqlalchemy.orm import Session

from app.core.errors import conflict
from app.schemas.daily import FoundGroup, GroupMove, GroupsView, Move
from app.services.daily import content
from app.services.daily.games.base import Game, Status, bad_move

GROUPS = 4
SIZE = 4
TRIES = 4
MISTAKE_COST = 20
POINTS_PER_GROUP_LOST = 10  # a lost play still earns this for each group found
SQUARES = {1: "🟨", 2: "🟩", 3: "🟦", 4: "🟪"}  # the levels' colours in the web app


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


@cache
def bank() -> dict[str, tuple[Group, ...]]:
    out: dict[str, list[Group]] = {}
    for g in content.load("groups.json"):
        out.setdefault(g["theme"], []).append(Group(g["id"], g["label"], g["level"], tuple(g["words"])))
    return {theme: tuple(groups) for theme, groups in out.items()}


def _no_shared_words(chosen: list[Group], group: Group) -> bool:
    return all(not set(group.words) & set(c.words) for c in chosen)


class GroupsGame(Game[Puzzle, GroupsState]):
    id = "groups"
    title = "Correlations"
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

    def puzzle(self, db: Session, day: dt.date, variant: str) -> Puzzle:
        pool = bank()[content.theme_of(day).id]
        chosen = content.pick_many(pool, GROUPS, self.id, day, _no_shared_words)
        r = content.rng(self.id, day, "words")
        groups: list[Group] = []
        for g in sorted(chosen, key=lambda g: (g.level, g.id)):
            words = list(g.words)
            r.shuffle(words)
            groups.append(Group(g.id, g.label, g.level, tuple(words[:SIZE])))
        order = [w for g in groups for w in g.words]
        r.shuffle(order)
        return Puzzle(tuple(groups), tuple(order))

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
        head = f"{self.title} {len(state.found)}/{GROUPS}, {state.mistakes} mistake{'s' if state.mistakes != 1 else ''}"
        return f"{head}\n{rows}".rstrip()
