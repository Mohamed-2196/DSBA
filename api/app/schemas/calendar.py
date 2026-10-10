from __future__ import annotations

import datetime as dt
from typing import Annotated, Literal

from pydantic import StringConstraints

from app.schemas.common import ApiModel, Year

EventType = Literal["exam", "mock", "revision", "deadline", "event", "break", "term"]
Short = Annotated[str, StringConstraints(strip_whitespace=True, max_length=120)]


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
    sample: bool  # a placeholder date, not confirmed yet


class CalendarEventCreate(ApiModel):
    date: dt.date
    end_date: dt.date | None = None
    time: Annotated[str, StringConstraints(strip_whitespace=True, max_length=40)] | None = None
    place: Short | None = None
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=160)]
    type: EventType
    year: Year | None = None
    module_id: str | None = None
    sample: bool = False


class CalendarEventUpdate(ApiModel):
    date: dt.date | None = None
    end_date: dt.date | None = None
    time: Annotated[str, StringConstraints(strip_whitespace=True, max_length=40)] | None = None
    place: Short | None = None
    title: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=160)] | None = None
    type: EventType | None = None
    year: Year | None = None
    module_id: str | None = None
    sample: bool | None = None
