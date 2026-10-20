"""The exam timetable in one paste (reps): the preview, the bulk save, one notice a year, the audit and the limit."""

from __future__ import annotations

import datetime as dt
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.time import bahrain_today, utcnow
from app.models import AuditEntry, CalendarEvent, Module, Notification, User
from tests.content.conftest import API

Clients = Callable[..., TestClient]
PREVIEW = f"{API}/calendar/timetable/preview"
SAVE = f"{API}/calendar/timetable"
SOURCE = "Exam timetable email, 20 October"


def day(n: int) -> dt.date:
    return bahrain_today() + dt.timedelta(days=n)


def slash(d: dt.date) -> str:
    return f"{d.day:02d}/{d.month:02d}/{d.year}"


@pytest.fixture
def exams(db: Session, modules: dict[str, Module]) -> dict[str, CalendarEvent]:
    rows = [
        CalendarEvent(
            id="st2134-exam",
            date=day(12),
            title="Statistical Inference exam",
            type="exam",
            year=2,
            module_id="advanced-stats-inferential",
            unit_code="ST2134",
            sample=True,
        ),
        CalendarEvent(
            id="mt1186-exam",
            date=day(14),
            title="Mathematical Methods exam",
            type="exam",
            year=1,
            module_id="mathematics",
            unit_code="MT1186",
            time="9:00 AM",
            place="Hall B",
        ),
        CalendarEvent(
            id="st2133-exam",
            date=day(15),
            title="Distribution Theory exam",
            type="exam",
            year=2,
            module_id="advanced-stats-distribution",
            unit_code="ST2133",
            time="2:00 PM",
            place="Hall A",
        ),
        # last session's: too far from the new date to be the same exam
        CalendarEvent(
            id="ec1002-old",
            date=day(-150),
            title="Economics exam",
            type="exam",
            year=1,
            module_id="economics",
            unit_code="EC1002",
        ),
    ]
    db.add_all(rows)
    db.commit()
    return {e.id: e for e in rows}


def paste() -> str:
    return (
        "Unit code\tTitle\tDate\tTime\tVenue\n"
        f"ST2134\tAdvanced Statistics: Statistical Inference\t{slash(day(13))}\t10:00 - 13:00\tBIBF Hall A\n"
        f"MT1186\tMathematical Methods\t{slash(day(14))}\t09:00\tHall B\n"
        f"ec1002\tIntroduction to Economics\t{slash(day(16))}\t14:00\tRoom 204\n"
        f"ST2133\tAdvanced Statistics: Distribution Theory\t{slash(day(15))}\t\tHall C\n"
    )


def preview(c: TestClient, **body: Any) -> list[dict[str, Any]]:
    r = c.post(PREVIEW, json=body)
    assert r.status_code == 200, r.text
    out: list[dict[str, Any]] = r.json()["rows"]
    return out


def test_the_preview_says_what_each_row_will_do(
    client_for: Clients, moderator: User, exams: dict[str, CalendarEvent]
) -> None:
    rows = preview(client_for(moderator), text=paste())
    assert [(r["line"], r["unitCode"], r["action"]) for r in rows] == [
        (2, "ST2134", "update"),
        (3, "MT1186", "same"),
        (4, "EC1002", "new"),  # the code as typed, matched; last session's exam is too far off
        (5, "ST2133", "update"),
    ]
    st = rows[0]
    assert (st["date"], st["time"], st["place"]) == (day(13).isoformat(), "10:00 AM to 1:00 PM", "BIBF Hall A")
    assert (st["eventId"], st["moduleId"], st["year"]) == ("st2134-exam", "advanced-stats-inferential", 2)
    assert st["was"] == {"date": day(12).isoformat(), "time": None, "place": None, "sample": True}
    assert st["text"].startswith("ST2134\t")
    assert rows[2]["eventId"] is None
    assert rows[2]["was"] is None
    assert rows[3]["time"] is None  # no time in the row: the exam keeps its own
    assert all(r["problems"] == [] for r in rows)


def test_the_preview_flags_unknown_codes_duplicates_and_missing_dates(
    client_for: Clients, moderator: User, exams: dict[str, CalendarEvent]
) -> None:
    text = (
        f"ZZ9999 {slash(day(13))} 10:00 Hall A\n"
        f"ST2134 {slash(day(13))} 10:00 Hall A\n"
        f"ST2134 {slash(day(14))} 14:00 Hall B\n"
        "EC1002 10:00 Room 4\n"
        f"Statistics {slash(day(20))} 10:00 Hall D\n"
    )
    rows = preview(client_for(moderator), text=text)
    assert [r["action"] for r in rows] == ["fix"] * 5
    assert rows[0]["problems"] == ["No module has the code ZZ9999. Check it, or add the code to the module in Manage."]
    assert rows[1]["problems"] == ["ST2134 is in the timetable more than once. Keep one row."]
    assert rows[3]["problems"] == ["No date. Add it."]
    assert rows[4]["problems"] == ["No module code. Add it."]


def test_the_preview_checks_fixed_rows(client_for: Clients, moderator: User, exams: dict[str, CalendarEvent]) -> None:
    rows = preview(
        client_for(moderator),
        rows=[
            {"unitCode": "st2134", "date": day(13).isoformat(), "time": "10:00 AM", "place": "Hall A"},
            {"unitCode": "S2134", "date": day(13).isoformat()},
        ],
    )
    assert (rows[0]["unitCode"], rows[0]["action"], rows[0]["line"]) == ("ST2134", "update", None)
    assert rows[1]["problems"] == ["S2134 isn't a module code. Codes look like ST2134."]


def test_the_preview_needs_text_or_rows(client_for: Clients, moderator: User, modules: dict[str, Module]) -> None:
    c = client_for(moderator)
    assert c.post(PREVIEW, json={}).status_code == 422
    assert c.post(PREVIEW, json={"text": "x", "rows": []}).status_code == 422
    r = c.post(PREVIEW, json={"text": "Exam timetable\nGood luck"})
    assert r.status_code == 422
    assert r.json()["error"]["message"].startswith("No exams found.")
    assert c.post(PREVIEW, json={"text": "x" * 20_001}).status_code == 422
    assert c.post(PREVIEW, json={"rows": [{"unitCode": "ST2134"}] * 81}).status_code == 422


def test_only_reps_paste_the_timetable(
    client_for: Clients, student: User, exams: dict[str, CalendarEvent], db: Session
) -> None:
    assert client_for().post(PREVIEW, json={"text": paste()}).status_code == 401
    assert client_for(student).post(PREVIEW, json={"text": paste()}).status_code == 403
    body = {"rows": [{"unitCode": "ST2134", "date": day(13).isoformat()}], "source": SOURCE}
    assert client_for(student).post(SAVE, json=body).status_code == 403
    assert db.get(CalendarEvent, "st2134-exam").date == day(12)  # type: ignore[union-attr]


def save_body(rows: list[dict[str, Any]], **extra: Any) -> dict[str, Any]:
    keep = ("unitCode", "date", "time", "place")
    return {"rows": [{k: r[k] for k in keep} for r in rows], "source": SOURCE, **extra}


def notices(db: Session, user: User) -> list[Notification]:
    q = select(Notification).where(Notification.user_id == user.id, Notification.kind == "date_changed")
    return list(db.scalars(q))


def test_saving_changes_every_exam_at_once_and_tells_each_year_once(
    client_for: Clients,
    moderator: User,
    student: User,
    other: User,
    make_user: Callable[..., User],
    exams: dict[str, CalendarEvent],
    db: Session,
) -> None:
    rep = client_for(moderator)
    rows = preview(rep, text=paste())
    r = rep.post(SAVE, json=save_body(rows))
    assert r.status_code == 200, r.text
    saved = r.json()
    assert (saved["created"], saved["updated"], saved["unchanged"]) == (1, 2, 1)
    by_year = {n["year"]: n for n in saved["notices"]}
    assert by_year[2]["exams"] == 2
    assert by_year[2]["notice"] == "sent"
    assert by_year[1]["exams"] == 1
    assert by_year[1]["notice"] == "sent"

    db.expire_all()
    st = db.get(CalendarEvent, "st2134-exam")
    assert st is not None
    assert (st.date, st.time, st.place, st.sample) == (day(13), "10:00 AM to 1:00 PM", "BIBF Hall A", False)
    assert (st.source, st.checked_on) == (SOURCE, bahrain_today())
    dist = db.get(CalendarEvent, "st2133-exam")
    assert dist is not None
    assert (dist.time, dist.place) == ("2:00 PM", "Hall C")  # no time in the row: kept
    new = db.scalar(select(CalendarEvent).where(CalendarEvent.module_id == "economics", CalendarEvent.date == day(16)))
    assert new is not None
    assert (new.title, new.type, new.year, new.unit_code, new.time, new.place) == (
        "Introduction to Economics exam",
        "exam",
        1,
        "EC1002",
        "2:00 PM",
        "Room 204",
    )

    # one notice for Year 2 listing both of its exams, one for Year 1; the rep isn't told about their own save
    [year2] = notices(db, student)
    assert year2.title == "Exam timetable for Year 2: 2 exams"
    assert year2.body is not None
    assert "ST2134 Statistical Inference exam:" in year2.body
    assert "BIBF Hall A" in year2.body
    assert "ST2133" in year2.body
    assert year2.url == "/calendar?types=exam"
    [year1] = notices(db, other)
    assert year1.title == "Exam timetable for Year 1: 1 exam"
    assert notices(db, moderator) == []
    assert notices(db, make_user(name="No Year", year=None)) == []

    audit = db.scalar(select(AuditEntry).where(AuditEntry.action == "calendar.timetable"))
    assert audit is not None
    assert audit.data["created"] == 1
    assert audit.data["updated"] == 2
    assert set(audit.data["events"]) == {"st2134-exam", "st2133-exam", new.id}
    assert audit.data["told"] == 2

    # the same day again: nobody is told twice
    rows = preview(rep, rows=[{"unitCode": "ST2134", "date": day(13).isoformat(), "place": "Hall Z"}])
    r = rep.post(SAVE, json=save_body(rows))
    assert r.json()["notices"] == [{"year": 2, "exams": 1, "notice": "limit", "told": 0}]
    assert len(notices(db, student)) == 1


def test_a_row_to_fix_saves_nothing(
    client_for: Clients, moderator: User, exams: dict[str, CalendarEvent], db: Session
) -> None:
    body = {
        "rows": [
            {"unitCode": "ST2134", "date": day(13).isoformat(), "time": "10:00 AM"},
            {"unitCode": "ZZ9999", "date": day(13).isoformat()},
            {"unitCode": "MT1186"},
        ],
        "source": SOURCE,
    }
    r = client_for(moderator).post(SAVE, json=body)
    assert r.status_code == 422
    err = r.json()["error"]
    assert err["message"] == "Fix 2 rows first. Nothing was saved."
    assert set(err["fields"]) == {"rows.1", "rows.2"}
    db.expire_all()
    st = db.get(CalendarEvent, "st2134-exam")
    assert st is not None
    assert st.date == day(12)
    assert st.time is None
    assert db.scalar(select(func.count()).select_from(AuditEntry).where(AuditEntry.action == "calendar.timetable")) == 0


def test_saving_quietly_tells_nobody(
    client_for: Clients, moderator: User, student: User, exams: dict[str, CalendarEvent], db: Session
) -> None:
    body = {"rows": [{"unitCode": "ST2134", "date": day(13).isoformat()}], "source": SOURCE, "notify": False}
    r = client_for(moderator).post(SAVE, json=body)
    assert r.status_code == 200, r.text
    assert r.json()["notices"] == []
    assert notices(db, student) == []


def test_the_source_is_needed(client_for: Clients, moderator: User, exams: dict[str, CalendarEvent]) -> None:
    body = {"rows": [{"unitCode": "ST2134", "date": day(13).isoformat()}], "source": " "}
    assert client_for(moderator).post(SAVE, json=body).status_code == 422
    assert client_for(moderator).post(SAVE, json={"rows": [], "source": SOURCE}).status_code == 422


def test_ten_saves_an_hour(client_for: Clients, moderator: User, exams: dict[str, CalendarEvent], db: Session) -> None:
    db.add_all(
        AuditEntry(actor_id=moderator.id, action="calendar.timetable", created_at=utcnow(), data={}) for _ in range(10)
    )
    db.commit()
    body = {"rows": [{"unitCode": "ST2134", "date": day(13).isoformat()}], "source": SOURCE}
    r = client_for(moderator).post(SAVE, json=body)
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "rate_limited"
