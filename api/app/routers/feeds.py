"""Private feeds, read without a session by calendar apps and widget apps: the secret in the address says whose it
is."""

from __future__ import annotations

from typing import Annotated

from fastapi import Path, Response

from app.core.security import DB
from app.routers._base import router_for
from app.schemas.calendar import WidgetFeed
from app.schemas.common import ErrorResponse
from app.services import my_calendar, widget

router = router_for("calendar")

Token = Annotated[str, Path(pattern=r"^[A-Za-z0-9_-]{43}$")]


@router.get(
    "/feeds/calendar/{token}.ics",
    response_class=Response,
    responses={200: {"content": {"text/calendar": {"schema": {"type": "string"}}}}, 404: {"model": ErrorResponse}},
)
def private_calendar(token: Token, db: DB) -> Response:
    """A student's own calendar to subscribe to: their year's and papers' dates, less what they hid, and their own
    events with their repeats and reminders. Works only while the calendar is on for them and the address is
    current. Errors: not_found (404)."""
    return Response(
        content=my_calendar.private_feed(db, token).encode("utf-8"),
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": 'inline; filename="dsba-hub-my-calendar.ics"',
            "Cache-Control": "private, no-store",
            "Referrer-Policy": "no-referrer",
            "X-Robots-Tag": "noindex",
        },
    )


@router.get("/feeds/widget/{token}.json", response_model=WidgetFeed, responses={404: {"model": ErrorResponse}})
def widget_feed(token: Token, db: DB, response: Response) -> WidgetFeed:
    """What a student's home-screen widget shows: their next exam, today's dates and events, and the lesson to carry
    on with. Works only while the calendar is on for them and the address is current. Errors: not_found (404)."""
    response.headers["Cache-Control"] = "private, no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    response.headers["X-Robots-Tag"] = "noindex"
    return widget.widget_feed(db, token)
