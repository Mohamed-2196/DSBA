"""Home's first screen in one request: what its blocks need before they can draw (services/home.py)."""

from __future__ import annotations

from typing import Annotated

from fastapi import Query

from app.core.pagination import YearParam
from app.core.security import DB, OptionalUser
from app.routers._base import router_for
from app.schemas.home import HomeOut
from app.services import home as svc

router = router_for("home")

# A guest's papers as this browser keeps them: module ids (and an option's own id), comma-separated, at most 20.
PICKS_PATTERN = r"^[a-z0-9][a-z0-9-]{0,63}(,[a-z0-9][a-z0-9-]{0,63}){0,19}$"


@router.get("/home", response_model=HomeOut)
def home(
    db: DB,
    user: OptionalUser,
    year: YearParam,
    picks: Annotated[str | None, Query(pattern=PICKS_PATTERN)] = None,
) -> HomeOut:
    """Home's first screen for the year shown: the site settings, the papers' choices, a guide while its card is due,
    the student's dates and next exam with the day's past question for it, and the desk shelf's numbers. Each part
    follows its feature's switch. `picks`: a guest's papers, as their browser keeps them (an account's own count
    instead). Errors: invalid_input (422: a year other than 1 to 3, or picks that aren't module ids)."""
    return svc.home(db, user, year, picks.split(",") if picks else [])
