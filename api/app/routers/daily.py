"""Daily: short puzzles, the same for everyone each day, released at midnight in Bahrain. Anyone can play; signed in,
plays are kept and scored, with streaks, badges and an opt-in leaderboard."""

from __future__ import annotations

import datetime as dt
from typing import Annotated

from fastapi import Query

from app.core.access import Feature
from app.core.security import DB, ActiveUser, CurrentUser, OptionalUser, get_active_user, needs_feature
from app.routers._base import router_for
from app.schemas.daily import (
    BoardPeriod,
    DailyCalendar,
    DailyMe,
    DailyMeIn,
    DailyToday,
    GameId,
    Leaderboard,
    MoveIn,
    PlayOut,
)
from app.services.daily import plays as svc

router = router_for("daily", needs_feature(Feature.daily))


@router.get("/daily", response_model=DailyToday)
def today(db: DB, user: OptionalUser) -> DailyToday:
    """Today's set: the theme, each game and how far you got, your points and streak (signed in)."""
    return svc.today_of(db, user)


@router.get("/daily/calendar", response_model=DailyCalendar)
def calendar(db: DB, user: OptionalUser, month: Annotated[str, Query(pattern=r"^\d{4}-\d{2}$")]) -> DailyCalendar:
    """The month's days with puzzles out, and the games you finished on each. Errors: invalid_input on `month` (422)
    for a month that isn't one, or in a year without puzzles."""
    return svc.calendar_of(db, user, month)


@router.get("/daily/leaderboard", response_model=Leaderboard)
def leaderboard(
    db: DB, user: OptionalUser, period: BoardPeriod = "week", year: Annotated[int | None, Query(ge=1, le=3)] = None
) -> Leaderboard:
    """The players who chose to show their name, by points: this week's (from Sunday) or of all time."""
    return svc.leaderboard(db, user, period, year)


@router.get("/daily/me", response_model=DailyMe)
def me(db: DB, user: CurrentUser) -> DailyMe:
    """Your totals, streak, badges and whether your name shows on the leaderboard."""
    return svc.me_of(db, user)


@router.put("/daily/me", response_model=DailyMe)
def update_me(body: DailyMeIn, db: DB, user: ActiveUser) -> DailyMe:
    """Shows or hides your name on the leaderboard."""
    svc.set_show_on_board(db, user, body.show_on_board)
    db.commit()
    return svc.me_of(db, user)


@router.get("/daily/{day}/{game}", response_model=PlayOut)
def get_play(day: dt.date, game: GameId, db: DB, user: OptionalUser, variant: str = "") -> PlayOut:
    """A game on a day, and your play of it so far. The day's puzzle is made and kept the first time anyone asks
    for it; signed in, the first look at today's starts its clock. Errors: not_out_yet (404), invalid_input on
    `variant` (422)."""
    out = svc.get_play(db, user, day, game, variant)
    db.commit()
    return out


@router.post("/daily/{day}/{game}/moves", response_model=PlayOut)
def make_move(day: dt.date, game: GameId, body: MoveIn, db: DB, user: OptionalUser) -> PlayOut:
    """One move, checked on the server. Signed in, it's kept, and today's first play of a game scores. Errors:
    invalid_input on `move` (422), unknown_word (422), already_tried (409), game_over (409), not_out_yet (404)."""
    if user is not None:
        get_active_user(user)  # a suspended account or one without a profile plays nothing it could keep
    out = svc.make_move(db, user, day, game, body)
    db.commit()
    return out
