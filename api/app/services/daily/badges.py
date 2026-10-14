"""Badges: milestones worked out from a person's scored plays whenever they're asked for (nothing is stored)."""

from __future__ import annotations

from typing import NamedTuple

from sqlalchemy import and_, func, select
from sqlalchemy.orm import Session

from app.models import DailyPlay, User
from app.schemas.daily import Badge


class BadgeInfo(NamedTuple):
    id: str
    title: str
    description: str


BADGES = (
    BadgeInfo("first", "First puzzle", "Finish a daily puzzle."),
    BadgeInfo("full-set", "Full set", "Finish every game on the same day."),
    BadgeInfo("streak-7", "Week in a row", "Keep a seven-day streak."),
    BadgeInfo("streak-30", "Month in a row", "Keep a thirty-day streak."),
    BadgeInfo("word-3", "Sharp eye", "Find the word in three guesses or fewer."),
    BadgeInfo("groups-clean", "Clean sweep", "Solve the groups without a mistake."),
    BadgeInfo("quiz-5", "Full marks", "Answer all five quiz questions right."),
    BadgeInfo("sudoku-hard", "Hard as nails", "Solve a hard Sudoku without a hint."),
    BadgeInfo("points-1000", "A thousand points", "Earn 1,000 points."),
    BadgeInfo("played-50", "Fifty puzzles", "Finish 50 daily puzzles."),
)


def badges_of(db: Session, user: User, best_streak: int, points: int, games_a_day: int) -> list[Badge]:
    mine = and_(DailyPlay.user_id == user.id, DailyPlay.scored, DailyPlay.finished_at.is_not(None))
    won = and_(mine, DailyPlay.status == "won")
    finished = db.scalar(select(func.count()).where(mine)) or 0
    per_day = select(func.count(DailyPlay.game.distinct()).label("n")).where(mine).group_by(DailyPlay.day).subquery()
    full_set = (db.scalar(select(func.max(per_day.c.n))) or 0) >= games_a_day

    def any_of(*where: object) -> bool:
        return db.scalar(select(DailyPlay.id).where(won, *where).limit(1)) is not None  # type: ignore[arg-type]

    earned = {
        "first": finished > 0,
        "full-set": full_set,
        "streak-7": best_streak >= 7,
        "streak-30": best_streak >= 30,
        "word-3": any_of(DailyPlay.game == "word", func.jsonb_array_length(DailyPlay.moves) <= 3),
        "groups-clean": any_of(DailyPlay.game == "groups", DailyPlay.mistakes == 0),
        "quiz-5": any_of(DailyPlay.game == "quiz", DailyPlay.mistakes == 0),
        "sudoku-hard": any_of(DailyPlay.game == "sudoku", DailyPlay.variant == "hard", DailyPlay.hints == 0),
        "points-1000": points >= 1000,
        "played-50": finished >= 50,
    }
    return [Badge(id=b.id, title=b.title, description=b.description, earned=earned[b.id]) for b in BADGES]
