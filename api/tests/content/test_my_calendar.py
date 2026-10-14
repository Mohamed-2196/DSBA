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
    assert n.url is not None
    assert n.url.startswith(f"/calendar?event=mine-{e.id}")
    assert svc.send_reminders(db, start + dt.timedelta(days=1, minutes=-20)) == 1  # the next day's
    set_feature("calendar", "off")
    assert svc.send_reminders(db, start + dt.timedelta(days=2, minutes=-20)) == 0
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
    r = c.post(f"{API}/board/cards", json={"title": "Essay draft", "link": {"type": "my_event", "id": e["id"]}})
    assert r.status_code == 201, r.text
    link = r.json()["link"]
    assert (link["title"], link["date"], link["url"]) == (
        "Essay draft",
        today.isoformat(),
        f"/calendar?event=mine-{e['id']}",
    )
    r = client_for(omar).post(f"{API}/board/cards", json={"title": "x", "link": {"type": "my_event", "id": e["id"]}})
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
