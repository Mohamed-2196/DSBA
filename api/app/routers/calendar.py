"""The academic calendar, and each student's own layer on it: their events, the programme dates they hide, and
their private feed. A student's own calendar is theirs alone: another person's event answers 404."""

from __future__ import annotations

import datetime as dt
from typing import Annotated, Any
from uuid import UUID

from fastapi import Query, Request, Response, status

from app.core.access import Box, Feature
from app.core.pagination import YearParam
from app.core.security import DB, ActiveUser, CurrentUser, client_ip, needs_feature, requires
from app.models import User
from app.routers._base import router_for
from app.schemas.auth import MAX_PAPERS
from app.schemas.board import AgendaCard
from app.schemas.calendar import (
    CalendarEventCreate,
    CalendarEventOut,
    CalendarEventSaved,
    CalendarEventUpdate,
    CalendarPrefsOut,
    CalendarPrefsUpdate,
    EventType,
    OccurrenceScope,
    PersonalEventCreate,
    PersonalEventOut,
    PersonalEventUpdate,
    TimetablePreview,
    TimetablePreviewIn,
    TimetableSave,
    TimetableSaved,
)
from app.schemas.common import ErrorResponse
from app.services import access, timetable
from app.services import calendar as svc
from app.services import my_calendar as mine

router = router_for("calendar", needs_feature(Feature.calendar))

FEED_CACHE = "public, max-age=900"
PAPERS_PATTERN = r"^[a-z0-9][a-z0-9-]{0,63}(,[a-z0-9][a-z0-9-]{0,63})*$"
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
def upcoming(
    db: DB, limit: int = Query(default=5, ge=1, le=60), year: YearParam | None = None
) -> list[CalendarEventOut]:
    """The next `limit` events from today (Bahrain time), including any still running today."""
    return svc.upcoming(db, limit, year)


@router.get(
    "/calendar/feed.ics",
    response_class=Response,
    responses={200: {"content": {"text/calendar": {"schema": {"type": "string"}}}}},
)
def ics_feed(
    db: DB,
    year: YearParam | None = None,
    type_: EventType | None = Query(default=None, alias="type"),
    modules: Annotated[str | None, Query(max_length=1400, pattern=PAPERS_PATTERN)] = None,
) -> Response:
    """An iCalendar feed to subscribe to from Google Calendar or Outlook (one cohort plus everyone-events, or all).
    `type=exam` gives only the exams (the web app's "Download the exams"). `modules` (comma-separated module ids,
    up to 20) keeps a module's events to those papers, from any year: the feed of someone's own papers, with
    nothing in the address that says who they are."""
    papers = sorted(set(modules.split(",")))[:MAX_PAPERS] if modules else None
    name = f"dsba-hub-year-{year}" if year else "dsba-hub"
    if papers is not None:
        name = f"{name}-papers"
    file_name = f"{name}-{type_}s.ics" if type_ else f"{name}.ics"
    return Response(
        content=svc.feed(db, year, type_, papers).encode("utf-8"),
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


@router.patch("/calendar/events/{event_id}", response_model=CalendarEventSaved)
def update_event(
    event_id: str,
    body: CalendarEventUpdate,
    request: Request,
    user: Annotated[User, requires(Box.calendar_manage)],
    db: DB,
) -> CalendarEventSaved:
    """Fields that are not sent stay as they are; `endDate`, `time`, `place`, `year` and `moduleId` can be
    cleared with null. The id never changes. With `notify`, a new date, time or place of an exam, mock or deadline,
    or its confirmation, is told to its cohort and to those with it on their board: at most once per event a day
    (`notice`: sent, limit or none)."""
    event = svc.get_event(db, event_id)
    notice = svc.update_event(db, user, event, body, client_ip(request))
    db.commit()
    out = CalendarEventOut.model_validate(event)
    return CalendarEventSaved(**out.model_dump(), notice=notice.status, told=notice.told)


@router.delete("/calendar/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_event(
    event_id: str, request: Request, user: Annotated[User, requires(Box.calendar_manage)], db: DB
) -> Response:
    """Removes the date. Audited (the seed doesn't bring a deleted date back)."""
    svc.delete_event(db, user, svc.get_event(db, event_id), client_ip(request))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/calendar/timetable/preview", response_model=TimetablePreview)
def timetable_preview(
    body: TimetablePreviewIn, user: Annotated[User, requires(Box.calendar_manage)], db: DB
) -> TimetablePreview:
    """The exam timetable as pasted (`text`: rows with a module code, a date, a time and a venue, as they come from
    the email or the spreadsheet), or its rows after fixing (`rows`): each row matched to its module and exam, with
    what saving it will do (update, new, same) or what to fix first. Changes nothing. Errors: invalid_input (422: no
    rows found, a line over 500 characters, or neither or both of `text` and `rows`)."""
    return timetable.preview(db, body)


@router.post("/calendar/timetable", response_model=TimetableSaved)
def timetable_save(
    body: TimetableSave, request: Request, user: Annotated[User, requires(Box.calendar_manage)], db: DB
) -> TimetableSaved:
    """Saves every row at once: an exam's new date, time and place, or a new exam, each confirmed with `source` and
    today as its check. With `notify`, each year whose exams changed gets one notice listing them (at most one a year
    a day). Audited. Errors: invalid_input (422, fields 'rows.<n>': nothing is saved while a row needs fixing),
    rate_limited (429: ten saves an hour)."""
    saved = timetable.save(db, user, body, client_ip(request))
    db.commit()
    return saved


# ── your own calendar ────────────────────────────────────────────────────────────────────────

ICS: dict[int | str, dict[str, Any]] = {
    200: {"content": {"text/calendar": {"schema": {"type": "string"}}}},
    404: {"model": ErrorResponse},
}


@router.get("/calendar/mine/events", response_model=list[PersonalEventOut])
def my_events(user: CurrentUser, db: DB) -> list[PersonalEventOut]:
    """Your own events, by date. Each repeat is one event: the web app lays out its occurrences."""
    return [PersonalEventOut.model_validate(e) for e in mine.list_events(db, user)]


@router.post("/calendar/mine/events", response_model=PersonalEventOut, status_code=status.HTTP_201_CREATED)
def add_my_event(body: PersonalEventCreate, user: ActiveUser, db: DB) -> PersonalEventOut:
    """An event on your calendar only. Errors: invalid_input (422: dates or times that don't fit together),
    calendar_full (409), rate_limited (429)."""
    event = mine.create_event(db, user, body)
    db.commit()
    return PersonalEventOut.model_validate(event)


@router.patch("/calendar/mine/events/{event_id}", response_model=PersonalEventOut)
def edit_my_event(event_id: UUID, body: PersonalEventUpdate, user: ActiveUser, db: DB) -> PersonalEventOut:
    """Fields not sent stay; null clears the optional ones. A repeat changes as a whole (one day of it: the
    occurrence route below). Errors: not_found (404), invalid_input (422)."""
    event = mine.get_event(db, user, event_id)
    mine.update_event(db, event, body)
    db.commit()
    return PersonalEventOut.model_validate(event)


@router.delete("/calendar/mine/events/{event_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_event(event_id: UUID, user: ActiveUser, db: DB) -> Response:
    """Deletes the event, every repeat of it. Errors: not_found (404)."""
    mine.delete_event(db, mine.get_event(db, user, event_id))
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.patch("/calendar/mine/events/{event_id}/occurrences/{day}", response_model=PersonalEventOut)
def edit_my_occurrence(
    event_id: UUID, day: dt.date, body: PersonalEventUpdate, user: ActiveUser, db: DB, scope: OccurrenceScope = "one"
) -> PersonalEventOut:
    """A change made from one day of a repeat. `scope=one`: that day becomes an event of its own with the change;
    `following`: a new repeat with the change runs from that day, and the old one ends the day before. Returns the
    event that now holds the day. Errors: not_found (404) when no occurrence of the event starts on `day`,
    invalid_input (422), calendar_full (409), rate_limited (429)."""
    event = mine.change_occurrence(db, user, mine.get_event(db, user, event_id), day, scope, body)
    db.commit()
    return PersonalEventOut.model_validate(event)


@router.delete("/calendar/mine/events/{event_id}/occurrences/{day}", status_code=status.HTTP_204_NO_CONTENT)
def delete_my_occurrence(
    event_id: UUID, day: dt.date, user: ActiveUser, db: DB, scope: OccurrenceScope = "one"
) -> Response:
    """Takes one day off a repeat (`scope=one`), or that day and every later one (`following`); an event left
    without a day is deleted. Errors: not_found (404) when no occurrence of the event starts on `day`."""
    mine.delete_occurrence(db, mine.get_event(db, user, event_id), day, scope)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/calendar/mine/events/{event_id}.ics", response_class=Response, responses=ICS)
def my_event_ics(event_id: UUID, user: CurrentUser, db: DB) -> Response:
    """One of your events as an .ics file to import, with its repeat and reminder. Errors: not_found (404)."""
    event = mine.get_event(db, user, event_id)
    return Response(
        content=mine.event_ics(event).encode("utf-8"),
        media_type="text/calendar; charset=utf-8",
        headers={
            "Content-Disposition": f'attachment; filename="{mine.ics_file_name(event)}"',
            "Cache-Control": PRIVATE_FEED_CACHE,
        },
    )


@router.get("/calendar/mine/plan", response_model=list[AgendaCard])
def my_plan(user: CurrentUser, db: DB) -> list[AgendaCard]:
    """Your plan on your calendar: the cards not done on your active boards that have a day of their own (a due date,
    or the day your revision plan gives them), by day. Only yours; empty while boards are off for you. The calendar
    shows it while `showPlan` is on in your settings."""
    return mine.plan_of(db, user)


@router.get("/calendar/mine/settings", response_model=CalendarPrefsOut)
def my_settings(user: CurrentUser, db: DB) -> CalendarPrefsOut:
    """The programme dates you keep off your calendar, and your private feed's path."""
    return mine.prefs_out(user, mine.get_prefs(db, user))


@router.patch("/calendar/mine/settings", response_model=CalendarPrefsOut)
def change_my_settings(body: CalendarPrefsUpdate, user: ActiveUser, db: DB) -> CalendarPrefsOut:
    """Each list sent (hidden dates, modules, types) replaces the one kept, and `showPlan` turns your plan on your
    calendar and private feed on or off; what is not sent stays."""
    prefs = mine.update_prefs(db, user, body)
    db.commit()
    return mine.prefs_out(user, prefs)


@router.post("/calendar/mine/feed", response_model=CalendarPrefsOut)
def new_my_feed(user: ActiveUser, db: DB) -> CalendarPrefsOut:
    """Turns your private feed on at a new address. An address you had before stops working."""
    prefs = mine.new_feed(db, user)
    db.commit()
    return mine.prefs_out(user, prefs)


@router.delete("/calendar/mine/feed", response_model=CalendarPrefsOut)
def stop_my_feed(user: ActiveUser, db: DB) -> CalendarPrefsOut:
    """Turns your private feed off: its address stops working."""
    prefs = mine.stop_feed(db, user)
    db.commit()
    return mine.prefs_out(user, prefs)
