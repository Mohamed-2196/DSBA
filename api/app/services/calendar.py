"""The academic calendar: queries, event ids, and the iCalendar feed (RFC 5545).

Event dates are calendar days in Bahrain. Every event is all-day: DTSTART;VALUE=DATE and an exclusive DTEND (the
day after the last day). Lines end in CRLF and are folded at 75 octets without splitting a UTF-8 character."""

from __future__ import annotations

import datetime as dt
import re
from collections.abc import Iterable, Mapping
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.core.text import slugify
from app.core.time import utcnow
from app.models import CalendarEvent, Module


def _bahrain() -> dt.tzinfo:
    try:
        return ZoneInfo("Asia/Bahrain")
    except ZoneInfoNotFoundError:  # no tz database in the image: Bahrain is UTC+3 all year (no daylight saving)
        return dt.timezone(dt.timedelta(hours=3), "Asia/Bahrain")


BAHRAIN = _bahrain()

TYPE_LABELS: dict[str, str] = {
    "exam": "Exam",
    "mock": "Mock exam",
    "revision": "Revision",
    "deadline": "Deadline",
    "event": "Event",
    "break": "Break",
    "term": "Term dates",
}
SAMPLE_NOTE = "Sample date: it follows last year\u2019s pattern and is not confirmed. Check with the programme office."


def bahrain_today() -> dt.date:
    return utcnow().astimezone(BAHRAIN).date()


def cohort_label(year: int | None) -> str:
    return f"Year {year}" if year else "All years"


# ── queries ──────────────────────────────────────────────────────────────────────────────────


def events_query(
    *,
    start: dt.date | None = None,
    end: dt.date | None = None,
    year: int | None = None,
    module_id: str | None = None,
    type_: str | None = None,
) -> Select[tuple[CalendarEvent]]:
    """Events that overlap [start, end], for a cohort plus everyone-events, oldest first."""
    q = select(CalendarEvent)
    if start is not None:
        q = q.where(func.coalesce(CalendarEvent.end_date, CalendarEvent.date) >= start)
    if end is not None:
        q = q.where(CalendarEvent.date <= end)
    if year is not None:
        q = q.where(or_(CalendarEvent.year == year, CalendarEvent.year.is_(None)))
    if module_id is not None:
        q = q.where(CalendarEvent.module_id == module_id)
    if type_ is not None:
        q = q.where(CalendarEvent.type == type_)
    return q.order_by(CalendarEvent.date, CalendarEvent.id)


def new_event_id(db: Session, date: dt.date, title: str) -> str:
    """'2026-10-23-statistical-inference-exam', with -2, -3, ... when it is taken."""
    base = f"{date.isoformat()}-{slugify(title, max_len=100) or 'event'}"
    taken = set(db.scalars(select(CalendarEvent.id).where(CalendarEvent.id.like(f"{base}%"))))
    if base not in taken:
        return base
    n = 2
    while f"{base}-{n}" in taken:
        n += 1
    return f"{base}-{n}"


# ── iCalendar ────────────────────────────────────────────────────────────────────────────────

CRLF = "\r\n"
_CONTROL = re.compile(r"[\x00-\x08\x0b-\x1f\x7f]")  # not allowed in TEXT values (tabs and newlines are handled)


def ics_text(value: str) -> str:
    """A TEXT value (RFC 5545 3.3.11): backslash, semicolon, comma and line breaks escaped; other control characters
    dropped, so moderator-typed text can never start a new property line."""
    v = value.replace("\r\n", "\n").replace("\r", "\n")
    v = _CONTROL.sub("", v)
    return v.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


def ics_fold(line: str) -> str:
    """Folds a content line at 75 octets (continuation lines start with a space) without splitting a character."""
    if len(line.encode()) <= 75:
        return line
    parts: list[str] = []
    cur: list[str] = []
    size, limit = 0, 75
    for ch in line:
        n = len(ch.encode())
        if size + n > limit:
            parts.append("".join(cur))
            cur, size, limit = [], 0, 74
        cur.append(ch)
        size += n
    parts.append("".join(cur))
    return (CRLF + " ").join(parts)


def _date_value(d: dt.date) -> str:
    return d.strftime("%Y%m%d")


def _utc_stamp(t: dt.datetime) -> str:
    return t.astimezone(dt.UTC).strftime("%Y%m%dT%H%M%SZ")


def summary(e: CalendarEvent) -> str:
    """The title, led by the unit code when the title doesn't already name it."""
    if e.unit_code and e.unit_code.lower() not in e.title.lower():
        return f"{e.unit_code} {e.title}"
    return e.title


def describe(e: CalendarEvent, module: Module | None) -> str:
    when = f"{e.date:%A} {e.date.day} {e.date:%B %Y}"
    if e.end_date and e.end_date != e.date:
        when += f" to {e.end_date:%A} {e.end_date.day} {e.end_date:%B %Y}"
    who = f"Year {e.year}" if e.year else "all years"
    lines = [f"{TYPE_LABELS.get(e.type, 'Event')} for {who}, {when}."]
    if module is not None:
        lines.append(f"Module: {module.unit_code + ' ' if module.unit_code else ''}{module.name}.")
    if e.time or e.place:
        lines.append(", ".join(p for p in (e.time, e.place) if p) + ".")
    if e.sample:
        lines.append(SAMPLE_NOTE)
    if e.time or e.place:
        lines.append("From the DSBA Hub calendar (all-day event).")
    else:
        lines.append("From the DSBA Hub calendar (all-day event; exam times and venues are not included).")
    return "\n".join(lines)


def event_url(base_url: str, e: CalendarEvent) -> str:
    return f"{base_url.rstrip('/')}/calendar?date={e.date.isoformat()}&event={e.id}"


def _vevent(e: CalendarEvent, module: Module | None, now: dt.datetime, base_url: str) -> list[str]:
    last_day = e.end_date or e.date
    changed = e.updated_at or e.created_at
    lines = [
        "BEGIN:VEVENT",
        f"UID:{e.id}@dsba-hub",
        f"DTSTAMP:{_utc_stamp(now)}",
        f"DTSTART;VALUE=DATE:{_date_value(e.date)}",
        f"DTEND;VALUE=DATE:{_date_value(last_day + dt.timedelta(days=1))}",  # exclusive
        f"SUMMARY:{ics_text(summary(e))}",
        f"DESCRIPTION:{ics_text(describe(e, module))}",
    ]
    if e.place:
        lines.append(f"LOCATION:{ics_text(e.place)}")
    lines += [
        f"CATEGORIES:{ics_text(TYPE_LABELS.get(e.type, 'Event'))}",
        f"TRANSP:{'OPAQUE' if e.type == 'exam' else 'TRANSPARENT'}",
        f"URL:{event_url(base_url, e)}",
    ]
    if changed is not None:
        lines.append(f"LAST-MODIFIED:{_utc_stamp(changed)}")
    if e.type in ("exam", "deadline"):
        lines += [
            "BEGIN:VALARM",
            "ACTION:DISPLAY",
            f"DESCRIPTION:{ics_text('Tomorrow: ' + summary(e))}",
            "TRIGGER:-PT15H",  # 09:00 the day before an all-day event
            "END:VALARM",
        ]
    lines.append("END:VEVENT")
    return lines


def build_ics(
    events: Iterable[CalendarEvent],
    modules: Mapping[str, Module],
    *,
    name: str,
    base_url: str,
    now: dt.datetime | None = None,
) -> str:
    stamp = now or utcnow()
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//DSBA Hub//Calendar//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{ics_text(name)}",
        "X-WR-TIMEZONE:Asia/Bahrain",
        "REFRESH-INTERVAL;VALUE=DURATION:PT6H",
        "X-PUBLISHED-TTL:PT6H",
    ]
    for e in events:
        lines += _vevent(e, modules.get(e.module_id) if e.module_id else None, stamp, base_url)
    lines.append("END:VCALENDAR")
    return CRLF.join(ics_fold(line) for line in lines) + CRLF
