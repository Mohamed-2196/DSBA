from __future__ import annotations

import datetime as dt
from datetime import datetime
from typing import Annotated, Literal, get_args
from uuid import UUID

from pydantic import Field, StringConstraints

from app.schemas.common import ApiModel, Year

# What a change told students: "sent" (a notification each), "limit" (they were told about this event today
# already), "none" (nothing to tell, or not asked to).
NoticeStatus = Literal["sent", "limit", "none"]
EventType = Literal["exam", "mock", "revision", "deadline", "careers", "event", "break", "term"]
Short = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]
Time = Annotated[str, StringConstraints(strip_whitespace=True, max_length=40)]
Line = Annotated[str, StringConstraints(strip_whitespace=True, max_length=300)]
EmployerId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9][a-z0-9-]{0,63}$")]


class CalendarEventOut(ApiModel):
    id: str
    date: dt.date
    end_date: dt.date | None
    time: str | None
    place: str | None
    title: str
    type: EventType
    year: Year | None  # None: everyone
    module_id: str | None
    unit_code: str | None
    duration: str | None  # an exam's length, as published: '3 hours'
    rules: str | None  # what to bring, which calculators
    source: str | None  # where the date comes from: a name or a link
    checked_on: dt.date | None  # when it was last checked against the source
    employer_id: str | None  # a careers date: the Career Navigator employer it belongs to
    sample: bool  # a placeholder date, not confirmed yet


class CalendarEventCreate(ApiModel):
    date: dt.date
    end_date: dt.date | None = None
    time: Time | None = None
    place: Short | None = None
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=160)]
    type: EventType
    year: Year | None = None
    module_id: str | None = None
    duration: Time | None = None
    rules: Line | None = None
    source: Line | None = None
    checked_on: dt.date | None = None
    employer_id: EmployerId | None = None
    sample: bool = False


class CalendarEventUpdate(ApiModel):
    date: dt.date | None = None
    end_date: dt.date | None = None
    time: Time | None = None
    place: Short | None = None
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=160)] | None = None
    type: EventType | None = None
    year: Year | None = None
    module_id: str | None = None
    duration: Time | None = None
    rules: Line | None = None
    source: Line | None = None
    checked_on: dt.date | None = None
    employer_id: EmployerId | None = None
    sample: bool | None = None
    # Tell the event's cohort when its date, time or place changes or it is confirmed (exams, mocks and deadlines).
    notify: bool = False


class CalendarEventSaved(CalendarEventOut):
    """An edited event, and what its change told students."""

    notice: NoticeStatus
    told: int  # the people notified


# ── a student's own calendar ─────────────────────────────────────────────────────────────────

# The colours a student's own events can take (the web app draws each with its own token).
PersonalColour = Literal["violet", "teal", "green", "orange", "rose", "slate"]
Repeat = Literal["none", "daily", "weekly"]
# Minutes before the start a reminder comes; an all-day event "starts" at 09:00 (services/my_calendar.py).
Reminder = Literal[0, 10, 30, 60, 1440]
MAX_HIDDEN = 300
Title = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=160)]
Notes = Annotated[str, StringConstraints(strip_whitespace=True, max_length=2000)]
EventId = Annotated[str, StringConstraints(min_length=1, max_length=120)]
ModuleId = Annotated[str, StringConstraints(pattern=r"^[a-z0-9][a-z0-9-]{0,63}$")]


class PersonalEventOut(ApiModel):
    """An event a student added for themselves: private to them. Without `startTime` it is all day (through
    `endDate` when set); with it, it runs from `startTime` to `endTime` (or for an hour) on `date`. Times are in
    Bahrain. A repeat runs every day or week from `date` until `repeatUntil` (none: for a year)."""

    id: UUID
    title: str
    date: dt.date
    end_date: dt.date | None
    start_time: dt.time | None
    end_time: dt.time | None
    place: str | None
    notes: str | None
    colour: PersonalColour
    repeat: Repeat
    repeat_until: dt.date | None
    remind: Reminder | None  # minutes before; None: no reminder
    created_at: datetime
    updated_at: datetime


class PersonalEventCreate(ApiModel):
    title: Title
    date: dt.date
    end_date: dt.date | None = None
    start_time: dt.time | None = None
    end_time: dt.time | None = None
    place: Short | None = None
    notes: Notes | None = None
    colour: PersonalColour = "violet"
    repeat: Repeat = "none"
    repeat_until: dt.date | None = None
    remind: Reminder | None = None


class PersonalEventUpdate(ApiModel):
    """Fields not sent stay; null clears the end date, times, place, notes, repeat end and reminder."""

    title: Title | None = None
    date: dt.date | None = None
    end_date: dt.date | None = None
    start_time: dt.time | None = None
    end_time: dt.time | None = None
    place: Short | None = None
    notes: Notes | None = None
    colour: PersonalColour | None = None
    repeat: Repeat | None = None
    repeat_until: dt.date | None = None
    remind: Reminder | None = None


class CalendarPrefsOut(ApiModel):
    """What a student keeps off their calendar, and their private feed. Hidden programme dates leave their list,
    month, Home and private feed; the shared feed and other people's calendars are unchanged."""

    hidden_events: list[str]  # programme event ids
    hidden_modules: list[str]  # every date of these modules
    hidden_types: list[EventType]
    feed_path: str | None  # the private feed's path (programme dates and their own), or None while it is off


class CalendarPrefsUpdate(ApiModel):
    """Each list sent replaces the one kept (at most 300 entries); lists not sent stay."""

    hidden_events: Annotated[list[EventId], Field(max_length=MAX_HIDDEN)] | None = None
    hidden_modules: Annotated[list[ModuleId], Field(max_length=MAX_HIDDEN)] | None = None
    hidden_types: Annotated[list[EventType], Field(max_length=len(get_args(EventType)))] | None = None
