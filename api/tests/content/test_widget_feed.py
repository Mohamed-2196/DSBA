"""The widget feed: what a home-screen widget shows at a glance, as JSON at a private address, read by a widget app on
the student's own phone without a session."""

from __future__ import annotations

import datetime as dt
import uuid
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.time import bahrain_today
from app.models import CalendarEvent, Module, User
from app.services import widget
from tests.content.conftest import API
from tests.lessons import chapters, lesson_id

Clients = Callable[..., TestClient]
MakeUser = Callable[..., User]
WIDGET = f"{API}/calendar/mine/widget"
CALENDAR_FEED = f"{API}/calendar/mine/feed"
MINE = f"{API}/calendar/mine/events"


def token(path: str) -> str:
    return path.rsplit("/", 1)[1].split(".")[0]


def widget_of(c: TestClient) -> str:
    r = c.post(WIDGET)
    assert r.status_code == 200, r.text
    path: str = r.json()["widgetPath"]
    assert path.startswith("/api/v1/feeds/widget/")
    assert path.endswith(".json")
    return path


def add(c: TestClient, **fields: Any) -> None:
    r = c.post(MINE, json={"title": "Gym", "date": bahrain_today().isoformat(), **fields})
    assert r.status_code == 201, r.text


def web(path: str) -> str:
    return f"{get_settings().web_base_url.rstrip('/')}{path}"


@pytest.fixture
def dates(db: Session) -> dict[str, CalendarEvent]:
    today = bahrain_today()
    rows = [
        CalendarEvent(
            id="y2-sample", date=today + dt.timedelta(days=2), title="Year 2 maybe", type="exam", year=2, sample=True
        ),
        CalendarEvent(id="y2-exam", date=today + dt.timedelta(days=5), title="Year 2 exam", type="exam", year=2),
        CalendarEvent(id="y1-exam", date=today + dt.timedelta(days=1), title="Year 1 exam", type="exam", year=1),
        CalendarEvent(id="talk", date=today, time="10:00", title="Careers talk", type="event", year=2),
        CalendarEvent(
            id="week",
            date=today - dt.timedelta(days=2),
            end_date=today + dt.timedelta(days=2),
            title="Reading week",
            type="break",
        ),
        CalendarEvent(id="y1-talk", date=today, title="Year 1 talk", type="event", year=1),
    ]
    db.add_all(rows)
    db.commit()
    return {e.id: e for e in rows}


@pytest.fixture
def course(db: Session) -> Module:
    m_id = f"w-{uuid.uuid4().hex[:6]}"
    m = Module(
        id=m_id,
        unit_code="TS1000",
        name="Test module",
        short_name="Test",
        year=2,
        description="",
        chapters=chapters(
            m_id,
            [
                {"title": "Basics", "videos": [{"video_id": "a"}, {"video_id": "b"}]},
                {"title": "Regression", "videos": [{"video_id": "c"}]},
            ],
        ),
    )
    db.add(m)
    db.commit()
    return m


def test_the_widget_feed(
    client_for: Clients, make_user: MakeUser, client: TestClient, dates: dict[str, CalendarEvent], course: Module
) -> None:
    c = client_for(make_user(year=2, tracks=True))
    add(c, title="Gym", startTime="18:00")
    add(c, title="Dentist", startTime="09:30")
    add(c, title="Mum's birthday")  # all day
    add(c, title="Tomorrow", date=(bahrain_today() + dt.timedelta(days=1)).isoformat())
    first, second = lesson_id(course, 0, 0), lesson_id(course, 0, 1)
    assert c.put(f"{API}/me/progress/lessons/{first}", json={"watched": True}).status_code == 200
    assert c.put(f"{API}/me/progress/resume", json={"lessonId": first}).status_code == 200
    path = widget_of(c)
    assert c.get(f"{API}/calendar/mine/settings").json()["widgetPath"] == path  # shown again, never stored

    r = client.get(path)  # a widget app: no session
    assert r.status_code == 200, r.text
    assert r.headers["content-type"].startswith("application/json")
    assert r.headers["cache-control"] == "private, no-store"
    assert r.headers["referrer-policy"] == "no-referrer"
    body = r.json()
    assert body["today"] == bahrain_today().isoformat()
    assert body["url"] == web("/")
    assert body["nextExam"] == {
        "title": "Year 2 exam",
        "date": (bahrain_today() + dt.timedelta(days=5)).isoformat(),
        "daysLeft": 5,
        "text": "Year 2 exam in 5 days",
        "url": web(f"/calendar?date={(bahrain_today() + dt.timedelta(days=5)).isoformat()}&event=y2-exam"),
    }
    # timed ones by their start, whoever's they are, then the all-day ones: a widget shows the first two or three
    assert [e["text"] for e in body["todayEvents"]] == [
        "09:30 Dentist",
        "10:00 Careers talk",
        "18:00 Gym",
        "Reading week",
        "Mum's birthday",
    ]
    assert body["todayText"] == "09:30 Dentist\n10:00 Careers talk\n18:00 Gym\nReading week\nMum's birthday"
    assert all(e["url"].startswith(web("/calendar?")) for e in body["todayEvents"])
    assert body["carryOn"] == {
        "module": "TS1000",
        "chapter": "Basics",
        "text": "TS1000: Basics",
        "url": web(f"/modules/{course.id}/lessons/{second}"),
    }


def test_the_days_left_read_plainly(client_for: Clients, make_user: MakeUser, client: TestClient, db: Session) -> None:
    today = bahrain_today()
    db.add(CalendarEvent(id="soon", date=today + dt.timedelta(days=1), title="Statistics mock", type="mock", year=2))
    db.commit()
    c = client_for(make_user(year=2))
    exam = client.get(widget_of(c)).json()["nextExam"]
    assert exam["daysLeft"] == 1
    assert exam["text"] == "Statistics mock tomorrow"
    db.query(CalendarEvent).filter_by(id="soon").update({"date": today})
    db.commit()
    assert client.get(widget_of(c)).json()["nextExam"]["text"] == "Statistics mock today"


def test_a_student_without_a_year_gets_every_date_as_their_calendar_does(
    client_for: Clients, make_user: MakeUser, client: TestClient, dates: dict[str, CalendarEvent]
) -> None:
    body = client.get(widget_of(client_for(make_user(year=None)))).json()
    assert body["nextExam"]["title"] == "Year 1 exam"  # the first confirmed one, of any year
    assert [e["text"] for e in body["todayEvents"]] == ["10:00 Careers talk", "Reading week", "Year 1 talk"]


def test_a_quiet_day(client_for: Clients, make_user: MakeUser, client: TestClient, course: Module) -> None:
    c = client_for(make_user(year=2))  # keeps no lesson progress
    body = client.get(widget_of(c)).json()
    assert body["nextExam"] is None
    assert body["todayEvents"] == []
    assert body["todayText"] == "Nothing on today."
    assert body["carryOn"] is None


def test_a_finished_module_has_nothing_to_carry_on_with(
    client_for: Clients, make_user: MakeUser, client: TestClient, course: Module
) -> None:
    c = client_for(make_user(year=2, tracks=True))
    for ch, v in ((0, 0), (0, 1), (1, 0)):
        assert c.put(f"{API}/me/progress/lessons/{lesson_id(course, ch, v)}", json={"watched": True}).status_code == 200
    c.put(f"{API}/me/progress/resume", json={"lessonId": lesson_id(course, 1, 0)})
    assert client.get(widget_of(c)).json()["carryOn"] is None


def test_the_next_unwatched_lesson_after_the_last_one_opened(
    client_for: Clients, make_user: MakeUser, client: TestClient, course: Module
) -> None:
    c = client_for(make_user(year=2, tracks=True))
    last = lesson_id(course, 0, 1)
    c.put(f"{API}/me/progress/lessons/{last}", json={"watched": True})
    c.put(f"{API}/me/progress/resume", json={"lessonId": last})
    carry = client.get(widget_of(c)).json()["carryOn"]
    assert carry["chapter"] == "Regression"
    assert carry["url"] == web(f"/modules/{course.id}/lessons/{lesson_id(course, 1, 0)}")


def test_a_new_address_retires_the_old_one(client_for: Clients, make_user: MakeUser, client: TestClient) -> None:
    c = client_for(make_user())
    old = widget_of(c)
    new = widget_of(c)
    assert old != new
    assert client.get(old).status_code == 404
    assert client.get(new).status_code == 200
    r = c.delete(WIDGET)
    assert r.json()["widgetPath"] is None
    assert client.get(new).status_code == 404
    assert client.get(f"{API}/feeds/widget/{'A' * 43}.json").status_code == 404
    assert client.get(f"{API}/feeds/widget/short.json").status_code == 422


def test_the_calendar_and_the_widget_have_their_own_addresses(
    client_for: Clients, make_user: MakeUser, client: TestClient
) -> None:
    c = client_for(make_user())
    widget = widget_of(c)
    calendar = c.post(CALENDAR_FEED).json()["feedPath"]
    assert token(widget) != token(calendar)
    assert client.get(f"{API}/feeds/calendar/{token(widget)}.ics").status_code == 404
    assert client.get(f"{API}/feeds/widget/{token(calendar)}.json").status_code == 404
    c.delete(CALENDAR_FEED)  # stopping one leaves the other
    assert client.get(widget).status_code == 200


def test_the_widget_feed_follows_the_switch(
    client_for: Clients, make_user: MakeUser, client: TestClient, set_feature: Callable[..., None]
) -> None:
    path = widget_of(client_for(make_user()))
    set_feature("calendar", "roles", ["rep"])
    assert client.get(path).status_code == 404
    set_feature("calendar", "everyone")
    assert client.get(path).status_code == 200


def test_guests_sign_in_first(client: TestClient) -> None:
    assert client.post(WIDGET).status_code == 401
    assert client.delete(WIDGET).status_code == 401


def test_export_says_whether_it_is_on(client_for: Clients, make_user: MakeUser) -> None:
    c = client_for(make_user())
    widget_of(c)
    assert c.get(f"{API}/me/export").json()["calendarSettings"]["widgetFeed"] is True
    c.delete(WIDGET)
    assert c.get(f"{API}/me/export").json()["calendarSettings"]["widgetFeed"] is False


@pytest.mark.parametrize(
    ("published", "starts"),
    [
        ("14:30", dt.time(14, 30)),
        ("9:00 to 12:00", dt.time(9, 0)),
        ("1:30 PM", dt.time(13, 30)),
        ("1:30pm", dt.time(13, 30)),
        ("12:30 PM", dt.time(12, 30)),
        ("12:30 AM", dt.time(0, 30)),
        ("9:00 a.m. to 11:00 a.m.", dt.time(9, 0)),
        ("10:00 AM", dt.time(10, 0)),
        ("13:00 PM", dt.time(13, 0)),  # a 24-hour time with a stray PM stays as it is
        ("All day", None),
        ("25:00", None),
        ("", None),
        (None, None),
    ],
)
def test_when_a_published_time_starts(published: str | None, starts: dt.time | None) -> None:
    assert widget._starts(published) == starts


def test_twelve_hour_times_sort_by_when_they_start(
    client_for: Clients, make_user: MakeUser, client: TestClient, db: Session
) -> None:
    today = bahrain_today()
    db.add_all(
        [
            CalendarEvent(id="pm", date=today, time="1:30 PM", title="Afternoon talk", type="event"),
            CalendarEvent(id="noon", date=today, time="12:30 PM", title="Lunch talk", type="event"),
        ]
    )
    db.commit()
    c = client_for(make_user(year=2))
    add(c, title="Dentist", startTime="09:30")
    add(c, title="Gym", startTime="13:00")
    body = client.get(widget_of(c)).json()
    assert [e["text"] for e in body["todayEvents"]] == [
        "09:30 Dentist",
        "12:30 PM Lunch talk",
        "13:00 Gym",
        "1:30 PM Afternoon talk",
    ]


def test_a_busy_day_keeps_every_event_for_the_count(
    client_for: Clients, make_user: MakeUser, client: TestClient
) -> None:
    c = client_for(make_user(year=2))
    for n in range(11):
        add(c, title=f"Thing {n:02}", startTime=f"{8 + n:02}:00")
    body = client.get(widget_of(c)).json()
    assert len(body["todayEvents"]) == 11  # so a widget's "+N more" counts them all
    assert body["todayText"].splitlines() == [f"{8 + n:02}:00 Thing {n:02}" for n in range(8)]  # a text has room for 8
