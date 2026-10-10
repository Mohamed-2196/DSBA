"""The academic calendar. Owner: content agent."""

from __future__ import annotations

import datetime as dt

from fastapi import Query, Request, Response, status

from app.core.pagination import YearParam
from app.core.security import DB, Moderator
from app.routers._base import router_for
from app.schemas.calendar import CalendarEventCreate, CalendarEventOut, CalendarEventUpdate, EventType

router = router_for("calendar")


@router.get("/calendar/events", response_model=list[CalendarEventOut])
def list_events(
    db: DB,
    from_: dt.date | None = Query(default=None, alias="from"),
    to: dt.date | None = None,
    year: YearParam | None = None,
    module_id: str | None = None,
    type_: EventType | None = Query(default=None, alias="type"),
) -> list[CalendarEventOut]:
    raise NotImplementedError


@router.get("/calendar/upcoming", response_model=list[CalendarEventOut])
def upcoming(db: DB, n: int = Query(default=5, ge=1, le=60), year: YearParam | None = None) -> list[CalendarEventOut]:
    """The next n events from today (Bahrain time)."""
    raise NotImplementedError


@router.get("/calendar/feed.ics", response_class=Response)
def ics_feed(db: DB, year: YearParam | None = None) -> Response:
    """An iCalendar feed to subscribe to from Google Calendar or Outlook."""
    raise NotImplementedError


@router.post("/calendar/events", response_model=CalendarEventOut, status_code=status.HTTP_201_CREATED)
def create_event(body: CalendarEventCreate, request: Request, user: Moderator, db: DB) -> CalendarEventOut:
    raise NotImplementedError


@router.patch("/calendar/events/{event_id}", response_model=CalendarEventOut)
def update_event(
    event_id: str, body: CalendarEventUpdate, request: Request, user: Moderator, db: DB
) -> CalendarEventOut:
    raise NotImplementedError


@router.delete("/calendar/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(event_id: str, request: Request, user: Moderator, db: DB) -> Response:
    raise NotImplementedError
