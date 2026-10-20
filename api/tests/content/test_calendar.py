from __future__ import annotations

import datetime as dt
import re
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import bahrain_today
from app.models import AuditEntry, CalendarEvent, Module, User
from app.services.calendar import ics_fold, ics_text
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
        "duration": None,
        "rules": None,
        "source": None,
        "checkedOn": None,
        "employerId": None,
        "sample": True,
        "resit": False,
    }


def test_upcoming_starts_today_in_bahrain(client_for: Clients, events: dict[str, CalendarEvent]) -> None:
    guest = client_for()
    up = f"{API}/calendar/upcoming"
    assert ids(guest, up) == ["running-week", "st2134-mock", "mt1186-exam", "break"]  # still running counts
    assert ids(guest, up, limit=2) == ["running-week", "st2134-mock"]
    assert ids(guest, up, year=1, limit=2) == ["running-week", "mt1186-exam"]
    assert guest.get(up, params={"limit": 61}).status_code == 422


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
        out: dict[str, str] = {}
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
    assert (
        "Not confirmed yet. Ask your student rep or the programme office" in mock["DESCRIPTION"]
    )  # not "sample" (UX-13)
    assert "ample" not in mock["DESCRIPTION"]
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
    assert rep.post(EVENTS, json={**body, "moduleId": "nope"}).json()["error"]["fields"] == {
        "moduleId": "Pick a module from the list."  # the same words as the forum and the library (CQ-6)
    }
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
    assert rep.patch(url, json={"date": "2026-12-10", "title": "Moved"}).status_code == 422  # after its last day
    db.expire_all()
    assert (rep.get(EVENTS, params={"from": "2026-12-03", "to": "2026-12-03"}).json()[0]["title"]) == "ST2133 mock exam"
    assert rep.patch(url, json={"moduleId": "mathematics"}).json()["unitCode"] == "MT1186"
    assert rep.patch(url, json={"moduleId": None}).json()["unitCode"] is None
    assert client_for(student).patch(url, json={"title": "Cancelled!"}).status_code == 403
    assert rep.patch(f"{EVENTS}/nope", json={"title": "Something"}).status_code == 404

    assert client_for(student).delete(url).status_code == 403
    assert rep.delete(url).status_code == 204
    assert rep.delete(url).status_code == 404
    assert db.get(CalendarEvent, created["id"]) is None
    rows = list(db.scalars(select(AuditEntry).where(AuditEntry.target_id == created["id"]).order_by(AuditEntry.id)))
    assert [e.action for e in rows] == [
        "calendar.create",
        "calendar.update",
        "calendar.update",
        "calendar.update",
        "calendar.delete",
    ]
    # the activity log names the date (student test ST-9)
    assert [e.data["title"] for e in rows] == [
        "Distribution Theory mock exam",
        "ST2133 mock exam",
        "ST2133 mock exam",
        "ST2133 mock exam",
        "ST2133 mock exam",
    ]
    assert rows[1].data["fields"] == ["end_date", "place", "title", "sample"]
    assert rows[2].data["fields"] == ["module_id", "unit_code"]
    assert rows[-1].data["date"] == "2026-12-03"


# The test's one session still holds the event that took the id; in the app each request has its own session.
@pytest.mark.filterwarnings("ignore:New instance .* conflicts with persistent instance")
def test_two_reps_adding_the_same_date_at_once_both_get_one(
    client_for: Clients, moderator: User, modules: dict[str, Module], monkeypatch: pytest.MonkeyPatch
) -> None:
    """Both requests see the same id as free (code quality review CQ-14): the second one retries with a suffix
    instead of failing with a 500."""
    import secrets

    import app.core.text as text

    rep = client_for(moderator)
    body = {"date": "2026-12-03", "title": "Mock exam", "type": "mock"}
    first = rep.post(EVENTS, json=body).json()
    monkeypatch.setattr(text, "unique_slug", lambda *_args, **_kwargs: first["id"])  # "free", as it was a moment ago
    r = rep.post(EVENTS, json=body)
    assert r.status_code == 201, r.text
    assert r.json()["id"].startswith(f"{first['id']}-")
    assert len(r.json()["id"]) == len(first["id"]) + 5  # '-' and four hex digits

    # when every try collides, the answer is 409 retry, never a 500
    monkeypatch.setattr(secrets, "token_hex", lambda _n: "beef")
    rep.post(EVENTS, json=body)  # takes '<id>-beef'
    r = rep.post(EVENTS, json=body)
    assert (r.status_code, r.json()["error"]["code"]) == (409, "retry")


def test_an_event_without_latin_letters_gets_a_short_id(client_for: Clients, moderator: User) -> None:
    """Decision D8: the date and a short id ('2026-12-04-x3k9q2'), not the bare date."""
    r = client_for(moderator).post(EVENTS, json={"date": "2026-12-04", "title": "امتحان تجريبي", "type": "mock"})
    assert r.status_code == 201, r.text
    assert re.fullmatch(r"2026-12-04-[a-z0-9]{6}", r.json()["id"]), r.json()["id"]


def test_one_event_as_a_file_and_the_exams_feed(client_for: Clients, moderator: User) -> None:
    """Code quality review CQ-5: "Add to calendar" and "Download the exams" come from the API."""
    rep = client_for(moderator)
    exam = rep.post(EVENTS, json={"date": "2026-12-10", "title": "Statistics exam", "type": "exam"}).json()
    rep.post(EVENTS, json={"date": "2026-12-11", "title": "Study group", "type": "event"})
    r = client_for().get(f"{EVENTS}/{exam['id']}.ics")
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "text/calendar; charset=utf-8"
    assert r.headers["content-disposition"] == f'attachment; filename="{exam["id"]}.ics"'
    assert r.text.count("BEGIN:VEVENT") == 1
    assert f"UID:{exam['id']}@dsba-hub" in r.text
    assert "DTSTART;VALUE=DATE:20261210" in r.text
    assert "BEGIN:VALARM" in r.text  # a reminder the day before an exam
    assert "REFRESH-INTERVAL" not in r.text  # a file to import, not a subscription
    assert client_for().get(f"{EVENTS}/no-such-event.ics").status_code == 404

    feed = client_for().get(f"{API}/calendar/feed.ics", params={"type": "exam"}).text
    assert "Statistics exam" in feed
    assert "Study group" not in feed
    assert "REFRESH-INTERVAL" in feed


def test_feeds_are_cached_publicly_only_while_the_calendar_is_on_for_everyone(
    client_for: Clients,
    events: dict[str, CalendarEvent],
    make_user: Callable[..., User],
    set_feature: Callable[..., None],
) -> None:
    exam = events["past-exam"].id
    guest = client_for()
    assert guest.get(f"{API}/calendar/feed.ics").headers["cache-control"] == "public, max-age=900"
    assert guest.get(f"{API}/calendar/events/{exam}.ics").headers["cache-control"] == "public, max-age=900"
    set_feature("calendar", "roles", ["content-manager"])
    manager = client_for(make_user(name="Nadia Manager", roles=("student", "content-manager")))
    for path in ("/calendar/feed.ics", f"/calendar/events/{exam}.ics"):
        r = manager.get(f"{API}{path}")
        assert (r.status_code, r.headers["cache-control"]) == (200, "private, no-store")


def test_a_feed_of_your_own_papers(client_for: Clients, events: dict[str, CalendarEvent], db: Session) -> None:
    """`modules` keeps a module's events to those papers, from any year; the rest follow `year`."""
    db.add(
        CalendarEvent(
            id="other-year-exam",
            date=bahrain_today(),
            title="ST2133 exam",
            type="exam",
            year=2,
            module_id="advanced-stats-distribution",
            unit_code="ST2133",
        )
    )
    db.add(CalendarEvent(id="year2-day", date=bahrain_today(), title="Year 2 welcome", type="event", year=2))
    db.commit()
    feed = f"{API}/calendar/feed.ics"

    def uids(**params: Any) -> list[str]:
        r = client_for().get(feed, params=params)
        assert r.status_code == 200, r.text
        return sorted(line[4:].removesuffix("@dsba-hub") for line in unfold(r.text) if line.startswith("UID:"))

    # a Year 1 student who also sits ST2133: Year 1's dates without a module, and the two papers
    mine = uids(year=1, modules="mathematics,advanced-stats-distribution")
    assert mine == ["break", "mt1186-exam", "other-year-exam", "running-week"]
    # a Year 2 student who doesn't sit ST2134: its mock is left out, Year 2's own day stays
    assert uids(year=2, modules="advanced-stats-distribution") == [
        "break",
        "other-year-exam",
        "past-exam",
        "running-week",
        "year2-day",
    ]
    r = client_for().get(feed, params={"year": 1, "modules": "mathematics", "type": "exam"})
    assert "X-WR-CALNAME:DSBA Hub: Year 1\\, your papers\\, exams" in r.text
    assert 'filename="dsba-hub-year-1-papers-exams.ics"' in r.headers["content-disposition"]
    for bad in ("Mathematics", "a,,b", ",a", "a b", "x" * 65):
        assert client_for().get(feed, params={"modules": bad}).status_code == 422


def test_dates_that_tell_you_enough(client_for: Clients, moderator: User, modules: dict[str, Module]) -> None:
    """An exam's length, its rules, and where the date comes from and when it was checked."""
    rep = client_for(moderator)
    body = {
        "date": "2026-10-19",
        "title": "EC1002 Introduction to Economics (October exam)",
        "type": "exam",
        "moduleId": "economics",
        "time": "10:00 AM",
        "place": "BIBF exam hall",
        "duration": "3 hours",
        "rules": "Bring your student ID. No calculators.",
        "source": "UoL October 2026 exam timetable",
        "checkedOn": "2026-10-10",
    }
    r = rep.post(EVENTS, json=body)
    assert r.status_code == 201, r.text
    made = r.json()
    assert (made["duration"], made["rules"], made["source"], made["checkedOn"]) == (
        "3 hours",
        "Bring your student ID. No calculators.",
        "UoL October 2026 exam timetable",
        "2026-10-10",
    )
    text = client_for().get(f"{API}/calendar/events/{made['id']}.ics").text.replace("\r\n ", "")
    assert "Length: 3 hours." in text
    assert "Rules: Bring your student ID. No calculators." in text
    assert "Source: UoL October 2026 exam timetable\\, checked 10 October 2026." in text
    cleared = rep.patch(f"{EVENTS}/{made['id']}", json={"rules": None, "duration": ""}).json()
    assert (cleared["rules"], cleared["duration"], cleared["source"]) == (None, None, "UoL October 2026 exam timetable")
    assert rep.post(EVENTS, json={**body, "rules": "x" * 301}).status_code == 422


def test_careers_dates_need_their_source(client_for: Clients, moderator: User) -> None:
    """An application window for a Career Navigator employer, shown only with where it comes from."""
    rep = client_for(moderator)
    body = {
        "date": "2026-11-01",
        "endDate": "2026-11-30",
        "title": "NBB EVOLVE applications",
        "type": "careers",
        "employerId": "nbb",
    }
    assert rep.post(EVENTS, json=body).json()["error"]["fields"] == {
        "source": "Add where this date comes from. Careers dates show only with their source."
    }
    r = rep.post(EVENTS, json={**body, "source": "https://nbbonline.com/about/careers/"})
    assert r.status_code == 201, r.text
    made = r.json()
    assert (made["type"], made["employerId"], made["year"]) == ("careers", "nbb", None)
    assert rep.patch(f"{EVENTS}/{made['id']}", json={"source": None}).status_code == 422
    assert rep.post(EVENTS, json={**body, "source": "x", "employerId": "NBB!"}).status_code == 422
    assert "CATEGORIES:Careers" in client_for().get(f"{API}/calendar/feed.ics").text


# ── resits ───────────────────────────────────────────────────────────────────────────────────


@pytest.fixture
def sittings(db: Session, modules: dict[str, Module], today: dt.date) -> dict[str, CalendarEvent]:
    """MT1186 (Year 1) with its resit in two days and its main sitting later; a final-year module's resit."""

    def day(n: int) -> dt.date:
        return today + dt.timedelta(days=n)

    rows = [
        CalendarEvent(
            id="mt1186-resit",
            date=day(2),
            title="MT1186 Mathematical Methods (October resit)",
            type="exam",
            year=1,
            module_id="mathematics",
            unit_code="MT1186",
            resit=True,
        ),
        CalendarEvent(
            id="mt1186-main",
            date=day(50),
            title="MT1186 Mathematical Methods exam",
            type="exam",
            year=1,
            module_id="mathematics",
            unit_code="MT1186",
        ),
        CalendarEvent(
            id="ml-resit",
            date=day(3),
            title="Machine Learning exam",
            type="exam",
            year=3,
            module_id="machine-learning",
            resit=True,
        ),
    ]
    db.add_all(rows)
    db.commit()
    return {e.id: e for e in rows}


def test_a_resit_is_for_the_next_year_and_those_resitting(
    client_for: Clients, sittings: dict[str, CalendarEvent]
) -> None:
    guest = client_for()
    assert ids(guest, EVENTS) == ["mt1186-resit", "ml-resit", "mt1186-main"]  # every year: every sitting
    assert ids(guest, EVENTS, year=1) == ["mt1186-main"]  # the module's own year: its main sitting only
    assert ids(guest, EVENTS, year=2) == ["mt1186-resit"]  # the year after: the resit
    assert ids(guest, EVENTS, year=3) == []  # a final-year resit is for nobody by default
    assert ids(guest, EVENTS, year=3, resits="machine-learning,mathematics") == ["mt1186-resit", "ml-resit"]
    assert ids(guest, EVENTS, year=1, resits="mathematics") == ["mt1186-resit", "mt1186-main"]
    assert guest.get(EVENTS, params={"year": 1, "resits": "Not An Id"}).status_code == 422
    upcoming = guest.get(f"{API}/calendar/upcoming", params={"year": 1, "limit": 5}).json()
    assert [e["id"] for e in upcoming] == ["mt1186-main"]
    upcoming = guest.get(f"{API}/calendar/upcoming", params={"year": 3, "resits": "machine-learning"}).json()
    assert [(e["id"], e["resit"]) for e in upcoming] == [("ml-resit", True)]
    feed = guest.get(f"{API}/calendar/feed.ics", params={"year": 1}).text
    assert "October resit" not in feed
    feed = guest.get(f"{API}/calendar/feed.ics", params={"year": 2}).text
    assert "SUMMARY:MT1186 Mathematical Methods (October resit)" in feed
    assert "Resit for Year 2 and anyone resitting" in feed.replace("\r\n ", "")
    feed = guest.get(f"{API}/calendar/feed.ics", params={"year": 3, "resits": "machine-learning"}).text
    assert "SUMMARY:Machine Learning exam (resit)" in feed


def test_a_feed_of_your_papers_has_the_resits_for_your_year(
    client_for: Clients, sittings: dict[str, CalendarEvent]
) -> None:
    feed = client_for().get(f"{API}/calendar/feed.ics", params={"year": 1, "modules": "mathematics"}).text
    assert "MT1186 Mathematical Methods exam" in feed
    assert "October resit" not in feed
    feed = client_for().get(f"{API}/calendar/feed.ics", params={"year": 2, "modules": "econometrics"}).text
    assert "October resit" in feed  # Year 1's resit, whatever papers Year 2 sits
    assert "MT1186 Mathematical Methods exam" not in feed


def test_an_exam_is_a_resit_as_marked_or_as_its_month_says(
    client_for: Clients, moderator: User, modules: dict[str, Module]
) -> None:
    rep = client_for(moderator)
    body = {"title": "Mathematical Methods exam", "type": "exam", "moduleId": "mathematics"}
    assert rep.post(EVENTS, json={**body, "date": "2027-10-21"}).json()["resit"] is True  # the October sitting
    assert rep.post(EVENTS, json={**body, "date": "2027-05-12"}).json()["resit"] is False  # the May sitting
    assert rep.post(EVENTS, json={**body, "date": "2027-10-22", "resit": False}).json()["resit"] is False
    assert rep.post(EVENTS, json={**body, "date": "2027-05-13", "resit": True}).json()["resit"] is True
    mock = {"title": "Maths mock", "type": "mock", "date": "2027-10-23"}
    assert rep.post(EVENTS, json=mock).json()["resit"] is False  # only exams are resits
    r = rep.post(EVENTS, json={**mock, "resit": True})
    assert r.status_code == 422
    assert r.json()["error"]["fields"] == {
        "resit": "Only an exam can be a resit. Change the type to exam, or untick Resit."
    }


def test_reps_mark_an_exam_main_or_resit(
    client_for: Clients, moderator: User, sittings: dict[str, CalendarEvent], db: Session
) -> None:
    rep = client_for(moderator)
    url = f"{EVENTS}/mt1186-main"
    r = rep.patch(url, json={"resit": True})
    assert (r.status_code, r.json()["resit"]) == (200, True)
    assert rep.patch(url, json={"type": "mock"}).json()["resit"] is False  # no longer an exam: no longer a resit
    assert rep.patch(url, json={"type": "exam", "resit": True}).json()["resit"] is True
    assert rep.patch(url, json={"type": "mock", "resit": True}).status_code == 422
    db.expire_all()
    assert db.get(CalendarEvent, "mt1186-main").type == "exam"  # type: ignore[union-attr]
    entry = db.scalars(
        select(AuditEntry).where(AuditEntry.target_id == "mt1186-main").order_by(AuditEntry.id.desc())
    ).first()
    assert entry is not None
    assert entry.data["fields"] == ["type", "resit"]


def test_a_resits_change_is_told_to_those_it_is_for(
    client_for: Clients,
    moderator: User,
    make_user: Callable[..., User],
    sittings: dict[str, CalendarEvent],
    db: Session,
) -> None:
    from app.models import Notification

    year1 = make_user(name="Year One", year=1)
    year2 = make_user(name="Year Two", year=2)
    year3 = make_user(name="Year Three", year=3)
    resitting = make_user(name="Resitting", year=3)
    resitting.resits = ["mathematics", "machine-learning"]
    db.commit()
    rep = client_for(moderator)
    r = rep.patch(f"{EVENTS}/mt1186-resit", json={"place": "Hall B", "notify": True})
    assert (r.json()["notice"], r.json()["told"]) == ("sent", 2)
    r = rep.patch(f"{EVENTS}/ml-resit", json={"place": "Hall C", "notify": True})
    assert (r.json()["notice"], r.json()["told"]) == ("sent", 1)

    def told(u: User) -> int:
        q = select(Notification).where(Notification.user_id == u.id, Notification.kind == "date_changed")
        return len(list(db.scalars(q)))

    assert [told(u) for u in (year1, year2, year3, resitting)] == [0, 1, 0, 2]
