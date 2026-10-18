"""Repeats every two weeks and every month on a student's own calendar: the days they land on across month ends, leap
years and their end; one day of them changed or deleted; the private feed's rules, which an RFC 5545 implementation
(python-dateutil) expands to the Hub's very days; and the reminders."""

from __future__ import annotations

import datetime as dt
import uuid
from collections.abc import Callable
from typing import Any

import pytest
from dateutil.rrule import rrulestr  # type: ignore[import-untyped]  # python-dateutil comes with botocore
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import BAHRAIN
from app.models import Notification, PersonalEvent, User
from app.services import my_calendar as svc
from tests.content.conftest import API

Clients = Callable[..., TestClient]
MakeUser = Callable[..., User]
MINE = f"{API}/calendar/mine/events"
D = dt.date
NOW = dt.datetime(2026, 10, 18, tzinfo=dt.UTC)


def event(**fields: Any) -> PersonalEvent:
    """A monthly repeat from Sunday 31 January 2027, with `fields` on top (not saved)."""
    base = {"title": "Rent", "date": D(2027, 1, 31), "repeat": "monthly", "skipped": [], "updated_at": NOW}
    return PersonalEvent(id=uuid.uuid4(), **{**base, **fields})


def days(e: PersonalEvent, start: dt.date | None = None, end: dt.date | None = None) -> list[dt.date]:
    return list(svc.occurrence_days(e, start or e.date, end or svc.last_repeat(e)))


def expanded(vevent: list[str]) -> list[dt.date]:
    """The days a calendar app puts an event on: its DTSTART, RRULE and EXDATE expanded by python-dateutil, each
    start's day in its own zone (Bahrain)."""
    rule = "\n".join(line for line in vevent if line.startswith(("DTSTART", "RRULE", "EXDATE")))
    return [start.date() for start in rrulestr(rule, forceset=True)]


# ── the days ─────────────────────────────────────────────────────────────────────────────────


def test_every_two_weeks_on_the_same_weekday() -> None:
    lab = event(title="Lab", date=D(2026, 12, 17), repeat="fortnightly", repeat_until=D(2027, 2, 11))  # Thursdays
    assert days(lab) == [D(2026, 12, 17), D(2026, 12, 31), D(2027, 1, 14), D(2027, 1, 28), D(2027, 2, 11)]
    assert days(lab, D(2027, 1, 1), D(2027, 1, 31)) == [D(2027, 1, 14), D(2027, 1, 28)]
    assert svc.on_repeat(lab, D(2027, 1, 14))
    assert not svc.on_repeat(lab, D(2027, 1, 7))  # the week between
    assert svc.next_day(lab, D(2027, 1, 15)) == D(2027, 1, 28)
    assert svc.next_day(lab, D(2027, 2, 12)) is None  # over
    year = days(event(date=D(2026, 10, 18), repeat="fortnightly"))  # without an end: a year
    assert (len(year), year[-1]) == (27, D(2027, 10, 17))


def test_every_month_on_the_31st_falls_on_a_shorter_months_last_day() -> None:
    rent = event(repeat_until=D(2027, 7, 31))
    assert days(rent) == [
        D(2027, 1, 31),
        D(2027, 2, 28),
        D(2027, 3, 31),
        D(2027, 4, 30),
        D(2027, 5, 31),
        D(2027, 6, 30),
        D(2027, 7, 31),
    ]
    assert svc.month_day(rent) == 31
    assert svc.on_repeat(rent, D(2027, 2, 28))
    assert not svc.on_repeat(rent, D(2027, 3, 30))  # March has its 31st
    assert days(rent, D(2027, 4, 1), D(2027, 5, 30)) == [D(2027, 4, 30)]
    leap = event(date=D(2028, 1, 31), repeat_until=D(2028, 3, 31))
    assert days(leap) == [D(2028, 1, 31), D(2028, 2, 29), D(2028, 3, 31)]


@pytest.mark.parametrize("day", [29, 30])
def test_the_29th_and_the_30th_move_only_in_february(day: int) -> None:
    fees = days(event(date=D(2027, 1, day), repeat_until=D(2028, 4, day)))
    assert [d for d in fees if d.month == 2] == [D(2027, 2, 28), D(2028, 2, 29)]  # 2028 is a leap year
    assert all(d.day == day for d in fees if d.month != 2)
    assert len(fees) == 16


def test_a_monthly_repeat_ends_on_its_last_day_or_runs_for_a_year() -> None:
    assert days(event(date=D(2027, 1, 15), repeat_until=D(2027, 4, 14)))[-1] == D(2027, 3, 15)  # ends in between
    assert days(event(repeat_until=D(2027, 4, 30)))[-1] == D(2027, 4, 30)  # ends on the day it falls on
    year = event()
    assert svc.last_repeat(year) == D(2028, 1, 31)
    assert len(days(year)) == 13
    assert svc.next_day(event(repeat_until=D(2027, 12, 31)), D(2027, 9, 1)) == D(2027, 9, 30)
    assert svc.next_day(event(repeat_until=D(2027, 12, 31)), D(2028, 1, 1)) is None


def test_a_repeat_from_a_shorter_months_last_day_can_keep_the_31st() -> None:
    later = event(date=D(2027, 2, 28), month_day=31, repeat_until=D(2027, 6, 30))
    assert days(later) == [D(2027, 2, 28), D(2027, 3, 31), D(2027, 4, 30), D(2027, 5, 31), D(2027, 6, 30)]
    assert days(event(date=D(2027, 2, 28), repeat_until=D(2027, 4, 30))) == [
        D(2027, 2, 28),
        D(2027, 3, 28),
        D(2027, 4, 28),
    ]


@pytest.mark.parametrize("start_time", [None, dt.time(1, 30), dt.time(18, 0)])
@pytest.mark.parametrize("repeat", ["daily", "weekly", "fortnightly", "monthly"])
def test_calendar_apps_expand_the_feed_to_the_hubs_days(repeat: str, start_time: dt.time | None) -> None:
    """Every first day from 1 December 2026 to 31 March 2028 (a leap February in between), all day, early in the
    morning (the day before in UTC) and in the evening, with its end and a day taken off: the feed's rule gives the
    same days as the Hub."""
    first = D(2026, 12, 1)
    for n in range(0, 487, 1 if repeat == "monthly" else 5):
        start = first + dt.timedelta(days=n)
        e = event(date=start, repeat=repeat, start_time=start_time, repeat_until=start + dt.timedelta(days=500))
        hub = days(e)
        e.skipped = [hub[len(hub) // 2]]
        assert expanded(svc.personal_vevent(e, NOW, "https://hub.example.com")) == days(e), (repeat, start)
    split = event(date=D(2027, 2, 28), month_day=30, start_time=start_time, repeat_until=D(2028, 3, 30))
    assert expanded(svc.personal_vevent(split, NOW, "https://hub.example.com")) == days(split)


def test_the_rules_the_feed_writes() -> None:
    assert svc.rrule(event(repeat="fortnightly")) == "FREQ=WEEKLY;INTERVAL=2"
    assert svc.rrule(event(date=D(2027, 1, 28))) == "FREQ=MONTHLY"
    assert svc.rrule(event(date=D(2027, 1, 29))) == "FREQ=MONTHLY;BYMONTHDAY=28,29;BYSETPOS=-1"
    assert svc.rrule(event()) == "FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1"
    assert svc.rrule(event(date=D(2027, 2, 28), month_day=30)) == "FREQ=MONTHLY;BYMONTHDAY=28,29,30;BYSETPOS=-1"


# ── through the API ──────────────────────────────────────────────────────────────────────────


def add(c: TestClient, **fields: Any) -> dict[str, Any]:
    r = c.post(MINE, json={"title": "Rent", "date": "2027-01-31", "repeat": "monthly", **fields})
    assert r.status_code == 201, r.text
    data: dict[str, Any] = r.json()
    return data


def get(c: TestClient, event_id: str) -> dict[str, Any]:
    found: dict[str, Any] = next(e for e in c.get(MINE).json() if e["id"] == event_id)
    return found


def test_add_and_edit_a_repeat_every_two_weeks_or_every_month(client_for: Clients, make_user: MakeUser) -> None:
    c = client_for(make_user())
    lab = add(c, title="Lab", date="2026-10-18", repeat="fortnightly", startTime="10:00")
    rent = add(c, repeatUntil="2027-12-31")
    assert (lab["repeat"], lab["repeatUntil"], lab["monthDay"]) == ("fortnightly", None, None)
    assert (rent["repeat"], rent["repeatUntil"], rent["monthDay"]) == ("monthly", "2027-12-31", None)
    r = c.patch(f"{MINE}/{lab['id']}", json={"repeat": "monthly"})
    assert (r.status_code, r.json()["repeat"]) == (200, "monthly")
    r = c.patch(f"{MINE}/{rent['id']}", json={"repeatUntil": "2030-01-01"})
    assert (r.status_code, list(r.json()["error"]["fields"])) == (422, ["repeatUntil"])  # two years at most


def test_one_day_of_a_monthly_repeat_on_a_shorter_months_last_day(client_for: Clients, make_user: MakeUser) -> None:
    c = client_for(make_user())
    rent = add(c, startTime="09:00", repeatUntil="2027-12-31")
    on = f"{MINE}/{rent['id']}/occurrences"
    for day in ("2027-02-27", "2027-03-30", "2028-01-31"):  # not on it (it falls on 28 February); after its end
        r = c.delete(f"{on}/{day}")
        assert (r.status_code, r.json()["error"]["code"]) == (404, "not_found")
    assert c.delete(f"{on}/2027-04-30").status_code == 204
    r = c.patch(f"{on}/2027-02-28", json={"title": "Rent, paid late", "startTime": "12:00"})
    assert r.status_code == 200, r.text
    alone = r.json()
    assert (alone["date"], alone["repeat"], alone["monthDay"], alone["startTime"]) == (
        "2027-02-28",
        "none",
        None,
        "12:00:00",
    )
    assert get(c, rent["id"])["skipped"] == ["2027-02-28", "2027-04-30"]
    assert c.delete(f"{on}/2027-06-30?scope=following").status_code == 204
    left = get(c, rent["id"])
    assert (left["repeatUntil"], left["skipped"]) == ("2027-06-29", ["2027-02-28", "2027-04-30"])


def test_a_change_from_a_shorter_months_last_day_on_keeps_the_day_of_the_month(
    client_for: Clients, make_user: MakeUser, db: Session
) -> None:
    c = client_for(make_user())
    rent = add(c, startTime="09:00", repeatUntil="2027-12-31")
    c.delete(f"{MINE}/{rent['id']}/occurrences/2027-05-31")
    # the form sends the day it was opened on as the first day
    r = c.patch(
        f"{MINE}/{rent['id']}/occurrences/2027-02-28?scope=following", json={"date": "2027-02-28", "startTime": "10:00"}
    )
    assert r.status_code == 200, r.text
    later = r.json()
    assert (later["date"], later["monthDay"], later["startTime"], later["repeatUntil"], later["skipped"]) == (
        "2027-02-28",
        31,
        "10:00:00",
        "2027-12-31",
        ["2027-05-31"],
    )
    row = db.get(PersonalEvent, uuid.UUID(later["id"]))
    assert row is not None
    assert days(row)[:5] == [D(2027, 2, 28), D(2027, 3, 31), D(2027, 4, 30), D(2027, 6, 30), D(2027, 7, 31)]
    assert get(c, rent["id"])["repeatUntil"] == "2027-02-27"

    # the whole repeat edited: its day of the month stays while its first day does
    r = c.patch(f"{MINE}/{later['id']}", json={"title": "Rent due", "date": "2027-02-28"})
    assert (r.json()["title"], r.json()["monthDay"]) == ("Rent due", 31)
    # moved from one of its days on: the new first day's day of the month
    r = c.patch(f"{MINE}/{later['id']}/occurrences/2027-04-30?scope=following", json={"date": "2027-05-05"})
    assert (r.status_code, r.json()["date"], r.json()["monthDay"]) == (200, "2027-05-05", None)
    assert get(c, later["id"])["repeatUntil"] == "2027-04-29"
    # a new first day, or another repeat, drops it
    assert c.patch(f"{MINE}/{later['id']}", json={"repeat": "weekly"}).json()["monthDay"] is None
    r = c.patch(f"{MINE}/{later['id']}", json={"repeat": "monthly"})
    assert (r.json()["monthDay"], r.json()["date"]) == (None, "2027-02-28")  # now the 28th


def test_one_day_of_a_repeat_every_two_weeks(client_for: Clients, make_user: MakeUser) -> None:
    c = client_for(make_user())
    lab = add(c, title="Lab", date="2026-10-18", repeat="fortnightly", startTime="10:00", repeatUntil="2026-12-31")
    on = f"{MINE}/{lab['id']}/occurrences"
    assert c.delete(f"{on}/2026-10-25").status_code == 404  # the week between
    assert c.delete(f"{on}/2026-11-01").status_code == 204
    r = c.patch(f"{on}/2026-11-15?scope=following", json={"startTime": "11:00"})
    assert r.status_code == 200, r.text
    later = r.json()
    assert (later["date"], later["repeat"], later["repeatUntil"], later["startTime"]) == (
        "2026-11-15",
        "fortnightly",
        "2026-12-31",
        "11:00:00",
    )
    earlier = get(c, lab["id"])
    assert (earlier["repeatUntil"], earlier["skipped"], earlier["startTime"]) == (
        "2026-11-14",
        ["2026-11-01"],
        "10:00:00",
    )


def test_a_new_repeat_keeps_only_the_days_off_still_on_it(client_for: Clients, make_user: MakeUser) -> None:
    c = client_for(make_user())
    rent = add(c, repeatUntil="2027-12-31")
    c.delete(f"{MINE}/{rent['id']}/occurrences/2027-02-28")  # four weeks after 31 January
    c.delete(f"{MINE}/{rent['id']}/occurrences/2027-03-31")
    r = c.patch(f"{MINE}/{rent['id']}", json={"repeat": "fortnightly"})
    assert (r.status_code, r.json()["skipped"]) == (200, ["2027-02-28"])
    r = c.patch(f"{MINE}/{rent['id']}", json={"repeat": "monthly", "repeatUntil": "2027-02-28"})
    assert (r.status_code, r.json()["skipped"]) == (200, ["2027-02-28"])
    assert c.delete(f"{MINE}/{rent['id']}/occurrences/2027-01-31").status_code == 204  # its last day left
    assert c.get(MINE).json() == []


def vevent_of(ics: str, event_id: str) -> list[str]:
    lines = ics.replace("\r\n ", "").split("\r\n")
    start = lines.index(f"UID:{event_id}@dsba-hub-personal") - 1
    return lines[start : lines.index("END:VEVENT", start) + 1]


def test_the_private_feed_and_the_file_carry_both_repeats(
    client_for: Clients, make_user: MakeUser, client: TestClient, db: Session
) -> None:
    c = client_for(make_user())
    lab = add(c, title="Lab", date="2026-10-18", repeat="fortnightly", startTime="10:00", repeatUntil="2026-12-31")
    rent = add(c, startTime="01:30", repeatUntil="2027-12-31")  # 22:30 the day before in UTC
    fees = add(c, title="Fees", date="2027-01-15")  # all day, for a year
    c.delete(f"{MINE}/{rent['id']}/occurrences/2027-04-30")
    r = c.post(f"{API}/calendar/mine/feed")
    ics = client.get(r.json()["feedPath"]).text
    assert "RRULE:FREQ=WEEKLY;INTERVAL=2;UNTIL=20261231T070000Z" in vevent_of(ics, lab["id"])
    assert vevent_of(ics, rent["id"])[3:6] == [
        "DTSTART;TZID=Asia/Bahrain:20270131T013000",
        "DTEND;TZID=Asia/Bahrain:20270131T023000",
        "RRULE:FREQ=MONTHLY;BYMONTHDAY=28,29,30,31;BYSETPOS=-1;UNTIL=20271230T223000Z",
    ]
    assert "EXDATE;TZID=Asia/Bahrain:20270430T013000" in vevent_of(ics, rent["id"])
    assert "RRULE:FREQ=MONTHLY;UNTIL=20280115" in vevent_of(ics, fees["id"])
    for e in (lab, rent, fees):
        row = db.get(PersonalEvent, uuid.UUID(e["id"]))
        assert row is not None
        assert expanded(vevent_of(ics, e["id"])) == days(row)
    file = c.get(f"{MINE}/{rent['id']}.ics").text
    assert expanded(vevent_of(file, rent["id"]))[:4] == [D(2027, 1, 31), D(2027, 2, 28), D(2027, 3, 31), D(2027, 5, 31)]


# ── reminders ────────────────────────────────────────────────────────────────────────────────


def test_reminders_come_on_the_days_of_both_repeats(db: Session, make_user: MakeUser) -> None:
    user = make_user()
    rent = PersonalEvent(
        user_id=user.id, title="Rent", date=D(2027, 1, 31), start_time=dt.time(18), repeat="monthly", remind=30
    )
    lab = PersonalEvent(
        user_id=user.id, title="Lab", date=D(2027, 4, 1), start_time=dt.time(18), repeat="fortnightly", remind=30
    )
    db.add_all([rent, lab])
    db.commit()

    def at(day: dt.date) -> dt.datetime:  # 20 minutes before an 18:00 start
        return dt.datetime.combine(day, dt.time(17, 40), tzinfo=BAHRAIN)

    assert svc.send_reminders(db, at(D(2027, 4, 30))) == 1  # the 31st's, in April
    db.flush()
    [n] = db.scalars(select(Notification).where(Notification.user_id == user.id))
    assert (n.title, n.body, n.url) == ("Rent", "Today at 18:00.", f"/calendar?event=mine-{rent.id}-2027-04-30")
    assert svc.send_reminders(db, at(D(2027, 5, 30))) == 0  # May has its 31st
    assert svc.send_reminders(db, at(D(2027, 4, 8))) == 0  # the week between
    assert svc.send_reminders(db, at(D(2027, 4, 15))) == 1
    assert svc.send_reminders(db, at(D(2027, 5, 31))) == 1
