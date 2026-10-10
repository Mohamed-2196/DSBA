"""The academic calendar. Owner: content agent."""

from __future__ import annotations

import datetime as dt

from fastapi import Query, Request, Response, status
from sqlalchemy import select

from app.config import get_settings
from app.core.errors import invalid, not_found
from app.core.pagination import YearParam
from app.core.security import DB, Moderator
from app.models import CalendarEvent, Module
from app.routers._base import router_for
from app.schemas.calendar import CalendarEventCreate, CalendarEventOut, CalendarEventUpdate, EventType
from app.services import audit
from app.services import calendar as svc
from app.services.ratelimit import request_ip

router = router_for("calendar")

FEED_CACHE = "public, max-age=900"


def _module(db: DB, module_id: str | None) -> Module | None:
    if module_id is None:
        return None
    m = db.get(Module, module_id)
    if m is None:
        raise invalid("moduleId", "This module doesn't exist.")
    return m


def _check_dates(date: dt.date, end_date: dt.date | None) -> None:
    if end_date is not None and end_date < date:
        raise invalid("endDate", "The last day can't be before the first.")


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
    q = svc.events_query(start=from_, end=to, year=year, module_id=module_id, type_=type_)
    return [CalendarEventOut.model_validate(e) for e in db.scalars(q)]


@router.get("/calendar/upcoming", response_model=list[CalendarEventOut])
def upcoming(db: DB, n: int = Query(default=5, ge=1, le=60), year: YearParam | None = None) -> list[CalendarEventOut]:
    """The next n events from today (Bahrain time), including any still running today."""
    q = svc.events_query(start=svc.bahrain_today(), year=year).limit(n)
    return [CalendarEventOut.model_validate(e) for e in db.scalars(q)]


@router.get(
    "/calendar/feed.ics",
    response_class=Response,
    responses={200: {"content": {"text/calendar": {"schema": {"type": "string"}}}}},
)
def ics_feed(db: DB, year: YearParam | None = None) -> Response:
    """An iCalendar feed to subscribe to from Google Calendar or Outlook (one cohort plus everyone-events, or all)."""
    events = db.scalars(svc.events_query(year=year)).all()
    module_ids = {e.module_id for e in events if e.module_id}
    modules = {m.id: m for m in db.scalars(select(Module).where(Module.id.in_(module_ids)))} if module_ids else {}
    name = f"DSBA Hub: Year {year}" if year else "DSBA Hub"
    body = svc.build_ics(events, modules, name=name, base_url=get_settings().web_base_url)
    file_name = f"dsba-hub-year-{year}.ics" if year else "dsba-hub.ics"
    return Response(
        content=body.encode("utf-8"),
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": f'inline; filename="{file_name}"', "Cache-Control": FEED_CACHE},
    )


@router.post("/calendar/events", response_model=CalendarEventOut, status_code=status.HTTP_201_CREATED)
def create_event(body: CalendarEventCreate, request: Request, user: Moderator, db: DB) -> CalendarEventOut:
    """A new date. The id is '<date>-<slug of the title>'. For a module's event the cohort defaults to the
    module's year; leave `year` out (or null without a module) for everyone."""
    _check_dates(body.date, body.end_date)
    module = _module(db, body.module_id)
    year: int | None = body.year
    if module is not None and "year" not in body.model_fields_set:
        year = module.year
    event = CalendarEvent(
        id=svc.new_event_id(db, body.date, body.title),
        date=body.date,
        end_date=body.end_date,
        time=body.time or None,
        place=body.place or None,
        title=body.title,
        type=body.type,
        year=year,
        module_id=module.id if module else None,
        unit_code=module.unit_code if module else None,
        sample=body.sample,
        created_by=user.id,
    )
    db.add(event)
    db.flush()
    audit.record(db, user, "calendar.create", "calendar_event", event.id, {"title": event.title}, request_ip(request))
    db.commit()
    return CalendarEventOut.model_validate(event)


@router.patch("/calendar/events/{event_id}", response_model=CalendarEventOut)
def update_event(
    event_id: str, body: CalendarEventUpdate, request: Request, user: Moderator, db: DB
) -> CalendarEventOut:
    """Fields that are not sent stay as they are; `endDate`, `time`, `place`, `year` and `moduleId` can be
    cleared with null. The id never changes."""
    event = db.get(CalendarEvent, event_id)
    if event is None:
        raise not_found("This date isn't on the calendar.")
    sent = body.model_fields_set
    _check_dates(
        body.date if "date" in sent and body.date is not None else event.date,
        body.end_date if "end_date" in sent else event.end_date,
    )
    module = _module(db, body.module_id) if "module_id" in sent else None
    changed: list[str] = []

    def put(field: str, value: object) -> None:
        if value != getattr(event, field):
            setattr(event, field, value)
            changed.append(field)

    for field in ("date", "title", "type", "sample"):  # required columns: null means "leave as it is"
        value = getattr(body, field)
        if field in sent and value is not None:
            put(field, value)
    for field in ("end_date", "time", "place", "year"):
        if field in sent:
            value = getattr(body, field)
            put(field, None if value == "" else value)  # an emptied text field clears it
    if "module_id" in sent:
        put("module_id", module.id if module else None)
        put("unit_code", module.unit_code if module else None)
    if changed:
        audit.record(
            db,
            user,
            "calendar.update",
            "calendar_event",
            event.id,
            {"title": event.title, "fields": changed},
            request_ip(request),
        )
    db.commit()
    return CalendarEventOut.model_validate(event)


@router.delete("/calendar/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(event_id: str, request: Request, user: Moderator, db: DB) -> Response:
    """Removes the date. Audited (the seed doesn't bring a deleted date back)."""
    event = db.get(CalendarEvent, event_id)
    if event is None:
        raise not_found("This date isn't on the calendar.")
    audit.record(
        db,
        user,
        "calendar.delete",
        "calendar_event",
        event.id,
        {"title": event.title, "date": event.date.isoformat()},
        request_ip(request),
    )
    db.delete(event)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
