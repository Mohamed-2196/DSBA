from __future__ import annotations

import datetime as dt
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuditEntry, CalendarEvent, Module, User
from app.services.calendar import bahrain_today, ics_fold, ics_text
from tests.content.conftest import API

Clients = Callable[..., TestClient]
EVENTS = f"{API}/calendar/events"


@pytest.fixture
def today() -> dt.date:
    return bahrain_today()


@pytest.fixture
def events(db: Session, modules: dict[str, Module], today: dt.date) -> dict[str, CalendarEvent]:
    def day(n: int) -> dt.date:
        return today + dt.timedelta(days=n)

    rows = [
        CalendarEvent(id="past-exam", date=day(-30), title="Old exam", type="exam", year=2),
        CalendarEvent(
            id="running-week",
            date=day(-2),
            end_date=day(2),
            title="Revision week",
            type="revision",
            year=None,
            place="Room 4, block B",
        ),
        CalendarEvent(
            id="st2134-mock",
            date=day(3),
            title="Statistical Inference mock exam",
            type="mock",
            year=2,
            module_id="advanced-stats-inferential",
            unit_code="ST2134",
            sample=True,
        ),
        CalendarEvent(
            id="mt1186-exam",
            date=day(10),
            title="MT1186 Mathematical Methods (October exam)",
            type="exam",
            year=1,
            module_id="mathematics",
            unit_code="MT1186",
            time="9:00 AM",
        ),
        CalendarEvent(id="break", date=day(40), title="Mid-year break", type="break", year=None),
    ]
    db.add_all(rows)
    db.commit()
    return {e.id: e for e in rows}


def ids(client: TestClient, path: str, **params: Any) -> list[str]:
    r = client.get(path, params=params)
    assert r.status_code == 200, r.text
    return [e["id"] for e in r.json()]


def test_filters(client_for: Clients, events: dict[str, CalendarEvent], today: dt.date) -> None:
    guest = client_for()
    assert ids(guest, EVENTS) == ["past-exam", "running-week", "st2134-mock", "mt1186-exam", "break"]
    # an event that spans several days counts when it overlaps the window
    window = {"from": (today + dt.timedelta(days=1)).isoformat(), "to": (today + dt.timedelta(days=10)).isoformat()}
    assert ids(guest, EVENTS, **window) == ["running-week", "st2134-mock", "mt1186-exam"]
    assert ids(guest, EVENTS, year=2) == ["past-exam", "running-week", "st2134-mock", "break"]  # + everyone
    assert ids(guest, EVENTS, year=1) == ["running-week", "mt1186-exam", "break"]
    assert ids(guest, EVENTS, module_id="mathematics") == ["mt1186-exam"]
    assert ids(guest, EVENTS, type="exam") == ["past-exam", "mt1186-exam"]
    assert guest.get(EVENTS, params={"type": "party"}).status_code == 422
    assert guest.get(EVENTS, params={"year": 4}).status_code == 422
    mock = guest.get(EVENTS, params={"module_id": "advanced-stats-inferential"}).json()[0]
    assert mock == {
        "id": "st2134-mock",
        "date": (today + dt.timedelta(days=3)).isoformat(),
        "endDate": None,
        "time": None,
        "place": None,
        "title": "Statistical Inference mock exam",
        "type": "mock",
        "year": 2,
        "moduleId": "advanced-stats-inferential",
        "unitCode": "ST2134",
        "sample": True,
    }


def test_upcoming_starts_today_in_bahrain(client_for: Clients, events: dict[str, CalendarEvent]) -> None:
    guest = client_for()
    up = f"{API}/calendar/upcoming"
    assert ids(guest, up) == ["running-week", "st2134-mock", "mt1186-exam", "break"]  # still running counts
    assert ids(guest, up, n=2) == ["running-week", "st2134-mock"]
    assert ids(guest, up, year=1, n=2) == ["running-week", "mt1186-exam"]
    assert guest.get(up, params={"n": 61}).status_code == 422


def unfold(text: str) -> list[str]:
    return text.replace("\r\n ", "").split("\r\n")


def test_ics_feed(client_for: Clients, events: dict[str, CalendarEvent], today: dt.date) -> None:
    r = client_for().get(f"{API}/calendar/feed.ics")
    assert r.status_code == 200
    assert r.headers["content-type"] == "text/calendar; charset=utf-8"
    raw = r.content.decode("utf-8")
    assert raw.endswith("\r\n")
    assert "\n" not in raw.replace("\r\n", "")  # CRLF only
    assert all(len(line.encode()) <= 75 for line in raw.split("\r\n"))
    lines = unfold(raw)
    assert lines[:3] == ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//DSBA Hub//Calendar//EN"]
    assert lines[-2:] == ["END:VCALENDAR", ""]
    assert lines.count("BEGIN:VEVENT") == 5

    def event_lines(uid: str) -> dict[str, str]:
        start = lines.index(f"UID:{uid}@dsba-hub")
        end = lines.index("END:VEVENT", start)
        out = {}
        for line in lines[start:end]:
            key, _, value = line.partition(":")
            out.setdefault(key, value)
        return out

    def day(n: int) -> str:
        return (today + dt.timedelta(days=n)).strftime("%Y%m%d")

    mock = event_lines("st2134-mock")
    assert mock["DTSTART;VALUE=DATE"] == day(3)
    assert mock["DTEND;VALUE=DATE"] == day(4)  # exclusive: the next day
    assert mock["SUMMARY"] == "ST2134 Statistical Inference mock exam"  # led by the unit code
    assert "Sample date" in mock["DESCRIPTION"]
    assert "Module: ST2134 Advanced Statistics: Statistical Inference." in mock["DESCRIPTION"].replace("\\n", "\n")
    assert mock["DTSTAMP"].endswith("Z")
    exam = event_lines("mt1186-exam")
    assert exam["SUMMARY"] == "MT1186 Mathematical Methods (October exam)"  # the code isn't repeated
    assert "9:00 AM." in exam["DESCRIPTION"]
    week = event_lines("running-week")
    assert (week["DTSTART;VALUE=DATE"], week["DTEND;VALUE=DATE"]) == (day(-2), day(3))  # end_date + 1
    assert week["LOCATION"] == "Room 4\\, block B"
    assert "BEGIN:VALARM" in lines  # exams and deadlines remind the day before

    year1 = client_for().get(f"{API}/calendar/feed.ics", params={"year": 1}).content.decode()
    assert "UID:mt1186-exam@dsba-hub" in year1
    assert "UID:st2134-mock@dsba-hub" not in year1
    assert "UID:break@dsba-hub" in year1
    assert "X-WR-CALNAME:DSBA Hub: Year 1" in year1


def test_ics_text_is_escaped_and_folded() -> None:
    assert ics_text("a,b;c\\d\ne\r\nf\rg\x07h\tz") == "a\\,b\\;c\\\\d\\ne\\nf\\ng" + "h\tz"
    # a moderator can't start a new property with a line break
    assert "\r" not in ics_text("Exam\r\nBEGIN:VEVENT")
    assert "\n" not in ics_text("Exam\r\nBEGIN:VEVENT")
    line = "SUMMARY:" + "é" * 80  # 2 octets each
    folded = ics_fold(line)
    parts = folded.split("\r\n ")
    assert all(len(p.encode()) <= 75 for p in parts[:1])
    assert all(len(p.encode()) <= 74 for p in parts[1:])
    assert "".join(parts) == line  # never splits a character


def test_moderators_edit_the_calendar(
    client_for: Clients, student: User, moderator: User, modules: dict[str, Module], db: Session
) -> None:
    rep = client_for(moderator)
    body = {"date": "2026-12-03", "title": "Distribution Theory mock exam", "type": "mock"}
    assert client_for().post(EVENTS, json=body).status_code == 401
    assert client_for(student).post(EVENTS, json=body).status_code == 403

    r = rep.post(EVENTS, json={**body, "moduleId": "advanced-stats-distribution", "place": "Hall A"})
    assert r.status_code == 201, r.text
    created = r.json()
    assert created["id"] == "2026-12-03-distribution-theory-mock-exam"
    assert (created["year"], created["unitCode"], created["sample"]) == (2, "ST2133", False)  # from the module
    again = rep.post(EVENTS, json={**body, "year": None}).json()
    assert again["id"] == "2026-12-03-distribution-theory-mock-exam-2"
    assert again["year"] is None
    assert rep.post(EVENTS, json={**body, "moduleId": "nope"}).status_code == 422
    assert rep.post(EVENTS, json={**body, "endDate": "2026-12-01"}).json()["error"]["fields"] == {
        "endDate": "The last day can't be before the first."
    }
    assert rep.post(EVENTS, json={**body, "type": "party"}).status_code == 422

    url = f"{EVENTS}/{created['id']}"
    r = rep.patch(url, json={"title": "ST2133 mock exam", "endDate": "2026-12-04", "place": None, "sample": True})
    assert r.status_code == 200, r.text
    updated = r.json()
    assert (updated["id"], updated["title"], updated["endDate"], updated["place"], updated["sample"]) == (
        created["id"],
        "ST2133 mock exam",
        "2026-12-04",
        None,
        True,
    )
    assert rep.patch(url, json={"date": "2026-12-10"}).status_code == 422  # after its last day
    assert rep.patch(url, json={"moduleId": "mathematics"}).json()["unitCode"] == "MT1186"
    assert rep.patch(url, json={"moduleId": None}).json()["unitCode"] is None
    assert client_for(student).patch(url, json={"title": "Cancelled!"}).status_code == 403
    assert rep.patch(f"{EVENTS}/nope", json={"title": "Something"}).status_code == 404

    assert client_for(student).delete(url).status_code == 403
    assert rep.delete(url).status_code == 204
    assert rep.delete(url).status_code == 404
    assert db.get(CalendarEvent, created["id"]) is None
    actions = list(
        db.scalars(select(AuditEntry.action).where(AuditEntry.target_id == created["id"]).order_by(AuditEntry.id))
    )
    assert actions == ["calendar.create", "calendar.update", "calendar.update", "calendar.update", "calendar.delete"]
