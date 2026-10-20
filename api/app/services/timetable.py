"""The exam timetable in one paste (reps): the rows read from the pasted text (timetable_parse.py) are matched to
modules by unit code and to the exam the calendar has for that module near the row's date. The preview says what each
row will do; saving does it all in one transaction, and each year whose exams changed hears about them in one notice.

A row matches the module's exam nearest its date within MATCH_DAYS; without one it is a new exam. Unit codes are
compared without spaces or case ('st 2134' is ST2134)."""

from __future__ import annotations

import datetime as dt
import re
from collections import Counter
from collections.abc import Iterable, Sequence
from datetime import timedelta
from typing import NamedTuple

from sqlalchemy import and_, or_, select
from sqlalchemy.orm import Session

from app.core.access import Feature
from app.core.errors import ApiError
from app.core.time import BAHRAIN, bahrain_today
from app.models import AuditEntry, BoardCard, CalendarEvent, Module, Notification, User
from app.schemas.calendar import (
    CalendarEventCreate,
    CalendarEventUpdate,
    TimetableAction,
    TimetableNotice,
    TimetablePreview,
    TimetablePreviewIn,
    TimetableRow,
    TimetableRowIn,
    TimetableSave,
    TimetableSaved,
    TimetableWas,
)
from app.services import access, ratelimit
from app.services import calendar as programme
from app.services.content import record
from app.services.notify import notify_all
from app.services.timetable_parse import MAX_LINE, parse_timetable

MATCH_DAYS = 60
SAVES_PER_HOUR = 10
ACTION = "calendar.timetable"
UNIT_CODE = re.compile(r"^[A-Z]{2}\d{4}$")
# A notice lists this many exams, then says how many more.
NOTICE_LISTS = 8


def normal_code(code: str | None) -> str | None:
    if code is None:
        return None
    code = re.sub(r"[\s-]", "", code).upper()
    return code or None


class Catalogue(NamedTuple):
    """The modules with a unit code, by code, and their exams."""

    modules: dict[str, Module]
    exams: dict[str, list[CalendarEvent]]  # by module id, oldest first


def catalogue(db: Session) -> Catalogue:
    with_codes = db.scalars(select(Module).where(Module.unit_code.is_not(None)))
    modules = {code: m for m in with_codes if (code := normal_code(m.unit_code))}
    exams: dict[str, list[CalendarEvent]] = {}
    ids = [m.id for m in modules.values()]
    q = select(CalendarEvent).where(CalendarEvent.type == "exam", CalendarEvent.module_id.in_(ids))
    for e in db.scalars(q.order_by(CalendarEvent.date, CalendarEvent.id)):
        if e.module_id is not None:
            exams.setdefault(e.module_id, []).append(e)
    return Catalogue(modules, exams)


def nearest_exam(exams: Sequence[CalendarEvent], day: dt.date) -> CalendarEvent | None:
    """The exam nearest `day` within MATCH_DAYS either side (the earlier on a tie), or None."""
    near = [e for e in exams if abs((e.date - day).days) <= MATCH_DAYS]
    return min(near, key=lambda e: (abs((e.date - day).days), e.date), default=None)


def _was(exam: CalendarEvent | None) -> TimetableWas | None:
    if exam is None:
        return None
    return TimetableWas(date=exam.date, time=exam.time, place=exam.place, sample=exam.sample)


def _action(row: TimetableRowIn, exam: CalendarEvent | None) -> TimetableAction:
    if exam is None:
        return "new"
    same = (
        row.date == exam.date
        and (row.time is None or row.time == exam.time)
        and (row.place is None or row.place == exam.place)
        and not exam.sample
    )
    return "same" if same else "update"


def check_rows(
    db: Session, rows: Sequence[TimetableRowIn], lines: Sequence[tuple[int, str]] | None = None
) -> list[TimetableRow]:
    """Each row matched to its module and exam, with what saving it will do and anything to fix first. `lines`: the
    pasted line and its text for each row, when it came from text."""
    cat = catalogue(db)
    codes = Counter(c for r in rows if (c := normal_code(r.unit_code)))
    out: list[TimetableRow] = []
    for i, row in enumerate(rows):
        line, text = lines[i] if lines is not None else (None, None)
        problems: list[str] = []
        code = normal_code(row.unit_code)
        module = cat.modules.get(code) if code else None
        if code is None:
            problems.append("No module code. Add it.")
        elif not UNIT_CODE.match(code):
            problems.append(f"{row.unit_code} isn't a module code. Codes look like ST2134.")
        elif module is None:
            problems.append(f"No module has the code {code}. Check it, or add the code to the module in Manage.")
        if code and codes[code] > 1:
            problems.append(f"{code} is in the timetable more than once. Keep one row.")
        if row.date is None:
            problems.append("No date. Add it.")
        exam = nearest_exam(cat.exams.get(module.id, []), row.date) if module and row.date else None
        fixed = TimetableRowIn(unit_code=code, date=row.date, time=row.time, place=row.place)
        out.append(
            TimetableRow(
                line=line,
                text=text,
                unit_code=code,
                date=row.date,
                time=row.time,
                place=row.place,
                module_id=module.id if module else None,
                module_name=module.name if module else None,
                year=module.year if module else None,
                event_id=exam.id if exam else None,
                action="fix" if problems else _action(fixed, exam),
                was=_was(exam),
                problems=problems,
            )
        )
    return out


def preview(db: Session, body: TimetablePreviewIn) -> TimetablePreview:
    """What saving the timetable would do, row by row. 422 when neither or both of `text` and `rows` are sent, or
    when the text holds no row at all."""
    if (body.text is None) == (body.rows is None):
        raise ApiError(422, "invalid_input", "Paste the timetable, or send its rows.", fields={"text": "Paste it."})
    if body.rows is not None:
        return TimetablePreview(rows=check_rows(db, body.rows))
    if any(len(line) > MAX_LINE for line in (body.text or "").splitlines()):
        message = f"A line is longer than {MAX_LINE} characters. Paste one exam a line."
        raise ApiError(422, "invalid_input", message, fields={"text": message})
    cat = catalogue(db)
    titles = {code: m.name for code, m in cat.modules.items()}
    parsed = parse_timetable(body.text or "", bahrain_today(), titles)
    if not parsed:
        message = "No exams found. Paste rows with a module code and a date, such as “ST2134 13/10/2026 10:00 Hall A”."
        raise ApiError(422, "invalid_input", message, fields={"text": message})
    rows = [TimetableRowIn(unit_code=p.unit_code, date=p.date, time=p.time, place=p.place) for p in parsed]
    return TimetablePreview(rows=check_rows(db, rows, [(p.line, p.text) for p in parsed]))


# ── saving ───────────────────────────────────────────────────────────────────────────────────


def _limit(db: Session, user: User) -> None:
    ratelimit.enforce(
        db,
        f"calendar-timetable:{user.id}",
        AuditEntry.created_at,
        [AuditEntry.actor_id == user.id, AuditEntry.action == ACTION],
        limit=SAVES_PER_HOUR,
        window=timedelta(hours=1),
        message="That's a lot of timetables in an hour. Try again in {}.",
    )


def save(db: Session, user: User, body: TimetableSave, ip: str | None) -> TimetableSaved:
    """Every row at once: an exam's new date, time and place (a row without a time or place keeps the exam's), or a
    new exam; each marked confirmed, with the source and today as the day it was checked. 422 with the rows to fix
    (fields 'rows.<n>'), and nothing saved, when any row has a problem. 429 after ten saves in an hour."""
    _limit(db, user)
    rows = check_rows(db, body.rows)
    bad = {f"rows.{i}": r.problems[0] for i, r in enumerate(rows) if r.problems}
    if bad:
        count = f"{len(bad)} row{'s' if len(bad) != 1 else ''}"
        raise ApiError(422, "invalid_input", f"Fix {count} first. Nothing was saved.", fields=bad)
    today = bahrain_today()
    changed: list[CalendarEvent] = []
    created = updated = 0
    for row in rows:
        if row.action == "same" or row.date is None or row.module_id is None:
            continue
        if row.event_id is None:
            event = programme.create_event(
                db,
                user,
                CalendarEventCreate(
                    date=row.date,
                    time=row.time,
                    place=row.place,
                    title=f"{row.module_name} exam",
                    type="exam",
                    module_id=row.module_id,
                    source=body.source,
                    checked_on=today,
                ),
                ip,
            )
            created += 1
        else:
            event = programme.get_event(db, row.event_id)
            fields = {"date": row.date, "source": body.source, "checked_on": today, "sample": False}
            fields |= {k: v for k, v in (("time", row.time), ("place", row.place)) if v is not None}
            programme.update_event(db, user, event, CalendarEventUpdate.model_validate(fields), ip)
            updated += 1
        changed.append(event)
    db.flush()
    notices = tell_years(db, user, changed) if body.notify else []
    record(
        db,
        user,
        ACTION,
        "calendar_event",
        None,
        "Exam timetable",
        ip,
        source=body.source,
        created=created,
        updated=updated,
        events=[e.id for e in changed],
        told=sum(n.told for n in notices),
    )
    return TimetableSaved(created=created, updated=updated, unchanged=len(rows) - created - updated, notices=notices)


# ── one notice a year ────────────────────────────────────────────────────────────────────────


def notice_body(events: Sequence[CalendarEvent]) -> str:
    """'ST2134 exam: Tuesday 13 October, 10:00 AM, Hall A. EC1002 …' and how many more."""
    lines = [
        f"{programme.summary(e)}: {programme.when(e.date, e.end_date, e.time, e.place)}." for e in events[:NOTICE_LISTS]
    ]
    more = len(events) - NOTICE_LISTS
    if more > 0:
        lines.append(f"And {more} more on the calendar.")
    return " ".join(lines)


def _by_year(events: Iterable[CalendarEvent]) -> dict[int | None, list[CalendarEvent]]:
    out: dict[int | None, list[CalendarEvent]] = {}
    for e in sorted(events, key=lambda e: (e.date, e.time or "", e.id)):
        out.setdefault(e.year, []).append(e)
    return out


def tell_years(db: Session, user: User, events: Sequence[CalendarEvent]) -> list[TimetableNotice]:
    """One notice for each year whose exams changed, listing them: to its students, and to anyone with one of those
    exams on their board, among those the calendar is on for. At most one a year a day (Bahrain): a second save that
    day tells nobody ("limit")."""
    groups = _by_year(events)
    readers = access.audience(db, Feature.calendar)
    if readers is None:
        return [TimetableNotice(year=y, exams=len(evs), notice="none", told=0) for y, evs in groups.items()]
    midnight = dt.datetime.combine(bahrain_today(), dt.time(), tzinfo=BAHRAIN)
    out = []
    for year, evs in sorted(groups.items(), key=lambda g: g[0] or 0):
        key = str(year) if year is not None else "all"
        ratelimit.lock(db, f"calendar:timetable:{key}")
        told_today = select(Notification.id).where(
            Notification.kind == "date_changed",
            Notification.data.contains({"timetable": key}),
            Notification.created_at >= midnight,
        )
        if db.scalar(told_today.limit(1)) is not None:
            out.append(TimetableNotice(year=year, exams=len(evs), notice="limit", told=0))
            continue
        cohort = User.year == year if year is not None else User.year.is_not(None)
        on_board = select(BoardCard.user_id).where(
            BoardCard.link_type == "event", BoardCard.link_id.in_([e.id for e in evs])
        )
        n = len(evs)
        title = f"Exam timetable for {programme.cohort_label(year)}: {n} exam{'s' if n != 1 else ''}"
        told = notify_all(
            db,
            "date_changed",
            title,
            body=notice_body(evs),
            url="/calendar?types=exam",
            actor=user,
            data={"timetable": key},
            only=and_(readers, or_(cohort, User.id.in_(on_board))),
        )
        out.append(TimetableNotice(year=year, exams=n, notice="sent", told=told))
    return out
