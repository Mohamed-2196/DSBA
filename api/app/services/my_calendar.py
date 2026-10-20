"""A student's own calendar: events they add for themselves, the programme dates they keep off it, their private
feed, and the reminders for their events.

Times are Bahrain times (core.time.BAHRAIN, UTC+3 all year). A timed event runs from its start time to its end
time, or for an hour. An all-day event "starts" at 09:00 for its reminder. A repeat runs every day, week, two weeks
or month from the event's date until its repeat end, or for REPEAT_DAYS without one, less the days taken off it
(`skipped`). A monthly repeat keeps its day of the month (month_day()), and falls on a month's last day when the
month has no such day: the 31st's is on 30 April and on 28 or 29 February. The web app
(web/src/features/calendar/mine.ts), the feed (RRULE and EXDATE) and the reminders all count the same occurrences."""

from __future__ import annotations

import base64
import datetime as dt
import hashlib
import hmac
import logging
import secrets
import uuid
from calendar import monthrange
from collections.abc import Callable, Collection, Iterator, Mapping, Sequence
from contextlib import AbstractContextManager
from datetime import datetime, timedelta

from sqlalchemy import and_, func, or_, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.access import Feature
from app.core.errors import ApiError, conflict, invalid, not_found
from app.core.text import slugify
from app.core.time import BAHRAIN, utcnow
from app.models import CalendarEvent, CalendarPrefs, Module, PersonalEvent, User
from app.schemas.board import AgendaCard
from app.schemas.calendar import (
    CalendarPrefsOut,
    CalendarPrefsUpdate,
    OccurrenceScope,
    PersonalEventCreate,
    PersonalEventUpdate,
)
from app.services import access, grades, ratelimit
from app.services import calendar as programme
from app.services.content import apply_patch
from app.services.notify import notify

log = logging.getLogger("dsba.calendar")

MAX_EVENTS = 500
CREATE_LIMIT = 60
CREATE_WINDOW = timedelta(hours=1)
REPEAT_DAYS = 365  # a repeat without an end runs for a year
STEP_DAYS = {"daily": 1, "weekly": 7, "fortnightly": 14}  # the days between occurrences; "monthly" counts months
ALL_DAY_AT = dt.time(9, 0)  # when an all-day event's reminder counts from
DEFAULT_LENGTH = timedelta(hours=1)
REMINDER_GRACE = timedelta(minutes=15)  # a reminder still goes out this long after its event started
ZONE = "Asia/Bahrain"  # the TZID a student's own times are written in (personal_vevent)
BAHRAIN_ZONE = [
    "BEGIN:VTIMEZONE",
    f"TZID:{ZONE}",
    "BEGIN:STANDARD",
    "DTSTART:19700101T000000",
    "TZOFFSETFROM:+0300",
    "TZOFFSETTO:+0300",
    "TZNAME:+03",
    "END:STANDARD",
    "END:VTIMEZONE",
]
RRULE_FREQS = {"daily": "FREQ=DAILY", "weekly": "FREQ=WEEKLY", "fortnightly": "FREQ=WEEKLY;INTERVAL=2"}
EVENT_GONE = "This event isn't on your calendar any more."
DAY_GONE = "This event isn't on that day any more. Refresh the calendar and try again."
EDITABLE = (
    "title",
    "date",
    "end_date",
    "start_time",
    "end_time",
    "place",
    "notes",
    "colour",
    "repeat",
    "repeat_until",
    "remind",
)
CLEARABLE = ("end_date", "start_time", "end_time", "place", "notes", "repeat_until", "remind")
# What a change to one day of a repeat can set: that day becomes an event of its own, which doesn't repeat.
ONE_DAY = tuple(f for f in EDITABLE if f not in ("repeat", "repeat_until"))


# ── occurrences ──────────────────────────────────────────────────────────────────────────────


def last_repeat(e: PersonalEvent) -> dt.date:
    """The last day an occurrence can start on."""
    if e.repeat == "none":
        return e.date
    return e.repeat_until or e.date + timedelta(days=REPEAT_DAYS)


def month_day(e: PersonalEvent) -> int:
    """The day of the month a monthly repeat falls on (in a month without it: that month's last day)."""
    return e.month_day or e.date.day


def _short_month_end(day: dt.date, wanted: int) -> bool:
    """Whether `day` is the last day of a month that has no day `wanted`: where a monthly repeat on `wanted` falls."""
    return wanted > day.day == monthrange(day.year, day.month)[1]


def _nth(e: PersonalEvent, n: int) -> dt.date:
    """The day of a repeat's occurrence number `n` (0: its first day), days taken off it included."""
    if e.repeat == "monthly":
        year, month = divmod(e.date.year * 12 + e.date.month - 1 + n, 12)
        return dt.date(year, month + 1, min(month_day(e), monthrange(year, month + 1)[1]))
    return e.date + timedelta(days=STEP_DAYS[e.repeat] * n)


def _first_from(e: PersonalEvent, day: dt.date) -> int:
    """The number of a repeat's first occurrence on or after `day`."""
    if day <= e.date:
        return 0
    if e.repeat == "monthly":
        n = (day.year - e.date.year) * 12 + day.month - e.date.month
        return n if _nth(e, n) >= day else n + 1
    return -(-(day - e.date).days // STEP_DAYS[e.repeat])


def on_repeat(e: PersonalEvent, day: dt.date) -> bool:
    """Whether the repeat of `e` lands on `day`, skipped days included."""
    if e.repeat == "none":
        return day == e.date
    return e.date <= day <= last_repeat(e) and _nth(e, _first_from(e, day)) == day


def occurrence_days(e: PersonalEvent, start: dt.date, end: dt.date) -> Iterator[dt.date]:
    """The days occurrences of `e` start on, from `start` to `end` inclusive (skipped days left out)."""
    skipped = set(e.skipped or ())
    if e.repeat == "none":
        if start <= e.date <= end and e.date not in skipped:
            yield e.date
        return
    last, n = min(last_repeat(e), end), _first_from(e, start)
    while (day := _nth(e, n)) <= last:
        if day not in skipped:
            yield day
        n += 1


def first_day(e: PersonalEvent) -> dt.date | None:
    """The day of the first occurrence of `e`, or None when every day of it was taken off."""
    return next(occurrence_days(e, e.date, last_repeat(e)), None)


def is_occurrence(e: PersonalEvent, day: dt.date) -> bool:
    """Whether an occurrence of `e` starts on `day`."""
    return next(occurrence_days(e, day, day), None) == day


def starts_at(e: PersonalEvent, day: dt.date) -> datetime:
    """When the occurrence on `day` starts, as an aware datetime (09:00 for an all-day event)."""
    return datetime.combine(day, e.start_time or ALL_DAY_AT, tzinfo=BAHRAIN)


def next_day(e: PersonalEvent, today: dt.date) -> dt.date | None:
    """The day of the next occurrence that hasn't ended by `today`, or None when the event is over."""
    span = (e.end_date - e.date).days if e.end_date else 0
    return next(occurrence_days(e, today - timedelta(days=span), last_repeat(e)), None)


# ── events ───────────────────────────────────────────────────────────────────────────────────


def list_events(db: Session, user: User) -> list[PersonalEvent]:
    q = select(PersonalEvent).where(PersonalEvent.user_id == user.id)
    return list(db.scalars(q.order_by(PersonalEvent.date, PersonalEvent.start_time, PersonalEvent.created_at)))


def get_event(db: Session, user: User, event_id: uuid.UUID) -> PersonalEvent:
    """One of `user`'s events; 404 not_found for anyone else's."""
    event = db.get(PersonalEvent, event_id)
    if event is None or event.user_id != user.id:
        raise not_found(EVENT_GONE)
    return event


def _check(e: PersonalEvent) -> None:
    if e.end_date is not None and e.end_date == e.date:
        e.end_date = None
    if e.end_date is not None and e.end_date < e.date:
        raise invalid("endDate", "The last day can't be before the first.")
    if e.start_time is not None and e.end_date is not None:
        raise invalid("endDate", "An event with a time is on one day. Make it all day to span several days.")
    if e.start_time is None:
        e.end_time = None
    if e.end_time is not None and e.start_time is not None and e.end_time <= e.start_time:
        raise invalid("endTime", "The end time has to be after the start time.")
    if e.repeat == "none":
        e.repeat_until = None
        if e.skipped:
            e.skipped = []
    elif e.end_date is not None:
        raise invalid("repeat", "A repeating event is on one day. Clear the last day, or don't repeat it.")
    # a day of the month of its own only while the first day is a shorter month's last day instead
    if e.month_day is not None and (e.repeat != "monthly" or not _short_month_end(e.date, e.month_day)):
        e.month_day = None
    if e.repeat_until is not None and e.repeat_until < e.date:
        raise invalid("repeatUntil", "The repeat can't end before the first day.")
    if e.repeat_until is not None and e.repeat_until > e.date + timedelta(days=REPEAT_DAYS * 2):
        raise invalid("repeatUntil", "A repeat can run for two years at most.")
    # days taken off the repeat stay off only while the repeat still lands on them
    kept = sorted({d for d in e.skipped or () if on_repeat(e, d)})
    if kept != list(e.skipped or ()):
        e.skipped = kept
    if first_day(e) is None:
        raise invalid("repeatUntil", "Every day of this repeat was deleted. Delete the event instead.")


def _room_for_one_more(db: Session, user: User) -> None:
    """429 after CREATE_LIMIT new events in an hour, 409 calendar_full at MAX_EVENTS."""
    ratelimit.enforce(
        db,
        f"personal-events:{user.id}",
        PersonalEvent.created_at,
        [PersonalEvent.user_id == user.id],
        limit=CREATE_LIMIT,
        window=CREATE_WINDOW,
        message="You've added a lot of events. Try again in {}.",
    )
    count = db.scalar(select(func.count()).select_from(PersonalEvent).where(PersonalEvent.user_id == user.id)) or 0
    if count >= MAX_EVENTS:
        raise conflict("calendar_full", f"Your calendar holds {MAX_EVENTS} of your own events. Delete old ones first.")


def create_event(db: Session, user: User, body: PersonalEventCreate) -> PersonalEvent:
    """409 calendar_full at MAX_EVENTS, 429 after CREATE_LIMIT new events in an hour, 422 for dates and times that
    don't fit together."""
    _room_for_one_more(db, user)
    event = PersonalEvent(
        id=uuid.uuid4(),
        user_id=user.id,
        title=body.title,
        date=body.date,
        end_date=body.end_date,
        start_time=body.start_time,
        end_time=body.end_time,
        place=body.place or None,
        notes=body.notes or None,
        colour=body.colour,
        repeat=body.repeat,
        repeat_until=body.repeat_until,
        remind=body.remind,
    )
    _check(event)
    db.add(event)
    db.flush()
    return event


def update_event(db: Session, event: PersonalEvent, body: PersonalEventUpdate) -> None:
    """Fields not sent stay; null clears the optional ones. A new first day gives a monthly repeat that day of the
    month. On a refusal the event is left as it was."""
    changed = apply_patch(event, body, EDITABLE, clearable=CLEARABLE)
    if "date" in changed:
        event.month_day = None
    try:
        _check(event)
    except ApiError:
        db.expire(event)
        raise
    if changed:
        event.updated_at = utcnow()
        if {"date", "start_time", "repeat", "repeat_until", "remind"} & set(changed):
            event.reminded_for = None  # a new time: its reminder is due again


def delete_event(db: Session, event: PersonalEvent) -> None:
    db.delete(event)


def _copy(e: PersonalEvent, **changes: object) -> PersonalEvent:
    """A new event with the fields of `e`, and `changes` on top."""
    fields: dict[str, object] = {f: getattr(e, f) for f in (*EDITABLE, "skipped")}
    fields["skipped"] = list(e.skipped or ())
    return PersonalEvent(id=uuid.uuid4(), user_id=e.user_id, **{**fields, **changes})


def change_occurrence(
    db: Session, user: User, event: PersonalEvent, day: dt.date, scope: OccurrenceScope, body: PersonalEventUpdate
) -> PersonalEvent:
    """A change made from one day of `event`. `one`: that day becomes an event of its own with the change, and the
    repeat skips it. `following`: the repeat ends the day before, and a new one with the change runs from that day to
    where the old one ended (a monthly one on the same day of the month, unless the change moves it). A change from
    the first day with `following`, or to an event that doesn't repeat, is a change to the whole event. 404 not_found
    when no occurrence starts on `day`, 422 for dates and times that don't fit together, 409 calendar_full and 429 as
    for a new event. -> the event that now holds that day."""
    if not is_occurrence(event, day):
        raise not_found(DAY_GONE)
    if event.repeat == "none" or (scope == "following" and day == first_day(event)):
        update_event(db, event, body)
        return event
    _room_for_one_more(db, user)
    if scope == "one":
        new = _copy(event, date=day, repeat="none", repeat_until=None, skipped=[])
        apply_patch(new, body, ONE_DAY, clearable=CLEARABLE)
    else:
        new = _copy(event, date=day, repeat_until=last_repeat(event), skipped=[d for d in event.skipped if d > day])
        apply_patch(new, body, EDITABLE, clearable=CLEARABLE)
        if event.repeat == "monthly" and new.date == day:
            new.month_day = month_day(event)  # kept while `day` is a shorter month's last day (_check)
    _check(new)
    _take_off(db, event, day, scope)
    db.add(new)
    db.flush()
    return new


def _take_off(db: Session, event: PersonalEvent, day: dt.date, scope: OccurrenceScope) -> None:
    """Takes `day` off the repeat of `event` (`one`), or ends the repeat the day before (`following`; `day` is later
    than its first day). An event left without a day is deleted."""
    if scope == "one":
        event.skipped = sorted({*event.skipped, day})
    else:
        event.repeat_until = day - timedelta(days=1)
        event.skipped = [d for d in event.skipped if d < day]
    if first_day(event) is None:
        db.delete(event)
    else:
        event.updated_at = utcnow()


def delete_occurrence(db: Session, event: PersonalEvent, day: dt.date, scope: OccurrenceScope) -> None:
    """Takes `day` off the repeat (`one`), or that day and every later one (`following`). An event left without a
    day is deleted. 404 not_found when no occurrence starts on `day`."""
    if not is_occurrence(event, day):
        raise not_found(DAY_GONE)
    if event.repeat == "none" or (scope == "following" and day == first_day(event)):
        db.delete(event)
    else:
        _take_off(db, event, day, scope)


# ── what a student keeps off their calendar ──────────────────────────────────────────────────


def get_prefs(db: Session, user: User) -> CalendarPrefs | None:
    return db.get(CalendarPrefs, user.id)


def _prefs_for_update(db: Session, user: User) -> CalendarPrefs:
    prefs = db.get(CalendarPrefs, user.id, with_for_update=True)
    if prefs is None:
        prefs = CalendarPrefs(user_id=user.id, hidden_events=[], hidden_modules=[], hidden_types=[], show_plan=False)
        db.add(prefs)
    return prefs


def feed_token(user_id: uuid.UUID, salt: str) -> str:
    """The private feed's secret: an HMAC of the account and its salt under the server's key, so the address can
    be shown again without being stored. 43 URL-safe characters (256 bits)."""
    key = get_settings().secret_key.get_secret_value().encode()
    mac = hmac.new(key, f"calendar-feed:{user_id}:{salt}".encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(mac).decode().rstrip("=")


def _feed_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def feed_path(user_id: uuid.UUID, salt: str) -> str:
    """The private feed's path under the API's origin."""
    return f"/api/v1/feeds/calendar/{feed_token(user_id, salt)}.ics"


def prefs_out(user: User, prefs: CalendarPrefs | None) -> CalendarPrefsOut:
    if prefs is None:
        return CalendarPrefsOut(hidden_events=[], hidden_modules=[], hidden_types=[], show_plan=False, feed_path=None)
    return CalendarPrefsOut.model_validate(
        {
            "hidden_events": list(prefs.hidden_events),
            "hidden_modules": list(prefs.hidden_modules),
            "hidden_types": list(prefs.hidden_types),
            "show_plan": prefs.show_plan,
            "feed_path": feed_path(user.id, prefs.feed_salt) if prefs.feed_salt else None,
        }
    )


def update_prefs(db: Session, user: User, body: CalendarPrefsUpdate) -> CalendarPrefs:
    """Each list sent replaces the kept one (repeats dropped, the order kept)."""
    prefs = _prefs_for_update(db, user)
    if body.hidden_events is not None:
        prefs.hidden_events = list(dict.fromkeys(body.hidden_events))
    if body.hidden_modules is not None:
        prefs.hidden_modules = list(dict.fromkeys(body.hidden_modules))
    if body.hidden_types is not None:
        prefs.hidden_types = list(dict.fromkeys(body.hidden_types))
    if body.show_plan is not None:
        prefs.show_plan = body.show_plan
    prefs.updated_at = utcnow()
    return prefs


def new_feed(db: Session, user: User) -> CalendarPrefs:
    """Turns the private feed on at a new address: the old address, if any, stops working."""
    prefs = _prefs_for_update(db, user)
    prefs.feed_salt = secrets.token_hex(16)
    prefs.feed_hash = _feed_hash(feed_token(user.id, prefs.feed_salt))
    prefs.updated_at = utcnow()
    return prefs


def stop_feed(db: Session, user: User) -> CalendarPrefs:
    prefs = _prefs_for_update(db, user)
    prefs.feed_salt = prefs.feed_hash = None
    prefs.updated_at = utcnow()
    return prefs


# ── the private feed ─────────────────────────────────────────────────────────────────────────


def papers_of(user: User, catalogue: Sequence[Module], choices: Mapping[int, frozenset[str]]) -> set[str] | None:
    """The module ids `user` sits in their year, or None when that is every module of it (their papers: the
    web app's papersFor). `choices`: what each year's choice picks from (grades.choice_ids); a module of the choice
    they didn't pick isn't theirs."""
    year, picks = user.year, set(user.papers or [])
    if year is None or not picks:
        return None
    choice = choices.get(year, frozenset())
    chose = bool(choice & picks)
    others = [m for m in catalogue if m.year != year and m.id in picks]
    if not chose and not others:
        return None
    own = [m for m in catalogue if m.year == year and (not chose or m.id not in choice or m.id in picks)]
    return {m.id for m in [*own, *others]}


def counts_for(e: CalendarEvent, year: int | None, papers: Collection[str] | None, prefs: CalendarPrefs | None) -> bool:
    """Whether a programme date is on a student's own calendar: their year's and their papers' (the web app's
    isMine), less what they hid."""
    if prefs is not None and (
        e.id in prefs.hidden_events
        or e.type in prefs.hidden_types
        or (e.module_id is not None and e.module_id in prefs.hidden_modules)
    ):
        return False
    if papers is not None and e.module_id:
        return e.module_id in papers
    return year is None or e.year is None or e.year == year


def _owner_of_feed(db: Session, token: str) -> tuple[User, CalendarPrefs]:
    """The account whose private feed `token` opens, while the calendar is on for it; else 404 not_found (an old,
    wrong or switched-off address all look the same)."""
    gone = not_found("This calendar link doesn't work any more. Copy your new one from the Hub's calendar.")
    if len(token) != 43:
        raise gone
    prefs = db.scalar(select(CalendarPrefs).where(CalendarPrefs.feed_hash == _feed_hash(token)))
    if prefs is None or prefs.feed_salt is None:
        raise gone
    if not hmac.compare_digest(feed_token(prefs.user_id, prefs.feed_salt), token):
        raise gone
    user = db.get(User, prefs.user_id)
    if user is None or not access.feature_on(db, user, Feature.calendar):
        raise gone
    return user, prefs


def _alarm(e: PersonalEvent) -> list[str]:
    if e.remind is None:
        return []
    # relative to DTSTART: an all-day event starts at midnight, its reminder counts from 09:00
    minutes = -e.remind if e.start_time else ALL_DAY_AT.hour * 60 - e.remind
    trigger = f"{'-' if minutes < 0 else ''}PT{abs(minutes)}M"
    return [
        "BEGIN:VALARM",
        "ACTION:DISPLAY",
        f"DESCRIPTION:{programme.ics_text(e.title)}",
        f"TRIGGER:{trigger}",
        "END:VALARM",
    ]


def _utc(day: dt.date, at: dt.time) -> str:
    return programme.utc_stamp(datetime.combine(day, at, tzinfo=BAHRAIN))


def _local(day: dt.date, at: dt.time) -> str:
    """A time in Bahrain as a TZID property writes it: '20261005T180000'."""
    return f"{day:%Y%m%d}T{at:%H%M%S}"


def rrule(e: PersonalEvent) -> str:
    """A repeat's RRULE, without its end. A monthly repeat on the 29th to the 31st falls on the last of the days from
    the 28th to its own that a month has (BYSETPOS=-1): the 31st's on 30 April and on 28 or 29 February, as in the
    Hub, where a rule on the 31st alone would skip those months."""
    if e.repeat != "monthly":
        return RRULE_FREQS[e.repeat]
    wanted = month_day(e)
    if wanted <= 28:
        return "FREQ=MONTHLY"
    return f"FREQ=MONTHLY;BYMONTHDAY={','.join(str(d) for d in range(28, wanted + 1))};BYSETPOS=-1"


def personal_vevent(e: PersonalEvent, now: datetime, base_url: str) -> list[str]:
    """A student's event as a VEVENT. Its times are written in Bahrain time (TZID, BAHRAIN_ZONE goes with it):
    calendar apps count a repeat's days in its start's zone, and 01:00 in Bahrain is the day before in UTC."""
    lines = ["BEGIN:VEVENT", f"UID:{e.id}@dsba-hub-personal", f"DTSTAMP:{programme.utc_stamp(now)}"]
    if e.start_time is None:
        last = e.end_date or e.date
        lines += [
            f"DTSTART;VALUE=DATE:{programme.date_value(e.date)}",
            f"DTEND;VALUE=DATE:{programme.date_value(last + timedelta(days=1))}",
        ]
    else:
        start = datetime.combine(e.date, e.start_time, tzinfo=BAHRAIN)
        end = datetime.combine(e.date, e.end_time, tzinfo=BAHRAIN) if e.end_time else start + DEFAULT_LENGTH
        lines += [
            f"DTSTART;TZID={ZONE}:{_local(start.date(), start.time())}",
            f"DTEND;TZID={ZONE}:{_local(end.date(), end.time())}",
        ]
    if e.repeat != "none":
        until = last_repeat(e)
        # UNTIL is a date for an all-day event, and the last start in UTC for a timed one (RFC 5545, with a TZID)
        stamp = programme.date_value(until) if e.start_time is None else _utc(until, e.start_time)
        lines.append(f"RRULE:{rrule(e)};UNTIL={stamp}")
        if e.skipped:  # EXDATE takes DTSTART's type
            if e.start_time is None:
                lines.append(f"EXDATE;VALUE=DATE:{','.join(programme.date_value(d) for d in e.skipped)}")
            else:
                lines.append(f"EXDATE;TZID={ZONE}:{','.join(_local(d, e.start_time) for d in e.skipped)}")
    lines.append(f"SUMMARY:{programme.ics_text(e.title)}")
    if e.notes:
        lines.append(f"DESCRIPTION:{programme.ics_text(e.notes)}")
    if e.place:
        lines.append(f"LOCATION:{programme.ics_text(e.place)}")
    lines += [
        "CLASS:PRIVATE",
        f"TRANSP:{'TRANSPARENT' if e.start_time is None else 'OPAQUE'}",
        f"URL:{base_url.rstrip('/')}/calendar?event=mine-{e.id}",
        f"LAST-MODIFIED:{programme.utc_stamp(e.updated_at)}",
        *_alarm(e),
        "END:VEVENT",
    ]
    return lines


def plan_vevent(card: AgendaCard, now: datetime, base_url: str) -> list[str]:
    """A card of the student's plan as a VEVENT: all day, or for an hour from its time."""
    lines = ["BEGIN:VEVENT", f"UID:{card.id}@dsba-hub-plan", f"DTSTAMP:{programme.utc_stamp(now)}"]
    if card.due_time is None:
        lines += [
            f"DTSTART;VALUE=DATE:{programme.date_value(card.due)}",
            f"DTEND;VALUE=DATE:{programme.date_value(card.due + timedelta(days=1))}",
        ]
    else:
        start = datetime.combine(card.due, card.due_time, tzinfo=BAHRAIN)
        end = start + DEFAULT_LENGTH
        lines += [
            f"DTSTART;TZID={ZONE}:{_local(start.date(), start.time())}",
            f"DTEND;TZID={ZONE}:{_local(end.date(), end.time())}",
        ]
    return [
        *lines,
        f"SUMMARY:{programme.ics_text(card.title)}",
        f"DESCRIPTION:{programme.ics_text(f'On your board {card.board_name}.')}",
        "CLASS:PRIVATE",
        "TRANSP:TRANSPARENT",
        f"URL:{base_url.rstrip('/')}/board?board={card.board_id}&card={card.id}",
        "END:VEVENT",
    ]


def plan_of(db: Session, user: User) -> list[AgendaCard]:
    """The student's plan on their calendar (board cards with a day of their own), while boards are on for them."""
    from app.services.board import cards  # board -> common -> my_calendar

    return cards.calendar_plan(db, user) if access.feature_on(db, user, Feature.board) else []


def private_feed(db: Session, token: str) -> str:
    """The private feed: the student's programme dates (their year and papers, less what they hid), their own
    events, and their plan when they show it on their calendar. 404 not_found for an address that doesn't work."""
    user, prefs = _owner_of_feed(db, token)
    catalogue = db.scalars(select(Module)).all()
    papers = papers_of(user, catalogue, grades.choice_ids(db))
    modules = {m.id: m for m in catalogue}
    dates = [e for e in db.scalars(programme.events_query()) if counts_for(e, user.year, papers, prefs)]
    now, base = utcnow(), get_settings().web_base_url
    vevents = [programme.vevent(e, modules.get(e.module_id) if e.module_id else None, now, base) for e in dates]
    vevents += [personal_vevent(e, now, base) for e in list_events(db, user)]
    if prefs.show_plan:
        vevents += [plan_vevent(card, now, base) for card in plan_of(db, user)]
    return programme.ics_document([BAHRAIN_ZONE, *vevents], name="DSBA Hub: my calendar")


def event_ics(e: PersonalEvent) -> str:
    """One of a student's events as a file to import once."""
    vevent = personal_vevent(e, utcnow(), get_settings().web_base_url)
    return programme.ics_document([BAHRAIN_ZONE, vevent], name=e.title, subscription=False)


def ics_file_name(e: PersonalEvent) -> str:
    """'study-group.ics': the file name an event downloads as."""
    return f"{slugify(e.title, 60) or 'my-event'}.ics"


def occurrence_url(e: PersonalEvent, day: dt.date) -> str:
    """The calendar page open on the occurrence of `e` on `day` (the web app's occurrence ids)."""
    return f"/calendar?event=mine-{e.id}" if e.repeat == "none" else f"/calendar?event=mine-{e.id}-{day.isoformat()}"


# ── reminders ────────────────────────────────────────────────────────────────────────────────


def _reminder_body(e: PersonalEvent, day: dt.date, today: dt.date) -> str:
    when = (
        "Today" if day == today else "Tomorrow" if day == today + timedelta(days=1) else f"{day:%A} {day.day} {day:%B}"
    )
    at = f" at {e.start_time:%H:%M}" if e.start_time else ", all day"
    return f"{when}{at}{f', {e.place}' if e.place else ''}."


def send_reminders(db: Session, now: datetime | None = None) -> int:
    """A notification for each occurrence whose reminder is due (from `remind` minutes before its start until
    REMINDER_GRACE after it), once per occurrence, for those the calendar is on for. The caller commits. -> how
    many."""
    now = now or utcnow()
    today = now.astimezone(BAHRAIN).date()
    soon, recent = today + timedelta(days=2), today - timedelta(days=1)
    q = select(PersonalEvent).where(
        PersonalEvent.remind.is_not(None),
        PersonalEvent.date <= soon,
        or_(
            PersonalEvent.date >= recent,
            and_(
                PersonalEvent.repeat != "none",
                or_(PersonalEvent.repeat_until.is_(None), PersonalEvent.repeat_until >= recent),
            ),
        ),
    )
    sent = 0
    readers: dict[uuid.UUID, bool] = {}
    for e in db.scalars(q.with_for_update(skip_locked=True)):
        remind = timedelta(minutes=e.remind or 0)
        for day in occurrence_days(e, recent, soon):
            start = starts_at(e, day)
            if not (start - remind <= now < start + REMINDER_GRACE):
                continue
            if e.reminded_for is not None and e.reminded_for >= start:
                continue
            e.reminded_for = start
            if e.user_id not in readers:
                user = db.get(User, e.user_id)
                readers[e.user_id] = user is not None and access.feature_on(db, user, Feature.calendar)
            if readers[e.user_id]:
                url = occurrence_url(e, day)
                notify(db, e.user_id, "event_reminder", e.title, body=_reminder_body(e, day, today), url=url)
                sent += 1
    return sent


def send_due(sessions: Callable[[], AbstractContextManager[Session]], now: datetime | None = None) -> int:
    """The mail worker's step for reminders. -> how many went out."""
    with sessions() as db:
        sent = send_reminders(db, now)
        db.commit()
    if sent:
        log.info("sent %d calendar reminder(s)", sent)
    return sent
