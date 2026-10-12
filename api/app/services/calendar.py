"""The academic calendar: queries, the moderators' edits, and the iCalendar feed (RFC 5545).

Event dates are calendar days in Bahrain. Every event is all-day: DTSTART;VALUE=DATE and an exclusive DTEND (the
day after the last day). Lines end in CRLF and are folded at 75 octets without splitting a UTF-8 character.
"Today" is core.time.bahrain_today(), the Hub's one definition."""

from __future__ import annotations

import datetime as dt
import re
from collections.abc import Iterable, Mapping

from sqlalchemy import Select, func, or_, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.errors import ApiError, invalid, not_found
from app.core.text import has_latin, insert_with_unique_slug, short_id
from app.core.time import bahrain_today, utcnow
from app.models import CalendarEvent, Module, User
from app.schemas.calendar import CalendarEventCreate, CalendarEventOut, CalendarEventUpdate
from app.services.content import apply_patch, record
from app.services.modules import require_module

TYPE_LABELS: dict[str, str] = {
    "exam": "Exam",
    "mock": "Mock exam",
    "revision": "Revision",
    "deadline": "Deadline",
    "event": "Event",
    "break": "Break",
    "term": "Term dates",
}
SAMPLE_NOTE = "Not confirmed yet. Check with the programme office before you plan around it."


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


def list_events(
    db: Session,
    *,
    start: dt.date | None,
    end: dt.date | None,
    year: int | None,
    module_id: str | None,
    type_: str | None,
) -> list[CalendarEventOut]:
    q = events_query(start=start, end=end, year=year, module_id=module_id, type_=type_)
    return [CalendarEventOut.model_validate(e) for e in db.scalars(q)]


def upcoming(db: Session, n: int, year: int | None) -> list[CalendarEventOut]:
    """The next n events from today in Bahrain, including any still running today."""
    q = events_query(start=bahrain_today(), year=year).limit(n)
    return [CalendarEventOut.model_validate(e) for e in db.scalars(q)]


def feed(db: Session, year: int | None, type_: str | None = None) -> str:
    """The iCalendar document for a cohort (plus everyone-events), or for everyone; with `type_`, only events of
    that type (the exams)."""
    events = db.scalars(events_query(year=year, type_=type_)).all()
    module_ids = {e.module_id for e in events if e.module_id}
    modules = {m.id: m for m in db.scalars(select(Module).where(Module.id.in_(module_ids)))} if module_ids else {}
    name = f"DSBA Hub: Year {year}" if year else "DSBA Hub"
    if type_ is not None:
        name = f"{name}, {TYPE_LABELS.get(type_, type_).lower()}s"
    return build_ics(events, modules, name=name, base_url=get_settings().web_base_url)


def event_ics(db: Session, event_id: str) -> str:
    """One event as an iCalendar file, for "Add to calendar" (code quality review CQ-5: the web app's own builder
    can go). 404 not_found for an unknown id."""
    e = get_event(db, event_id)
    module = db.get(Module, e.module_id) if e.module_id else None
    modules = {module.id: module} if module is not None else {}
    return build_ics([e], modules, name=summary(e), base_url=get_settings().web_base_url, subscription=False)


# ── writing (moderators) ─────────────────────────────────────────────────────────────────────

EDITABLE = ("date", "end_date", "time", "place", "title", "type", "year", "sample")
CLEARABLE = ("end_date", "time", "place", "year")


def _check_dates(date: dt.date, end_date: dt.date | None) -> None:
    if end_date is not None and end_date < date:
        raise invalid("endDate", "The last day can't be before the first.")


def get_event(db: Session, event_id: str) -> CalendarEvent:
    event = db.get(CalendarEvent, event_id)
    if event is None:
        raise not_found("This date isn't on the calendar.")
    return event


def create_event(db: Session, user: User, body: CalendarEventCreate, ip: str | None) -> CalendarEvent:
    """A new date, with the id '<date>-<slug of the title>' ('-2' when taken). For a module's event the cohort is the
    module's year unless `year` is sent (null: everyone)."""
    _check_dates(body.date, body.end_date)
    module = require_module(db, body.module_id)
    year = module.year if module is not None and "year" not in body.model_fields_set else body.year
    event = CalendarEvent(
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
    # its id: the date and the title ('2026-12-03-mock-exam'), or the date and a short id for a title without Latin
    # letters ('2026-12-03-x3k9q2', decision D8)
    words = body.title if has_latin(body.title) else short_id()
    insert_with_unique_slug(db, event, CalendarEvent.id, f"{body.date.isoformat()} {words}", fallback="event")
    record(db, user, "calendar.create", "calendar_event", event.id, event.title, ip)
    return event


def update_event(db: Session, user: User, event: CalendarEvent, body: CalendarEventUpdate, ip: str | None) -> None:
    """Fields that are not sent stay; null clears the end date, time, place, cohort or module. The id never changes.
    On a refusal the event is left as it was."""
    module = require_module(db, body.module_id) if "module_id" in body.model_fields_set else None
    changed = apply_patch(event, body, EDITABLE, clearable=CLEARABLE)
    if "module_id" in body.model_fields_set and (module.id if module else None) != event.module_id:
        event.module_id = module.id if module else None
        event.unit_code = module.unit_code if module else None
        changed += ["module_id", "unit_code"]
    try:
        _check_dates(event.date, event.end_date)
    except ApiError:
        db.expire(event)  # drop the unsaved changes
        raise
    if changed:
        record(db, user, "calendar.update", "calendar_event", event.id, event.title, ip, fields=changed)


def delete_event(db: Session, user: User, event: CalendarEvent, ip: str | None) -> None:
    """The audit row is what keeps the seed from bringing a deleted date back."""
    record(db, user, "calendar.delete", "calendar_event", event.id, event.title, ip, date=event.date.isoformat())
    db.delete(event)


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
    subscription: bool = True,
) -> str:
    """A VCALENDAR of `events`. A `subscription` (the feed) tells calendar apps to refresh it every 6 hours; a file
    to import once (one event) doesn't."""
    stamp = now or utcnow()
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//DSBA Hub//Calendar//EN",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{ics_text(name)}",
        "X-WR-TIMEZONE:Asia/Bahrain",
    ]
    if subscription:
        lines += ["REFRESH-INTERVAL;VALUE=DURATION:PT6H", "X-PUBLISHED-TTL:PT6H"]
    for e in events:
        lines += _vevent(e, modules.get(e.module_id) if e.module_id else None, stamp, base_url)
    lines.append("END:VCALENDAR")
    return CRLF.join(ics_fold(line) for line in lines) + CRLF
