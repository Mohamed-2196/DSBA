"""Home's first screen in one answer (GET /home): what its blocks need before they can draw, so the web app makes one
request instead of a chain of them. Each part has the shape of the endpoint it stands in for, so the web app keeps
it under that endpoint's own query key."""

from __future__ import annotations

from app.schemas.calendar import CalendarEventOut
from app.schemas.common import ApiModel
from app.schemas.grades import PaperChoice
from app.schemas.guides import GuidesDoc
from app.schemas.library import PaperQuestion
from app.schemas.site import SiteDoc


class HomeShelf(ApiModel):
    """The desk shelf's numbers."""

    new_files: int | None  # files students shared in the year's library in the last 7 days; None: library off
    notes: int | None  # the student's notes; None for a guest or while notes are off


class HomeOut(ApiModel):
    site: SiteDoc  # GET /site: Home's default blocks and exam week, besides the footer's words
    choices: list[PaperChoice]  # GET /modules/choices: what the student's papers pick from
    guides: GuidesDoc | None  # GET /guides, only while a guide's card is due (Start here, Results day); else None
    results_day: str | None  # the results date Results day's card is for (the calendar's id); None: no card
    # The calendar's dates from today for the next six months that count for the student: the year's and their
    # papers', less what they hid from their calendar and the hidden modules' (empty while the calendar is off).
    dates: list[CalendarEventOut]
    next_exam: CalendarEventOut | None  # their next exam within 120 days, unless a mock comes first
    daily_question: PaperQuestion | None  # the day's past question for next_exam's module, in the six weeks before it
    shelf: HomeShelf
