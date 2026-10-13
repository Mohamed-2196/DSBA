"""The academic calendar. Owner: content agent."""

from __future__ import annotations

import datetime as dt
from typing import Annotated

from fastapi import Query, Request, Response, status

from app.core.access import Box, Feature
from app.core.pagination import YearParam
from app.core.security import DB, client_ip, needs_feature, requires
from app.models import User
from app.routers._base import router_for
from app.schemas.calendar import CalendarEventCreate, CalendarEventOut, CalendarEventUpdate, EventType
from app.schemas.common import ErrorResponse
from app.services import access
from app.services import calendar as svc

router = router_for("calendar", needs_feature(Feature.calendar))

FEED_CACHE = "public, max-age=900"
PRIVATE_FEED_CACHE = "private, no-store"


def feed_cache(db: DB) -> str:
    """A shared cache may keep a feed only while the calendar is on for everyone."""
    return FEED_CACHE if access.on_for_everyone(db, Feature.calendar) else PRIVATE_FEED_CACHE


@router.get("/calendar/events", response_model=list[CalendarEventOut])
def list_events(
    db: DB,
    from_: dt.date | None = Query(default=None, alias="from"),
    to: dt.date | None = None,
    year: YearParam | None = None,
    module_id: str | None = None,
    type_: EventType | None = Query(default=None, alias="type"),
) -> list[CalendarEventOut]:
    """Events between `from` and `to` (inclusive; an event spanning several days counts if it overlaps), for a
    cohort plus everyone-events, oldest first."""
    return svc.list_events(db, start=from_, end=to, year=year, module_id=module_id, type_=type_)


@router.get("/calendar/upcoming", response_model=list[CalendarEventOut])
def upcoming(db: DB, n: int = Query(default=5, ge=1, le=60), year: YearParam | None = None) -> list[CalendarEventOut]:
    """The next n events from today (Bahrain time), including any still running today."""
    return svc.upcoming(db, n, year)


@router.get(
    "/calendar/feed.ics",
    response_class=Response,
    responses={200: {"content": {"text/calendar": {"schema": {"type": "string"}}}}},
)
def ics_feed(
    db: DB, year: YearParam | None = None, type_: EventType | None = Query(default=None, alias="type")
) -> Response:
    """An iCalendar feed to subscribe to from Google Calendar or Outlook (one cohort plus everyone-events, or all).
    `type=exam` gives only the exams (the web app's "Download the exams")."""
    name = f"dsba-hub-year-{year}" if year else "dsba-hub"
    file_name = f"{name}-{type_}s.ics" if type_ else f"{name}.ics"
    return Response(
        content=svc.feed(db, year, type_).encode("utf-8"),
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'inline; filename="{file_name}"', "Cache-Control": feed_cache(db)},
    )


@router.get(
    "/calendar/events/{event_id}.ics",
    response_class=Response,
    responses={200: {"content": {"text/calendar": {"schema": {"type": "string"}}}}, 404: {"model": ErrorResponse}},
)
def event_ics(event_id: str, db: DB) -> Response:
    """One event as an iCalendar file to import ("Add to calendar"): all-day, with a reminder the day before an exam
    or a deadline. Errors: not_found (404)."""
    return Response(
        content=svc.event_ics(db, event_id).encode("utf-8"),
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{event_id}.ics"', "Cache-Control": feed_cache(db)},
    )


@router.post("/calendar/events", response_model=CalendarEventOut, status_code=status.HTTP_201_CREATED)
def create_event(
    body: CalendarEventCreate, request: Request, user: Annotated[User, requires(Box.calendar_manage)], db: DB
) -> CalendarEventOut:
    """A new date. The id is '<date>-<slug of the title>'. For a module's event the cohort defaults to the
    module's year; leave `year` out (or null without a module) for everyone."""
    event = svc.create_event(db, user, body, client_ip(request))
    db.commit()
    return CalendarEventOut.model_validate(event)


@router.patch("/calendar/events/{event_id}", response_model=CalendarEventOut)
def update_event(
    event_id: str,
    body: CalendarEventUpdate,
    request: Request,
    user: Annotated[User, requires(Box.calendar_manage)],
    db: DB,
) -> CalendarEventOut:
    """Fields that are not sent stay as they are; `endDate`, `time`, `place`, `year` and `moduleId` can be
    cleared with null. The id never changes."""
    event = svc.get_event(db, event_id)
    svc.update_event(db, user, event, body, client_ip(request))
    db.commit()
    return CalendarEventOut.model_validate(event)


@router.delete("/calendar/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(
    event_id: str, request: Request, user: Annotated[User, requires(Box.calendar_manage)], db: DB
) -> Response:
    """Removes the date. Audited (the seed doesn't bring a deleted date back)."""
    svc.delete_event(db, user, svc.get_event(db, event_id), client_ip(request))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
