"""Telling students when a date changes: a rep's edit with "Tell Year 2" ticked sends the cohort, and anyone
with the event on their board, a notification, and an email to those who keep "Date changes" on. Only exams, mocks
and deadlines, and at most once per event a day."""

from __future__ import annotations

import uuid
from collections.abc import Callable
from datetime import date, timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import utcnow
from app.models import (
    AuditEntry,
    Board,
    BoardCard,
    BoardColumn,
    CalendarEvent,
    EmailOutbox,
    Notification,
    OutboxStatus,
    User,
)
from app.services.notify import EMAIL_MAX_PER_HOUR, notify_all
from tests.accounts.conftest import API, Deliver, Outbox

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]


@pytest.fixture
def rep(make_user: MakeUser) -> User:
    return make_user(email="rep@example.com", name="Maryam Rep", roles=("student", "rep"), year=3)


def _event(db: Session, *, type_: str = "mock", year: int | None = 2, sample: bool = False) -> CalendarEvent:
    e = CalendarEvent(
        id=f"2026-11-10-st2134-mock-{uuid.uuid4().hex[:6]}",
        title="Mock exam",
        type=type_,
        date=date(2026, 11, 10),
        time="12:30 PM",
        place="Auditorium",
        year=year,
        unit_code="ST2134",
        sample=sample,
    )
    db.add(e)
    db.commit()
    return e


def _told(db: Session, user: User) -> list[Notification]:
    return list(
        db.scalars(select(Notification).where(Notification.user_id == user.id, Notification.kind == "date_changed"))
    )


def _emails(db: Session, user: User) -> list[EmailOutbox]:
    return list(
        db.scalars(
            select(EmailOutbox)
            .where(EmailOutbox.user_id == user.id, EmailOutbox.kind == "date_changed")
            .execution_options(populate_existing=True)
        )
    )


def test_moving_a_mock_tells_its_year_and_whoever_has_it_on_their_board(
    client_for: ClientFor, make_user: MakeUser, rep: User, db: Session, outbox: Outbox, deliver: Deliver
) -> None:
    sara = make_user(email="sara@example.com", name="Sara", year=2)
    omar = make_user(email="omar@example.com", name="Omar", year=1)
    layla = make_user(email="layla@example.com", name="Layla", year=1)
    e = _event(db)
    board = Board(user_id=layla.id, name="Study", color="cobalt", template="study", position=1.0)
    db.add(board)
    db.flush()
    todo = BoardColumn(board_id=board.id, name="To do", position=1.0)
    db.add(todo)
    db.flush()
    db.add(
        BoardCard(
            user_id=layla.id,
            board_id=board.id,
            column_id=todo.id,
            position=1.0,
            title="Mock",
            link_type="event",
            link_id=e.id,
        )
    )
    db.commit()

    r = client_for(rep).patch(f"{API}/calendar/events/{e.id}", json={"date": "2026-11-12", "notify": True})
    assert r.status_code == 200, r.text
    assert (r.json()["notice"], r.json()["told"], r.json()["date"]) == ("sent", 2, "2026-11-12")

    [n] = _told(db, sara)
    assert n.title == "ST2134 Mock exam moved to Thursday 12 November"
    assert n.body == (
        "Now: Thursday 12 November, 12:30 PM, Auditorium. It was Tuesday 10 November, 12:30 PM, Auditorium."
    )
    assert n.url == f"/calendar?date=2026-11-12&event={e.id}"
    assert len(_told(db, layla)) == 1  # on her board, though she's in Year 1
    assert _told(db, omar) == []
    assert _told(db, rep) == []
    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "calendar.update"))
    assert entry is not None
    assert entry.data["told"] == 2

    deliver()
    [mail] = outbox.to("sara@example.com")
    assert mail.subject == "ST2134 Mock exam moved to Thursday 12 November"
    assert "“Date changes” is on in Your account" in mail.text
    assert "/account#acct-emails" in mail.text

    # a second change the same day tells nobody: at most one notice per event a day
    r = client_for(rep).patch(f"{API}/calendar/events/{e.id}", json={"place": "Hall B", "notify": True})
    assert (r.json()["notice"], r.json()["told"], r.json()["place"]) == ("limit", 0, "Hall B")
    assert len(_told(db, sara)) == 1


def test_a_new_time_and_a_confirmation_are_told_too(
    client_for: ClientFor, make_user: MakeUser, rep: User, db: Session
) -> None:
    sara = make_user(name="Sara", year=2)
    timed, unconfirmed = _event(db), _event(db, sample=True)
    c = client_for(rep)
    c.patch(f"{API}/calendar/events/{timed.id}", json={"time": "9:00 AM", "notify": True})
    c.patch(f"{API}/calendar/events/{unconfirmed.id}", json={"sample": False, "notify": True})
    titles = sorted(n.title for n in _told(db, sara))
    assert titles == ["ST2134 Mock exam is confirmed", "ST2134 Mock exam: new time"]


def test_nothing_is_told_unless_asked_and_it_matters(
    client_for: ClientFor, make_user: MakeUser, rep: User, db: Session
) -> None:
    sara = make_user(name="Sara", year=2)
    mock, revision = _event(db), _event(db, type_="revision")
    c = client_for(rep)
    cases = [
        (mock.id, {"date": "2026-11-11"}),  # notify not ticked
        (mock.id, {"title": "Mock exam (paper 1)", "notify": True}),  # a new title: nothing to tell
        (mock.id, {"sample": True, "notify": True}),  # marked unconfirmed: nothing to tell
        (revision.id, {"date": "2026-11-11", "notify": True}),  # revision sessions change quietly
    ]
    for event_id, patch in cases:
        r = c.patch(f"{API}/calendar/events/{event_id}", json=patch)
        assert (r.status_code, r.json()["notice"]) == (200, "none"), patch
    assert _told(db, sara) == []


def test_an_event_for_everyone_tells_every_student_with_a_year(
    client_for: ClientFor, make_user: MakeUser, rep: User, db: Session
) -> None:
    first, alumna = make_user(name="First", year=1), make_user(name="Alumna", year=None)
    e = _event(db, type_="deadline", year=None)
    r = client_for(rep).patch(f"{API}/calendar/events/{e.id}", json={"date": "2026-11-20", "notify": True})
    assert r.json()["notice"] == "sent"
    assert len(_told(db, first)) == 1
    assert _told(db, alumna) == []


def test_the_email_follows_its_switch_and_the_calendar_its_switch(
    client_for: ClientFor, make_user: MakeUser, rep: User, db: Session, set_feature: Callable[..., None]
) -> None:
    sara = make_user(name="Sara", year=2)
    sara.preferences = {"email_date_changes": False}
    db.commit()
    e = _event(db)
    client_for(rep).patch(f"{API}/calendar/events/{e.id}", json={"date": "2026-11-11", "notify": True})
    assert len(_told(db, sara)) == 1
    assert _emails(db, sara) == []

    set_feature("calendar", "roles", ["rep"])  # off for students: they aren't told
    other = _event(db)
    r = client_for(rep).patch(f"{API}/calendar/events/{other.id}", json={"date": "2026-11-11", "notify": True})
    assert (r.json()["notice"], r.json()["told"]) == ("sent", 0)
    assert len(_told(db, sara)) == 1


def test_cohort_emails_keep_to_the_hourly_cap(make_user: MakeUser, db: Session) -> None:
    """Security review SEC-17: notify_all() emails nobody who has had EMAIL_MAX_PER_HOUR emails in the last hour."""
    busy, quiet = make_user(name="Busy", year=2), make_user(name="Quiet", year=2)
    assert busy.email is not None
    now = utcnow()
    for i in range(EMAIL_MAX_PER_HOUR):
        db.add(
            EmailOutbox(
                user_id=busy.id,
                kind="thread_reply",
                to_address=busy.email,
                subject=f"Reply {i}",
                body="...",
                status=OutboxStatus.sent,
                created_at=now - timedelta(minutes=5),
            )
        )
    db.commit()
    notify_all(db, "date_changed", "Moved", only=User.id.in_([busy.id, quiet.id]))
    db.commit()
    assert len(_told(db, busy)) == 1
    assert _emails(db, busy) == []
    assert len(_emails(db, quiet)) == 1
