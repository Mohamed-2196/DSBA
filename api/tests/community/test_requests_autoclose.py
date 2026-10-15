"""Requests that close themselves: a paper request matched with a newly published file and confirmed by
the requester or a rep, a date request closed when a rep confirms the date, what each must name, and the switch."""

from __future__ import annotations

import datetime as dt
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.models import (
    AuditEntry,
    CalendarEvent,
    ItemSource,
    ItemStatus,
    LibraryItem,
    Module,
    Notification,
    StudentRequest,
    User,
)
from tests.community.helpers import API

Client = Callable[..., TestClient]
MODULE = "advanced-stats-distribution"
WANTS = {
    "kind": "paper",
    "title": "ST2133 2019 zone B paper",
    "moduleId": MODULE,
    "wantedKind": "past-paper",
    "examYear": 2019,
    "zone": "B",
}


@pytest.fixture(autouse=True)
def switches_on(set_feature: Callable[..., None]) -> None:
    set_feature("requests", "everyone")
    set_feature("requests.autoclose", "everyone")


@pytest.fixture
def unconfirmed(db: Session, modules: dict[str, Module]) -> CalendarEvent:
    event = CalendarEvent(
        id="2026-11-05-st2133-mock",
        date=dt.date(2026, 11, 5),
        title="ST2133 mock",
        type="mock",
        year=2,
        module_id=MODULE,
        sample=True,
    )
    db.add(event)
    db.commit()
    return event


def ask(client: TestClient, **fields: Any) -> dict[str, Any]:
    r = client.post(f"{API}/requests", json={**WANTS, **fields})
    assert r.status_code == 201, r.text
    data: dict[str, Any] = r.json()
    return data


def pending_file(
    db: Session, *, kind: str = "past-paper", exam_year: int | None = 2019, zone: str | None = "B"
) -> LibraryItem:
    item = LibraryItem(
        slug=f"st2133-{kind}-{exam_year}-{zone}".lower(),
        source=ItemSource.file,
        kind=kind,
        title=f"ST2133 {exam_year} zone {zone}",
        module_id=MODULE,
        year=2,
        storage_key="library/test.pdf",
        file_name="test.pdf",
        content_type="application/pdf",
        size_bytes=10,
        exam_year=exam_year,
        zone=zone,
        status=ItemStatus.pending,
    )
    db.add(item)
    db.commit()
    return item


def publish(client: TestClient, item: LibraryItem) -> None:
    r = client.post(f"{API}/library/items/{item.id}/review", json={"decision": "publish"})
    assert r.status_code == 200, r.text


def told(db: Session, user: User) -> list[Notification]:
    return list(
        db.scalars(
            select(Notification)
            .where(Notification.user_id == user.id, Notification.kind == "request_update")
            .order_by(Notification.created_at)
        )
    )


def test_a_published_file_is_found_and_the_requester_confirms_it(
    client_for: Client, db: Session, student: User, classmate: User, moderator: User, modules: dict[str, Module]
) -> None:
    made = ask(client_for(student))
    assert made["found"] is None
    assert (made["wantedKind"], made["examYear"], made["zone"]) == ("past-paper", 2019, "B")
    client_for(classmate).put(f"{API}/requests/{made['id']}/me-too")
    item = pending_file(db)
    publish(client_for(moderator), item)
    seen = client_for(student).get(f"{API}/requests/{made['id']}").json()
    assert seen["status"] == "open"
    assert seen["found"]["id"] == str(item.id)
    assert seen["found"]["slug"] == item.slug
    asked = told(db, student)
    assert len(asked) == 1
    assert asked[0].title.startswith("Is this the file you asked for?")
    assert told(db, classmate) == []  # me-toos hear when it's settled

    # Someone else can't answer for the requester.
    other = client_for(classmate).post(f"{API}/requests/{made['id']}/found", json={"confirm": True})
    assert other.status_code == 403
    done = client_for(student).post(f"{API}/requests/{made['id']}/found", json={"confirm": True})
    assert done.status_code == 200, done.text
    assert done.json()["status"] == "done"
    assert done.json()["found"]["id"] == str(item.id)
    closed = told(db, classmate)
    assert len(closed) == 1
    assert closed[0].body == f"It's in the library: {item.title}"
    assert db.scalar(select(AuditEntry).where(AuditEntry.action == "request.found")) is None  # the requester's own
    again = client_for(student).post(f"{API}/requests/{made['id']}/found", json={"confirm": True})
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "nothing_found"


def test_no_keeps_it_open_for_the_next_file_and_a_rep_may_answer(
    client_for: Client, db: Session, student: User, moderator: User, modules: dict[str, Module]
) -> None:
    made = ask(client_for(student), examYear=None, zone=None)  # any year, any zone
    first = pending_file(db, exam_year=2018, zone="A")
    publish(client_for(moderator), first)
    no = client_for(student).post(f"{API}/requests/{made['id']}/found", json={"confirm": False})
    assert no.status_code == 200
    assert (no.json()["status"], no.json()["found"]) == ("open", None)
    second = pending_file(db, exam_year=2019, zone="B")
    publish(client_for(moderator), second)
    yes = client_for(moderator).post(f"{API}/requests/{made['id']}/found", json={"confirm": True})
    assert yes.status_code == 200
    assert yes.json()["status"] == "done"
    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "request.found"))
    assert entry is not None
    assert entry.data["confirm"] is True


def test_matching_is_conservative(
    client_for: Client, db: Session, student: User, moderator: User, modules: dict[str, Module]
) -> None:
    made = ask(client_for(student))
    plain = ask(client_for(student), title="Any ST2133 paper please", wantedKind=None, examYear=None, zone=None)
    for item in (
        pending_file(db, kind="examiners-report"),  # another kind
        pending_file(db, exam_year=2020),  # another year
        pending_file(db, zone="A"),  # another zone
    ):
        publish(client_for(moderator), item)
    for req in (made, plain):  # a request that doesn't name its file is never matched
        assert client_for(student).get(f"{API}/requests/{req['id']}").json()["found"] is None
    assert told(db, student) == []


def test_a_file_already_in_the_library_is_found_when_asking(
    client_for: Client, db: Session, student: User, moderator: User, modules: dict[str, Module]
) -> None:
    item = pending_file(db)
    publish(client_for(moderator), item)
    made = ask(client_for(student))
    assert made["found"]["id"] == str(item.id)
    [exported] = client_for(student).get(f"{API}/me/export").json()["requests"]
    assert exported["foundItemId"] == str(item.id)
    assert exported["foundAt"] is not None


def test_a_removed_file_is_no_longer_offered(
    client_for: Client, db: Session, student: User, moderator: User, modules: dict[str, Module]
) -> None:
    made = ask(client_for(student))
    item = pending_file(db)
    publish(client_for(moderator), item)
    assert client_for(moderator).delete(f"{API}/library/items/{item.id}").status_code == 204
    assert client_for(student).get(f"{API}/requests/{made['id']}").json()["found"] is None
    r = client_for(student).post(f"{API}/requests/{made['id']}/found", json={"confirm": True})
    assert r.status_code == 409


def test_what_a_request_must_name(
    client_for: Client, student: User, unconfirmed: CalendarEvent, db: Session, modules: dict[str, Module]
) -> None:
    c = client_for(student)

    def code(**fields: Any) -> tuple[int, str]:
        r = c.post(f"{API}/requests", json={**WANTS, **fields})
        return r.status_code, r.json()["error"]["code"] if r.status_code >= 400 else ""

    assert code(kind="fix")[0] == 422  # only papers name a file
    assert code(moduleId=None)[0] == 422  # a file needs its module
    assert code(eventId=unconfirmed.id)[0] == 422  # only date requests name an event
    assert code(examYear=1900)[0] == 422
    ask(c)
    assert code() == (409, "already_asked")  # the same file twice
    date = {"kind": "event", "title": "Is the ST2133 mock on the 5th?", "wantedKind": None, "examYear": None}
    assert code(**date, zone=None, eventId="no-such-date")[0] == 422
    assert code(**date, zone=None, eventId=unconfirmed.id)[0] == 201
    assert code(**date, zone=None, eventId=unconfirmed.id) == (409, "already_asked")
    unconfirmed.sample = False
    db.commit()
    db.execute(delete(StudentRequest))
    db.commit()
    assert code(**date, zone=None, eventId=unconfirmed.id)[0] == 422  # already confirmed


def test_confirming_the_date_closes_its_requests(
    client_for: Client,
    db: Session,
    student: User,
    classmate: User,
    moderator: User,
    unconfirmed: CalendarEvent,
) -> None:
    made = ask(
        client_for(student),
        kind="event",
        title="Is the ST2133 mock on the 5th?",
        wantedKind=None,
        examYear=None,
        zone=None,
        eventId=unconfirmed.id,
    )
    assert made["event"] == {"id": unconfirmed.id, "title": "ST2133 mock", "date": "2026-11-05", "sample": True}
    client_for(classmate).put(f"{API}/requests/{made['id']}/me-too")
    r = client_for(moderator).patch(f"{API}/calendar/events/{unconfirmed.id}", json={"time": "9:00", "sample": False})
    assert r.status_code == 200, r.text
    seen = client_for(student).get(f"{API}/requests/{made['id']}").json()
    assert seen["status"] == "done"
    assert seen["reply"] == "Confirmed: Thursday 5 November, 9:00."
    assert seen["event"]["sample"] is False
    assert [n.title for n in told(db, classmate)] == ["Request done: Is the ST2133 mock on the 5th?"]
    assert len(told(db, student)) == 1
    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "request.status"))
    assert entry is not None
    assert entry.data["via"] == "calendar"


def test_switched_off_nothing_closes_itself(
    client_for: Client,
    db: Session,
    student: User,
    moderator: User,
    unconfirmed: CalendarEvent,
    set_feature: Callable[..., None],
    modules: dict[str, Module],
) -> None:
    set_feature("requests.autoclose", "off")
    made = ask(client_for(student))
    date = ask(
        client_for(student),
        kind="event",
        title="Is the ST2133 mock on the 5th?",
        wantedKind=None,
        examYear=None,
        zone=None,
        eventId=unconfirmed.id,
    )
    publish(client_for(moderator), pending_file(db))
    client_for(moderator).patch(f"{API}/calendar/events/{unconfirmed.id}", json={"sample": False})
    assert client_for(student).get(f"{API}/requests/{made['id']}").json()["found"] is None
    assert client_for(student).get(f"{API}/requests/{date['id']}").json()["status"] == "open"
    r = client_for(student).post(f"{API}/requests/{made['id']}/found", json={"confirm": True})
    assert r.status_code == 404
    assert r.json()["error"]["code"] == "feature_off"


def test_after_a_removed_file_the_next_one_is_found(
    client_for: Client, db: Session, student: User, moderator: User, modules: dict[str, Module]
) -> None:
    made = ask(client_for(student), examYear=None, zone=None)
    gone = pending_file(db, exam_year=2018)
    publish(client_for(moderator), gone)
    client_for(moderator).delete(f"{API}/library/items/{gone.id}")
    later = pending_file(db, exam_year=2019)
    publish(client_for(moderator), later)
    assert client_for(student).get(f"{API}/requests/{made['id']}").json()["found"]["id"] == str(later.id)
