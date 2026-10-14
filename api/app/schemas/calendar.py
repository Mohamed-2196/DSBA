from __future__ import annotations

import datetime as dt
from typing import Annotated, Literal

from pydantic import StringConstraints

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
