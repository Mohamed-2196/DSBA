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
    # An exam's resit sitting: for the year after the module's (`year` + 1) and those resitting the module, not for
    # `year` itself. False: the main sitting, or not an exam.
    resit: bool


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
    # An exam's resit sitting. Not sent: an exam from September to December is a resit (the October sitting).
    resit: bool | None = None


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
    resit: bool | None = None  # only an exam can be a resit
    # Tell the event's cohort when its date, time or place changes or it is confirmed (exams, mocks and deadlines).
    notify: bool = False


class CalendarEventSaved(CalendarEventOut):
    """An edited event, and what its change told students."""

    notice: NoticeStatus
    told: int  # the people notified


# ── a student's own calendar ─────────────────────────────────────────────────────────────────

# The colours a student's own events can take (the web app draws each with its own token).
PersonalColour = Literal["violet", "teal", "green", "orange", "rose", "slate"]
Repeat = Literal["none", "daily", "weekly", "fortnightly", "monthly"]
# What a change or a deletion made from one day of a repeat covers: that day only, or that day and every later one.
OccurrenceScope = Literal["one", "following"]
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
    Bahrain. A repeat runs every day, week, two weeks or month from `date` until `repeatUntil` (none: for a year),
    except on the `skipped` days. A monthly repeat falls on the same day of each month, and on a month's last day
    when the month has no such day (the 31st: 30 April, 28 or 29 February). That day is `date`'s, or `monthDay`
    when `date` is itself such a last day (a repeat changed from 28 February on keeps the 31st)."""

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
    month_day: int | None  # a monthly repeat's day of the month when it isn't `date`'s (29 to 31); None: `date`'s
    skipped: list[dt.date]  # days taken off the repeat, oldest first
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
    show_plan: bool  # their plan (their boards' dated cards) on their calendar and in their private feed
    feed_path: str | None  # the private feed's path (programme dates and their own), or None while it is off


class CalendarPrefsUpdate(ApiModel):
    """Each list sent replaces the one kept (at most 300 entries); what is not sent stays."""

    hidden_events: Annotated[list[EventId], Field(max_length=MAX_HIDDEN)] | None = None
    hidden_modules: Annotated[list[ModuleId], Field(max_length=MAX_HIDDEN)] | None = None
    hidden_types: Annotated[list[EventType], Field(max_length=len(get_args(EventType)))] | None = None
    show_plan: bool | None = None


# ── the exam timetable, pasted in one go (reps) ──────────────────────────────────────────────

MAX_TIMETABLE_ROWS = 80
MAX_TIMETABLE_TEXT = 20_000
# What saving a row does: changes an exam's date, time or place ("update"), adds an exam ("new"), changes nothing
# ("same"), or nothing until the row is fixed ("fix": its `problems` say what).
TimetableAction = Literal["update", "new", "same", "fix"]
UnitCode = Annotated[str, StringConstraints(strip_whitespace=True, max_length=16)]


class TimetableRowIn(ApiModel):
    """One exam of the timetable as the rep checked it. A row without a time or a place keeps the exam's own. Without
    `resit`, the row says (the word "resit") or its date does (exam_names.resit_sitting)."""

    unit_code: UnitCode | None = None
    date: dt.date | None = None
    time: Time | None = None
    place: Short | None = None
    resit: bool | None = None


class TimetableWas(ApiModel):
    """The exam as the calendar has it now."""

    date: dt.date
    time: str | None
    place: str | None
    sample: bool
    resit: bool


class TimetableRow(ApiModel):
    """A row of the timetable, matched to its module and, when the calendar has one near its date, to its exam."""

    line: int | None  # the pasted line it came from (None: a row sent as fields)
    text: str | None  # that line as pasted
    unit_code: str | None
    date: dt.date | None
    time: str | None
    place: str | None
    module_id: str | None
    module_name: str | None
    year: Year | None  # the module's year
    resit: bool  # the resit sitting (for the year after the module's), not the main one
    event_id: str | None  # the exam of the same sitting it changes; None: a new exam
    action: TimetableAction
    was: TimetableWas | None
    problems: list[str]  # what to fix before it can be saved


class TimetablePreviewIn(ApiModel):
    """The timetable as pasted (`text`), or its rows after the rep fixed them (`rows`): one of the two."""

    text: Annotated[str, StringConstraints(max_length=MAX_TIMETABLE_TEXT)] | None = None
    rows: Annotated[list[TimetableRowIn], Field(max_length=MAX_TIMETABLE_ROWS)] | None = None


class TimetablePreview(ApiModel):
    rows: list[TimetableRow]


class TimetableSave(ApiModel):
    """The rows to save, all at once, with where they come from. With `notify`, each year whose exams changed gets
    one notice listing them."""

    rows: Annotated[list[TimetableRowIn], Field(min_length=1, max_length=MAX_TIMETABLE_ROWS)]
    source: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=300)]
    notify: bool = True


class TimetableNotice(ApiModel):
    """What one year was told: about its main sittings, and the year before's resits."""

    year: Year | None  # None: every year, or `resitters`
    resitters: bool  # final-year resits: told only to those resitting them
    exams: int
    notice: NoticeStatus
    told: int


class TimetableSaved(ApiModel):
    created: int
    updated: int
    unchanged: int
    notices: list[TimetableNotice]
