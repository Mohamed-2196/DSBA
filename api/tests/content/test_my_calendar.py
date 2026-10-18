"""A student's own calendar: their events (private, checked, limited), the programme dates they hide, their private
feed (the shared feed stays programme-only), reminders, board cards, the export and account deletion."""

from __future__ import annotations

import datetime as dt
import uuid
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import BAHRAIN, bahrain_today
from app.models import CalendarEvent, CalendarPrefs, Module, Notification, PersonalEvent, User, UserStatus
from app.services import grades
from app.services import my_calendar as svc
from tests.content.conftest import API

Clients = Callable[..., TestClient]
MakeUser = Callable[..., User]
MINE = f"{API}/calendar/mine/events"
SETTINGS = f"{API}/calendar/mine/settings"
FEED = f"{API}/calendar/mine/feed"


def add(c: TestClient, **fields: Any) -> dict[str, Any]:
    body = {"title": "Gym", "date": bahrain_today().isoformat(), **fields}
    r = c.post(MINE, json=body)
    assert r.status_code == 201, r.text
    data: dict[str, Any] = r.json()
    return data


def feed_of(c: TestClient) -> str:
    r = c.post(FEED)
    assert r.status_code == 200, r.text
    path: str = r.json()["feedPath"]
    assert path.startswith("/api/v1/feeds/calendar/")
    assert path.endswith(".ics")
    return path


def unfolded(ics: str) -> str:
    return ics.replace("\r\n ", "")


@pytest.fixture
def programme(db: Session, modules: dict[str, Module]) -> dict[str, CalendarEvent]:
    today = bahrain_today()
    rows = [
        CalendarEvent(id="y2-exam", date=today + dt.timedelta(days=5), title="Year 2 exam", type="exam", year=2),
        CalendarEvent(id="y1-exam", date=today + dt.timedelta(days=6), title="Year 1 exam", type="exam", year=1),
        CalendarEvent(id="all-break", date=today + dt.timedelta(days=7), title="Reading week", type="break"),
        CalendarEvent(
            id="stats-mock",
            date=today + dt.timedelta(days=8),
            title="Statistics mock",
            type="mock",
            year=2,
            module_id="advanced-stats-inferential",
        ),
    ]
    db.add_all(rows)
    db.commit()
    return {e.id: e for e in rows}


# ── events ───────────────────────────────────────────────────────────────────────────────────


def test_add_edit_and_delete_your_own_event(client_for: Clients, make_user: MakeUser) -> None:
    c = client_for(make_user())
    e = add(c, title="  Study group ", startTime="14:00", endTime="15:30", place="Library", colour="teal", remind=30)
    assert (e["title"], e["startTime"], e["endTime"], e["colour"], e["remind"]) == (
        "Study group",
        "14:00:00",
        "15:30:00",
        "teal",
        30,
    )
    assert e["repeat"] == "none"
    assert e["endDate"] is None
    r = c.patch(f"{MINE}/{e['id']}", json={"repeat": "weekly", "place": None, "notes": "Bring chapter 3"})
    assert r.status_code == 200, r.text
    assert (r.json()["repeat"], r.json()["place"], r.json()["notes"]) == ("weekly", None, "Bring chapter 3")
    assert [x["id"] for x in c.get(MINE).json()] == [e["id"]]
    ics = c.get(f"{MINE}/{e['id']}.ics")
    assert ics.status_code == 200
    assert "RRULE:FREQ=WEEKLY" in ics.text
    assert c.delete(f"{MINE}/{e['id']}").status_code == 204
    assert c.get(MINE).json() == []


def test_your_events_are_yours_alone(client_for: Clients, make_user: MakeUser) -> None:
    e = add(client_for(make_user(name="Sara Student")))
    for other in (make_user(name="Omar Classmate"), make_user(name="Head Admin", roles=("student", "admin"))):
        c = client_for(other)
        assert c.get(MINE).json() == []
        assert c.patch(f"{MINE}/{e['id']}", json={"title": "Mine now"}).status_code == 404
        assert c.delete(f"{MINE}/{e['id']}").status_code == 404
        assert c.get(f"{MINE}/{e['id']}.ics").status_code == 404


def test_guests_sign_in_first(client: TestClient) -> None:
    assert client.get(MINE).status_code == 401
    assert client.get(SETTINGS).status_code == 401
    assert client.post(FEED).status_code == 401


@pytest.mark.parametrize(
    ("fields", "field"),
    [
        ({"endDate": "2026-01-01", "date": "2026-01-05"}, "endDate"),
        ({"startTime": "10:00", "endTime": "09:00"}, "endTime"),
        ({"startTime": "10:00", "endDate": "2099-01-01"}, "endDate"),
        ({"repeat": "daily", "endDate": "2099-01-01"}, "repeat"),
        ({"repeat": "weekly", "date": "2026-01-05", "repeatUntil": "2026-01-01"}, "repeatUntil"),
        ({"repeat": "weekly", "date": "2026-01-05", "repeatUntil": "2029-01-01"}, "repeatUntil"),
        ({"colour": "gold"}, "colour"),
        ({"remind": 15}, "remind"),
        ({"title": ""}, "title"),
    ],
)
def test_dates_and_times_must_fit(client_for: Clients, make_user: MakeUser, fields: dict[str, Any], field: str) -> None:
    r = client_for(make_user()).post(MINE, json={"title": "Gym", "date": "2026-01-05", **fields})
    assert r.status_code == 422, r.text
    assert field in r.json()["error"]["fields"]


def test_an_all_day_event_drops_an_end_time_and_a_lone_repeat_end(client_for: Clients, make_user: MakeUser) -> None:
    c = client_for(make_user())
    e = add(c, date="2026-01-05", endDate="2026-01-05", repeatUntil="2026-02-01")
    assert (e["endDate"], e["repeatUntil"], e["startTime"]) == (None, None, None)
    r = c.patch(f"{MINE}/{e['id']}", json={"endDate": "2026-01-01"})
    assert r.status_code == 422
    assert c.get(MINE).json()[0]["endDate"] is None  # a refused change leaves the event as it was


def test_a_calendar_holds_so_many_events(
    client_for: Clients, make_user: MakeUser, monkeypatch: pytest.MonkeyPatch
) -> None:
    c = client_for(make_user())
    monkeypatch.setattr(svc, "MAX_EVENTS", 2)
    add(c)
    add(c)
    r = c.post(MINE, json={"title": "One more", "date": "2026-01-05"})
    assert (r.status_code, r.json()["error"]["code"]) == (409, "calendar_full")
    monkeypatch.setattr(svc, "MAX_EVENTS", 100)
    monkeypatch.setattr(svc, "CREATE_LIMIT", 2)
    r = c.post(MINE, json={"title": "One more", "date": "2026-01-05"})
    assert (r.status_code, r.json()["error"]["code"]) == (429, "rate_limited")


def test_a_suspended_account_reads_but_does_not_write(client_for: Clients, make_user: MakeUser, db: Session) -> None:
    user = make_user()
    c = client_for(user)
    add(c)
    user.status = UserStatus.suspended
    db.commit()
    assert len(c.get(MINE).json()) == 1
    assert c.post(MINE, json={"title": "Gym", "date": "2026-01-05"}).status_code == 403
    assert c.patch(SETTINGS, json={"hiddenTypes": ["exam"]}).status_code == 403


# ── occurrences ──────────────────────────────────────────────────────────────────────────────


def event(**fields: Any) -> PersonalEvent:
    return PersonalEvent(**{"title": "x", "date": dt.date(2026, 10, 5), "repeat": "none", **fields})


def test_occurrences() -> None:
    once = event()
    assert list(svc.occurrence_days(once, dt.date(2026, 10, 1), dt.date(2026, 10, 31))) == [dt.date(2026, 10, 5)]
    assert list(svc.occurrence_days(once, dt.date(2026, 10, 6), dt.date(2026, 10, 31))) == []
    weekly = event(repeat="weekly", repeat_until=dt.date(2026, 10, 26))
    days = list(svc.occurrence_days(weekly, dt.date(2026, 10, 10), dt.date(2026, 12, 31)))
    assert days == [dt.date(2026, 10, 12), dt.date(2026, 10, 19), dt.date(2026, 10, 26)]
    daily = event(repeat="daily")
    assert svc.last_repeat(daily) == dt.date(2027, 10, 5)  # a year without an end
    assert len(list(svc.occurrence_days(daily, dt.date(2026, 10, 1), dt.date(2026, 10, 7)))) == 3
    assert svc.next_day(weekly, dt.date(2026, 10, 13)) == dt.date(2026, 10, 19)
    assert svc.next_day(weekly, dt.date(2026, 10, 27)) is None
    span = event(end_date=dt.date(2026, 10, 7))
    assert svc.next_day(span, dt.date(2026, 10, 7)) == dt.date(2026, 10, 5)  # still running


def test_skipped_days_are_left_out() -> None:
    weekly = event(
        repeat="weekly", repeat_until=dt.date(2026, 10, 26), skipped=[dt.date(2026, 10, 5), dt.date(2026, 10, 19)]
    )
    days = list(svc.occurrence_days(weekly, dt.date(2026, 10, 1), dt.date(2026, 12, 31)))
    assert days == [dt.date(2026, 10, 12), dt.date(2026, 10, 26)]
    assert svc.first_day(weekly) == dt.date(2026, 10, 12)
    assert svc.is_occurrence(weekly, dt.date(2026, 10, 12))
    assert not svc.is_occurrence(weekly, dt.date(2026, 10, 19))  # skipped
    assert not svc.is_occurrence(weekly, dt.date(2026, 10, 13))  # not on the repeat
    assert svc.on_repeat(weekly, dt.date(2026, 10, 19))
    assert not svc.on_repeat(weekly, dt.date(2026, 11, 2))  # after its end
    assert svc.next_day(weekly, dt.date(2026, 10, 13)) == dt.date(2026, 10, 26)


# ── one day of a repeat ──────────────────────────────────────────────────────────────────────


def days_of(c: TestClient, title: str) -> dict[str, Any]:
    events: list[dict[str, Any]] = c.get(MINE).json()
    [found] = [e for e in events if e["title"] == title]
    return found


def test_delete_one_day_of_a_repeat_or_it_and_the_later_ones(client_for: Clients, make_user: MakeUser) -> None:
    c = client_for(make_user())
    e = add(c, title="Tutorial", date="2026-10-04", startTime="17:00", repeat="weekly", repeatUntil="2026-11-01")
    assert e["skipped"] == []
    one = f"{MINE}/{e['id']}/occurrences"
    assert c.delete(f"{one}/2026-10-18").status_code == 204  # scope=one by default
    assert days_of(c, "Tutorial")["skipped"] == ["2026-10-18"]
    for day in ("2026-10-18", "2026-10-19", "2026-11-08"):  # skipped, not on the repeat, after its end
        r = c.delete(f"{one}/{day}")
        assert (r.status_code, r.json()["error"]["code"]) == (404, "not_found")
    assert c.delete(f"{one}/2026-10-25?scope=following").status_code == 204
    left = days_of(c, "Tutorial")
    assert (left["repeatUntil"], left["skipped"]) == ("2026-10-24", ["2026-10-18"])
    assert c.delete(f"{one}/2026-10-04?scope=following").status_code == 204  # from its first day: all of it
    assert c.get(MINE).json() == []


def test_deleting_the_last_day_of_a_repeat_deletes_it(client_for: Clients, make_user: MakeUser) -> None:
    c = client_for(make_user())
    e = add(c, title="Revise", date="2026-10-04", repeat="daily", repeatUntil="2026-10-05")
    assert c.delete(f"{MINE}/{e['id']}/occurrences/2026-10-04").status_code == 204
    assert days_of(c, "Revise")["skipped"] == ["2026-10-04"]
    assert c.delete(f"{MINE}/{e['id']}/occurrences/2026-10-05").status_code == 204
    assert c.get(MINE).json() == []
    once = add(c, title="Dentist", date="2026-10-04")
    assert c.delete(f"{MINE}/{once['id']}/occurrences/2026-10-04?scope=following").status_code == 204
    assert c.get(MINE).json() == []


def test_change_one_day_of_a_repeat(client_for: Clients, make_user: MakeUser) -> None:
    c = client_for(make_user())
    e = add(c, title="Gym", date="2026-10-04", startTime="07:00", repeat="weekly", repeatUntil="2026-11-01", remind=30)
    r = c.patch(f"{MINE}/{e['id']}/occurrences/2026-10-18", json={"startTime": "08:00", "place": "Uni gym"})
    assert r.status_code == 200, r.text
    moved = r.json()
    assert moved["id"] != e["id"]
    assert (moved["date"], moved["startTime"], moved["place"], moved["repeat"], moved["remind"]) == (
        "2026-10-18",
        "08:00:00",
        "Uni gym",
        "none",
        30,
    )
    series = next(x for x in c.get(MINE).json() if x["id"] == e["id"])
    assert (series["skipped"], series["startTime"], series["place"]) == (["2026-10-18"], "07:00:00", None)
    # a day of its own doesn't repeat, whatever was sent
    r = c.patch(f"{MINE}/{e['id']}/occurrences/2026-10-25", json={"repeat": "daily", "title": "Swim"})
    assert (r.status_code, r.json()["repeat"], r.json()["title"]) == (200, "none", "Swim")
    assert c.patch(f"{MINE}/{e['id']}/occurrences/2026-10-18", json={"title": "x"}).status_code == 404  # skipped now


def test_change_a_day_of_a_repeat_and_the_later_ones(client_for: Clients, make_user: MakeUser) -> None:
    c = client_for(make_user())
    e = add(c, title="Lecture", date="2026-10-04", startTime="09:00", repeat="weekly")  # a year: to 2027-10-04
    c.delete(f"{MINE}/{e['id']}/occurrences/2026-10-11")
    c.delete(f"{MINE}/{e['id']}/occurrences/2026-11-01")
    r = c.patch(f"{MINE}/{e['id']}/occurrences/2026-10-25?scope=following", json={"startTime": "10:00"})
    assert r.status_code == 200, r.text
    later = r.json()
    assert (later["date"], later["startTime"], later["repeat"], later["repeatUntil"], later["skipped"]) == (
        "2026-10-25",
        "10:00:00",
        "weekly",
        "2027-10-04",  # where the old one ended
        ["2026-11-01"],
    )
    earlier = next(x for x in c.get(MINE).json() if x["id"] == e["id"])
    assert (earlier["repeatUntil"], earlier["skipped"], earlier["startTime"]) == (
        "2026-10-24",
        ["2026-10-11"],
        "09:00:00",
    )
    # from the first day, the change is the whole event's
    r = c.patch(f"{MINE}/{e['id']}/occurrences/2026-10-04?scope=following", json={"title": "Lecture 1"})
    assert (r.status_code, r.json()["id"], r.json()["title"]) == (200, e["id"], "Lecture 1")
    r = c.patch(f"{MINE}/{e['id']}/occurrences/2026-10-04?scope=following", json={"endTime": "08:00"})
    assert (r.status_code, list(r.json()["error"]["fields"])) == (422, ["endTime"])


def test_one_day_of_someone_elses_event(client_for: Clients, make_user: MakeUser, client: TestClient) -> None:
    e = add(client_for(make_user()), date="2026-10-04", repeat="daily")
    other = client_for(make_user(name="Omar Classmate"))
    assert other.patch(f"{MINE}/{e['id']}/occurrences/2026-10-05", json={"title": "x"}).status_code == 404
    assert other.delete(f"{MINE}/{e['id']}/occurrences/2026-10-05").status_code == 404
    assert client.delete(f"{MINE}/{e['id']}/occurrences/2026-10-05").status_code == 401
    assert other.delete(f"{MINE}/{e['id']}/occurrences/2026-10-05?scope=all").status_code == 422


def test_editing_the_whole_repeat_keeps_only_skipped_days_still_on_it(client_for: Clients, make_user: MakeUser) -> None:
    c = client_for(make_user())
    e = add(c, title="Run", date="2026-10-04", repeat="weekly", repeatUntil="2026-11-01")
    c.delete(f"{MINE}/{e['id']}/occurrences/2026-10-11")
    c.delete(f"{MINE}/{e['id']}/occurrences/2026-10-25")
    r = c.patch(f"{MINE}/{e['id']}", json={"repeatUntil": "2026-10-20"})
    assert r.json()["skipped"] == ["2026-10-11"]  # the 25th is past the new end
    r = c.patch(f"{MINE}/{e['id']}", json={"date": "2026-10-05"})  # every Monday now
    assert r.json()["skipped"] == []
    c.delete(f"{MINE}/{e['id']}/occurrences/2026-10-12")
    assert c.patch(f"{MINE}/{e['id']}", json={"repeat": "none"}).json()["skipped"] == []
    r = c.patch(f"{MINE}/{e['id']}", json={"repeat": "daily", "repeatUntil": "2026-10-05"})
    assert r.status_code == 200
    c.delete(f"{MINE}/{e['id']}/occurrences/2026-10-05?scope=one")
    assert c.get(MINE).json() == []  # its only day went: the event went with it


def test_a_repeat_without_days_is_refused(client_for: Clients, make_user: MakeUser) -> None:
    c = client_for(make_user())
    e = add(c, title="Run", date="2026-10-04", repeat="daily", repeatUntil="2026-10-06")
    c.delete(f"{MINE}/{e['id']}/occurrences/2026-10-05")
    c.delete(f"{MINE}/{e['id']}/occurrences/2026-10-06")
    r = c.patch(f"{MINE}/{e['id']}", json={"date": "2026-10-05"})  # every day it would keep was deleted
    assert (r.status_code, list(r.json()["error"]["fields"])) == (422, ["repeatUntil"])
    assert days_of(c, "Run")["date"] == "2026-10-04"


def test_the_feed_and_the_file_leave_skipped_days_out(
    client_for: Clients, make_user: MakeUser, client: TestClient
) -> None:
    c = client_for(make_user())
    timed = add(c, title="Weekly gym", date="2026-10-05", startTime="18:00", repeat="weekly", repeatUntil="2026-12-31")
    allday = add(c, title="Revision day", date="2026-10-05", repeat="daily", repeatUntil="2026-10-09")
    c.delete(f"{MINE}/{timed['id']}/occurrences/2026-10-12")
    c.delete(f"{MINE}/{timed['id']}/occurrences/2026-10-26")
    c.delete(f"{MINE}/{allday['id']}/occurrences/2026-10-07")
    ics = unfolded(client.get(feed_of(c)).text)
    assert "EXDATE:20261012T150000Z,20261026T150000Z" in ics
    assert "EXDATE;VALUE=DATE:20261007" in ics
    r = c.get(f"{MINE}/{timed['id']}.ics")
    assert r.headers["content-disposition"] == 'attachment; filename="weekly-gym.ics"'
    assert "EXDATE:20261012T150000Z,20261026T150000Z" in unfolded(r.text)
    arabic = add(c, title="مراجعة")
    assert c.get(f"{MINE}/{arabic['id']}.ics").headers["content-disposition"] == 'attachment; filename="my-event.ics"'


# ── hiding programme dates, and the private feed ─────────────────────────────────────────────


def test_hide_programme_dates_and_show_them_again(client_for: Clients, make_user: MakeUser) -> None:
    c = client_for(make_user())
    assert c.get(SETTINGS).json() == {"hiddenEvents": [], "hiddenModules": [], "hiddenTypes": [], "feedPath": None}
    r = c.patch(SETTINGS, json={"hiddenEvents": ["y2-exam", "y2-exam", "x"], "hiddenTypes": ["break"]})
    assert r.status_code == 200, r.text
    assert (r.json()["hiddenEvents"], r.json()["hiddenTypes"]) == (["y2-exam", "x"], ["break"])
    r = c.patch(SETTINGS, json={"hiddenModules": ["economics"]})
    assert r.json()["hiddenEvents"] == ["y2-exam", "x"]  # lists not sent stay
    r = c.patch(SETTINGS, json={"hiddenEvents": [], "hiddenTypes": []})
    assert (r.json()["hiddenEvents"], r.json()["hiddenTypes"], r.json()["hiddenModules"]) == ([], [], ["economics"])
    assert c.patch(SETTINGS, json={"hiddenTypes": ["party"]}).status_code == 422
    assert c.patch(SETTINGS, json={"hiddenEvents": ["x"] * 301}).status_code == 422


def test_the_private_feed(
    client_for: Clients, make_user: MakeUser, programme: dict[str, CalendarEvent], client: TestClient
) -> None:
    c = client_for(make_user(year=2))
    add(
        c,
        title="Weekly gym",
        startTime="18:00",
        repeat="weekly",
        repeatUntil="2026-12-31",
        remind=60,
        date="2026-10-05",
    )
    add(c, title="Trip", date="2026-10-20", endDate="2026-10-22", remind=1440, place="Muharraq; old town")
    c.patch(SETTINGS, json={"hiddenEvents": ["all-break"]})
    path = feed_of(c)
    assert c.get(SETTINGS).json()["feedPath"] == path  # shown again, never stored
    r = client.get(path)  # a calendar app: no session
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("text/calendar")
    assert r.headers["cache-control"] == "private, no-store"
    ics = unfolded(r.text)
    assert "X-WR-CALNAME:DSBA Hub: my calendar" in ics
    assert "SUMMARY:Year 2 exam" in ics
    assert "SUMMARY:Statistics mock" in ics
    assert "Year 1 exam" not in ics
    assert "Reading week" not in ics
    assert "DTSTART:20261005T150000Z" in ics
    assert "DTEND:20261005T160000Z" in ics
    assert "RRULE:FREQ=WEEKLY;UNTIL=20261231T150000Z" in ics
    assert "TRIGGER:-PT60M" in ics
    assert "DTSTART;VALUE=DATE:20261020" in ics
    assert "DTEND;VALUE=DATE:20261023" in ics
    assert "TRIGGER:-PT900M" in ics  # 09:00 the day before an all-day event
    assert "LOCATION:Muharraq\\; old town" in ics
    assert "CLASS:PRIVATE" in ics
    shared = unfolded(client.get(f"{API}/calendar/feed.ics?year=2").text)
    assert "Weekly gym" not in shared
    assert "Trip" not in shared
    assert "Reading week" in shared


def test_hiding_a_module_or_a_type_and_following_papers(
    client_for: Clients, make_user: MakeUser, programme: dict[str, CalendarEvent], client: TestClient, db: Session
) -> None:
    user = make_user(year=2)
    c = client_for(user)
    path = feed_of(c)
    c.patch(SETTINGS, json={"hiddenModules": ["advanced-stats-inferential"], "hiddenTypes": ["exam"]})
    ics = client.get(path).text
    assert "Statistics mock" not in ics
    assert "Year 2 exam" not in ics
    assert "Reading week" in ics
    c.patch(SETTINGS, json={"hiddenModules": [], "hiddenTypes": []})
    user.papers = ["econometrics"]  # an option picked: the other options' dates leave; a core module's stay
    db.commit()
    assert "Statistics mock" in client.get(path).text


def test_a_choice_not_picked_leaves_the_feed_as_the_grade_rules_have_it(
    client_for: Clients,
    make_user: MakeUser,
    programme: dict[str, CalendarEvent],
    client: TestClient,
    db: Session,
) -> None:
    """The Year 2 option comes from the grades calculator's rules: the option a student didn't pick leaves their
    feed, and a module an admin takes out of the option is one every Year 2 student sits again."""
    day = bahrain_today() + dt.timedelta(days=9)
    db.add_all(
        [
            CalendarEvent(
                id="econ-mock", date=day, title="Econometrics mock", type="mock", year=2, module_id="econometrics"
            ),
            CalendarEvent(
                id="is-mock",
                date=day,
                title="Information systems mock",
                type="mock",
                year=2,
                module_id="information-systems",
            ),
        ]
    )
    user = make_user(year=2)
    user.papers = ["econometrics"]
    db.commit()
    path = feed_of(client_for(user))
    ics = client.get(path).text
    assert "Econometrics mock" in ics
    assert "Statistics mock" in ics  # a module every Year 2 student sits
    assert "Information systems mock" not in ics

    current = grades.rules(db)
    others = [o for o in current.year2_options if o.id != "information-systems"]
    admin = make_user(name="Head Admin", roles=("student", "admin"))
    grades.save(db, admin, current.model_copy(update={"year2_options": others}), 0, None)
    db.commit()
    assert "Information systems mock" in client.get(path).text


def test_a_new_address_retires_the_old_one(client_for: Clients, make_user: MakeUser, client: TestClient) -> None:
    c = client_for(make_user())
    old = feed_of(c)
    new = feed_of(c)
    assert old != new
    assert client.get(old).status_code == 404
    assert client.get(new).status_code == 200
    r = c.delete(FEED)
    assert r.json()["feedPath"] is None
    assert client.get(new).status_code == 404
    assert client.get(f"{API}/feeds/calendar/{'A' * 43}.ics").status_code == 404
    assert client.get(f"{API}/feeds/calendar/short.ics").status_code == 422


def test_the_private_feed_follows_the_switch(
    client_for: Clients,
    make_user: MakeUser,
    client: TestClient,
    set_feature: Callable[..., None],
    db: Session,
) -> None:
    user = make_user()
    path = feed_of(client_for(user))
    set_feature("calendar", "roles", ["rep"])
    assert client.get(path).status_code == 404
    set_feature("calendar", "everyone")
    assert client.get(path).status_code == 200
    user.status = UserStatus.suspended  # a suspended account still reads its own calendar
    db.commit()
    assert client.get(path).status_code == 200


# ── reminders ────────────────────────────────────────────────────────────────────────────────


def test_a_reminder_goes_out_once_per_occurrence(
    db: Session, make_user: MakeUser, set_feature: Callable[..., None]
) -> None:
    user = make_user()
    e = PersonalEvent(
        user_id=user.id, title="Gym", date=bahrain_today(), start_time=dt.time(18), repeat="daily", remind=30
    )
    db.add(e)
    db.commit()
    start = dt.datetime.combine(bahrain_today(), dt.time(18), tzinfo=BAHRAIN)

    def sent() -> list[Notification]:
        db.flush()
        return list(db.scalars(select(Notification).where(Notification.user_id == user.id)))

    assert svc.send_reminders(db, start - dt.timedelta(minutes=31)) == 0
    assert svc.send_reminders(db, start - dt.timedelta(minutes=29)) == 1
    assert svc.send_reminders(db, start - dt.timedelta(minutes=10)) == 0  # once
    [n] = sent()
    assert (n.kind, n.title, n.body) == ("event_reminder", "Gym", "Today at 18:00.")
    assert n.url == f"/calendar?event=mine-{e.id}-{bahrain_today().isoformat()}"  # that day's occurrence
    assert svc.send_reminders(db, start + dt.timedelta(days=1, minutes=-20)) == 1  # the next day's
    e.skipped = [bahrain_today() + dt.timedelta(days=2)]
    db.commit()
    assert svc.send_reminders(db, start + dt.timedelta(days=2, minutes=-20)) == 0  # a day taken off the repeat
    set_feature("calendar", "off")
    assert svc.send_reminders(db, start + dt.timedelta(days=3, minutes=-20)) == 0
    assert len(sent()) == 2


def test_an_edit_makes_the_reminder_due_again(client_for: Clients, make_user: MakeUser, db: Session) -> None:
    c = client_for(make_user())
    e = add(c, startTime="18:00", remind=0)
    row = db.get(PersonalEvent, uuid.UUID(e["id"]))
    assert row is not None
    row.reminded_for = dt.datetime.now(dt.UTC)
    db.commit()
    c.patch(f"{MINE}/{e['id']}", json={"startTime": "19:00"})
    db.refresh(row)
    assert row.reminded_for is None


# ── the board, the export, deletion ──────────────────────────────────────────────────────────


def test_a_board_card_for_your_own_event(
    client_for: Clients, make_user: MakeUser, set_feature: Callable[..., None]
) -> None:
    set_feature("board", "everyone")
    sara, omar = make_user(name="Sara Student"), make_user(name="Omar Classmate")
    c = client_for(sara)
    today = bahrain_today()
    e = add(c, title="Essay draft", date=(today - dt.timedelta(days=7)).isoformat(), repeat="weekly")
    r = c.post(f"{API}/board-cards", json={"title": "Essay draft", "link": {"type": "my_event", "id": e["id"]}})
    assert r.status_code == 201, r.text
    link = r.json()["link"]
    assert (link["title"], link["date"], link["url"]) == (
        "Essay draft",
        today.isoformat(),
        f"/calendar?event=mine-{e['id']}",
    )
    r = client_for(omar).post(f"{API}/board-cards", json={"title": "x", "link": {"type": "my_event", "id": e["id"]}})
    assert r.status_code == 422  # someone else's event is nothing to them


def test_export_and_deletion(client_for: Clients, make_user: MakeUser, db: Session) -> None:
    user = make_user()
    c = client_for(user)
    e = add(c, title="Dentist", notes="private-note-text")
    c.patch(SETTINGS, json={"hiddenTypes": ["careers"]})
    feed_of(c)
    data = c.get(f"{API}/me/export").json()
    assert [x["id"] for x in data["calendarEvents"]] == [e["id"]]
    assert data["calendarEvents"][0]["notes"] == "private-note-text"
    assert data["calendarSettings"] == {
        "hiddenEvents": [],
        "hiddenModules": [],
        "hiddenTypes": ["careers"],
        "privateFeed": True,
    }
    assert c.delete(f"{API}/me").status_code == 204
    db.expire_all()
    assert db.scalar(select(PersonalEvent).where(PersonalEvent.user_id == user.id)) is None
    assert db.get(CalendarPrefs, user.id) is None
