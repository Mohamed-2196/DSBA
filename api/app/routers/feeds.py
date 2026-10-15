"""Private calendar feeds, read by calendar apps without a session: the secret in the address says whose it is."""

from __future__ import annotations

from typing import Annotated

from fastapi import Path, Response

from app.core.security import DB
from app.routers._base import router_for
from app.schemas.common import ErrorResponse
from app.services import my_calendar

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
