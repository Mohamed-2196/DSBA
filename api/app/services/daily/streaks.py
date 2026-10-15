"""Day streaks with a freeze a week. A day counts when a puzzle was finished on that day (a scored play). A missed
day is covered by its week's freeze (weeks start on Sunday), once per week, when the streak carries on before it."""

from __future__ import annotations

import datetime as dt
from collections.abc import Iterable

from app.schemas.daily import Streak
from app.services.daily.content import FIRST_DAY, week_start

ONE = dt.timedelta(days=1)


def _run_back(days: set[dt.date], last: dt.date) -> tuple[int, list[dt.date]]:
    """The streak ending at `last`, walking back: its length in days played, and the days freezes covered. A freeze
    counts only when a day played comes before it."""
    length, frozen, pending, used_weeks = 0, list[dt.date](), list[dt.date](), set[dt.date]()
    d = last
    while d >= FIRST_DAY:
        if d in days:
            length += 1
            frozen += pending
            pending = []
        elif week_start(d) not in used_weeks:
            used_weeks.add(week_start(d))
            pending.append(d)
        else:
            break
        d -= ONE
    return length, frozen


def streak_of(played: Iterable[dt.date], today: dt.date) -> Streak:
    """The streak as of `today`: today counts once played, and until then the streak runs to yesterday."""
    days = set(played)
    played_today = today in days
    current, frozen = _run_back(days, today if played_today else today - ONE)
    best = max([current] + [_run_back(days, d)[0] for d in days if (d + ONE) not in days])
    return Streak(
        current=current,
        best=best,
        played_today=played_today,
        freeze_ready=all(week_start(f) != week_start(today) for f in frozen),
        frozen_days=sorted(frozen),
    )
