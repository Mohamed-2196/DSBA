"""The quiz: five quick questions, four from the week's theme and one about the programme's modules (a chapter, a
year or a unit code), made from the modules as they are in the hub on the day it's made. A theme's question can name
the module it comes from; its options are shuffled each day."""

from __future__ import annotations

import datetime as dt
import random
from dataclasses import asdict, dataclass, field
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Module
from app.schemas.daily import AnswerMove, Move, QuizAnswered, QuizQuestion, QuizView
from app.services.daily import content
from app.services.daily.content import Entry, Uses
from app.services.daily.games.base import ContentGame, Status, bad_move

QUESTIONS = 5
FROM_THEME = QUESTIONS - 1  # the fifth is about the modules
POINTS_EACH = 20
TO_WIN = 3  # right answers for a win


@dataclass(frozen=True)
class Question:
    prompt: str
    options: tuple[str, ...]
    answer: int
    explain: str
    source: str | None = None


@dataclass
class QuizState:
    answered: list[QuizAnswered] = field(default_factory=list)
    gave_up: bool = False


def module_label(module: Module) -> str:
    """How a question names its module: 'ST2133 Distribution theory'."""
    return f"{module.unit_code} {module.short_name}" if module.unit_code else module.short_name


def _from_theme(db: Session, day: dt.date, entry: Entry, seed: bytes) -> Question:
    """A theme's question as the day asks it: its options in the day's order."""
    data = entry.data
    options = list(data["options"])
    right = options[data["answer"]]
    content.rng(seed, "quiz", day, entry.id).shuffle(options)
    module = db.get(Module, data["moduleId"]) if data.get("moduleId") else None
    source = module_label(module) if module is not None else None
    return Question(data["question"], tuple(options), options.index(right), data["explanation"], source)


def _shuffled(r: random.Random, right: str, wrong: list[str]) -> tuple[tuple[str, ...], int]:
    options = [right, *wrong]
    r.shuffle(options)
    return tuple(options), options.index(right)


def module_question(modules: list[Module], r: random.Random) -> Question | None:
    """A question about the programme's modules, or None when there aren't enough of them to ask one."""
    if len(modules) < 4:
        return None
    modules = sorted(modules, key=lambda m: m.id)
    kind = r.choice(("chapter", "chapter", "year", "code"))
    if kind == "chapter":
        owners: dict[str, list[Module]] = {}
        for m in modules:
            for c in m.chapters:
                title = c.title.strip()
                if not c.hidden and 6 <= len(title) <= 80 and not title.lower().startswith(("chapter", "week")):
                    owners.setdefault(title, []).append(m)
        unique = sorted(t for t, ms in owners.items() if len(ms) == 1)
        if unique:
            title = r.choice(unique)
            module = owners[title][0]
            others = r.sample([m.name for m in modules if m.id != module.id], 3)
            options, answer = _shuffled(r, module.name, others)
            return Question(
                f"Which module has a chapter called “{title}”?",
                options,
                answer,
                f"“{title}” is a chapter of {module.name}, in Year {module.year}.",
                "Modules",
            )
    if kind == "code":
        coded = [m for m in modules if m.unit_code]
        if len(coded) >= 4:
            module = r.choice(coded)
            others = r.sample([m.unit_code or "" for m in coded if m.id != module.id], 3)
            options, answer = _shuffled(r, module.unit_code or "", others)
            return Question(
                f"What is the unit code of {module.name}?",
                options,
                answer,
                f"{module.name} is {module.unit_code}.",
                "Modules",
            )
    module = r.choice(modules)
    options = ("Year 1", "Year 2", "Year 3")
    return Question(
        f"In which year do DSBA students take {module.name}?",
        options,
        module.year - 1,
        f"{module.name} is a Year {module.year} module.",
        "Modules",
    )


class QuizGame(ContentGame[tuple[Question, ...], QuizState]):
    id = "quiz"
    title = "The Daily Query"
    tagline = "Five quick questions on the week's theme and your modules."
    how_to = (
        "Pick an answer for each question. You'll see straight away if you're right, with a short explanation.",
        f"Get {TO_WIN} or more right to solve it.",
        "One question a day is about the programme's own modules.",
    )
    scoring = f"{POINTS_EACH} points for each right answer."
    max_points = QUESTIONS * POINTS_EACH
    moves = frozenset({"answer", "give-up"})
    max_moves = QUESTIONS + 1
    min_seconds = 5

    def choose(self, pool: list[Entry], used: Uses, day: dt.date, seed: bytes) -> list[Entry]:
        return content.spread(pool, used, day, FROM_THEME, self.id, seed)

    def build(self, db: Session, day: dt.date, chosen: list[Entry], seed: bytes) -> tuple[Question, ...]:
        modules = list(db.scalars(select(Module).where(Module.hidden.is_(False))))
        about = module_question(modules, content.rng(seed, self.id, day, "modules"))
        return (*(_from_theme(db, day, e, seed) for e in chosen), *([about] if about else []))

    def dump(self, puzzle: tuple[Question, ...]) -> dict[str, Any]:
        return {"questions": [asdict(q) for q in puzzle]}

    def load(self, db: Session, data: dict[str, Any]) -> tuple[Question, ...]:
        return tuple(
            Question(q["prompt"], tuple(q["options"]), q["answer"], q["explain"], q["source"])
            for q in data["questions"]
        )

    def start(self, puzzle: tuple[Question, ...]) -> QuizState:
        return QuizState()

    def apply(self, puzzle: tuple[Question, ...], state: QuizState, move: Move) -> str:
        if not isinstance(move, AnswerMove):
            state.gave_up = True
            return "gave-up"
        if len(state.answered) >= len(puzzle):
            raise bad_move("There are no more questions.")
        q = puzzle[len(state.answered)]
        if move.choice >= len(q.options):
            raise bad_move("Pick one of the answers.")
        correct = move.choice == q.answer
        state.answered.append(QuizAnswered(choice=move.choice, answer=q.answer, correct=correct, explain=q.explain))
        return "correct" if correct else "wrong"

    def _right(self, state: QuizState) -> int:
        return sum(a.correct for a in state.answered)

    def status(self, puzzle: tuple[Question, ...], state: QuizState) -> Status:
        if state.gave_up:
            return "lost"
        if len(state.answered) < len(puzzle):
            return "playing"
        return "won" if self._right(state) >= TO_WIN else "lost"

    def points(self, puzzle: tuple[Question, ...], state: QuizState, variant: str, seconds: int) -> int:
        return self._right(state) * POINTS_EACH

    def counts(self, state: QuizState) -> tuple[int, int]:
        return len(state.answered) - self._right(state), 0

    def view(self, puzzle: tuple[Question, ...], state: QuizState, over: bool) -> QuizView:
        return QuizView(
            kind="quiz",
            questions=[QuizQuestion(prompt=q.prompt, options=list(q.options), source=q.source) for q in puzzle],
            answered=state.answered,
        )

    def share(self, puzzle: tuple[Question, ...], state: QuizState, status: Status) -> str:
        marks = "".join("🟩" if a.correct else "🟥" for a in state.answered)
        return f"{self.title} {self._right(state)}/{len(puzzle)}\n{marks}"
