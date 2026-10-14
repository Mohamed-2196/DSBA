"""The Sunday summary (IDEA-21): an opt-in email for each year with the week's exams and deadlines, new files, open
questions and the newsletter; queued once per person per week by the mail worker on Sunday morning; the same text
for reps to paste into their year's group."""

from __future__ import annotations

import datetime as dt
import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.time import BAHRAIN, bahrain_today, utcnow
from app.models import (
    CalendarEvent,
    EmailOutbox,
    ForumThread,
    IssueStatus,
    ItemSource,
    ItemStatus,
    LibraryItem,
    Module,
    NewsletterIssue,
    OutboxStatus,
    User,
)
from app.services import summary
from tests.accounts.conftest import API, Deliver, Outbox

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]
NEXT_SUNDAY = summary.week_of(bahrain_today()) + dt.timedelta(days=7)  # what was posted today is "this week's"


@pytest.fixture(autouse=True)
def summary_on(set_feature: Callable[..., None]) -> None:
    """The Sunday summary arrives switched off; these tests switch it on for everyone."""
    set_feature("summary", "everyone")


@pytest.fixture
def week(db: Session, make_user: MakeUser) -> Module:
    """Year 2's week: a mock (its title holding a link), a file, an unanswered question, and an issue for everyone.
    Year 1 has only the issue. -> Year 2's module."""
    m = Module(id=f"sum-{uuid.uuid4().hex[:6]}", unit_code="ST2134", name="Advanced stats", short_name="Stats", year=2)
    author = make_user(name="Asker", year=2)
    db.add(m)
    db.flush()
    db.add_all(
        [
            CalendarEvent(
                id=f"mock-{uuid.uuid4().hex[:6]}",
                title="Mock exam, see dsba-hub-login.example/code",
                type="mock",
                date=NEXT_SUNDAY + dt.timedelta(days=2),
                time="12:30 PM",
                year=2,
                unit_code="ST2134",
            ),
            CalendarEvent(
                id=f"revision-{uuid.uuid4().hex[:6]}",
                title="Revision session",
                type="revision",
                date=NEXT_SUNDAY + dt.timedelta(days=1),
                year=2,
            ),
            LibraryItem(
                slug=f"week-3-{uuid.uuid4().hex[:6]}",
                source=ItemSource.link,
                kind="notes",
                title="Week 3 notes",
                url="https://example.com/notes",
                module_id=m.id,
                status=ItemStatus.published,
                published_at=utcnow(),
            ),
            ForumThread(
                slug=f"mgf-{uuid.uuid4().hex[:6]}",
                title="How do I find the MGF?",
                body="...",
                category="year-2",
                author_id=author.id,
            ),
            NewsletterIssue(
                slug=f"issue-{uuid.uuid4().hex[:6]}",
                number=7,
                title="Exam season",
                date=bahrain_today(),
                status=IssueStatus.published,
                published_at=utcnow(),
            ),
        ]
    )
    db.commit()
    return m


def _opted_in(make_user: MakeUser, db: Session, email: str, year: int | None) -> User:
    u = make_user(email=email, name=email.split("@")[0], year=year)
    u.preferences = {"email_weekly_summary": True}
    db.commit()
    return u


def _summaries(db: Session) -> list[EmailOutbox]:
    return list(
        db.scalars(
            select(EmailOutbox).where(EmailOutbox.kind == "weekly_summary").execution_options(populate_existing=True)
        )
    )


def test_week_of_and_when_it_is_due() -> None:
    assert summary.week_of(dt.date(2026, 10, 18)) == dt.date(2026, 10, 18)  # a Sunday
    assert summary.week_of(dt.date(2026, 10, 14)) == dt.date(2026, 10, 11)
    assert summary.week_of(dt.date(2026, 10, 17)) == dt.date(2026, 10, 11)
    sunday = dt.datetime(2026, 10, 18, tzinfo=BAHRAIN)
    assert not summary.due(sunday + dt.timedelta(hours=7, minutes=59))
    assert summary.due(sunday + dt.timedelta(hours=8))
    assert not summary.due(sunday + dt.timedelta(days=1, hours=9))


def test_the_summary_goes_once_a_week_to_those_who_opted_in(
    week: Module, make_user: MakeUser, db: Session, outbox: Outbox, deliver: Deliver
) -> None:
    _opted_in(make_user, db, "sara@example.com", 2)
    _opted_in(make_user, db, "layla@example.com", 1)
    _opted_in(make_user, db, "alumna@example.com", None)  # no year: no summary
    make_user(email="omar@example.com", name="Omar", year=2)  # didn't opt in

    assert summary.send_week(db, NEXT_SUNDAY) == 2
    db.commit()
    assert summary.send_week(db, NEXT_SUNDAY) == 0  # once a week, however often it runs
    assert {row.to_address for row in _summaries(db)} == {"sara@example.com", "layla@example.com"}

    deliver()
    [mail] = outbox.to("sara@example.com")
    assert mail.subject is not None
    assert mail.subject.startswith("Your week in DSBA Hub, Year 2: ")
    text = mail.text
    for heading in ("Exams and deadlines this week", "New in the library", "Questions you could answer"):
        assert heading in text
    assert "ST2134 Mock exam, see [link] (12:30 PM)" in text  # people's links are taken out (SEC-17)
    assert "dsba-hub-login" not in text
    assert "Revision session" not in text  # only exams, mocks and deadlines
    assert "Week 3 notes" in text
    assert "How do I find the MGF?" in text
    assert "Issue 7: Exam season" in text
    assert "?from=summary" in text
    assert "&from=summary" in text
    assert "“Sunday summary” is on in Your account" in text
    assert "/account#acct-emails" in text
    [first_years] = outbox.to("layla@example.com")
    assert "Issue 7: Exam season" in first_years.text
    assert "Week 3 notes" not in first_years.text
    assert len(outbox.to("sara@example.com")) == 1


def test_an_empty_week_sends_nothing(make_user: MakeUser, db: Session) -> None:
    _opted_in(make_user, db, "sara@example.com", 3)
    assert summary.send_week(db, NEXT_SUNDAY + dt.timedelta(days=70)) == 0


def test_nobody_gets_it_while_it_is_switched_off(
    week: Module, make_user: MakeUser, db: Session, set_feature: Callable[..., None]
) -> None:
    _opted_in(make_user, db, "sara@example.com", 2)
    set_feature("summary", "off")
    assert summary.send_week(db, NEXT_SUNDAY) == 0


def test_turning_it_off_before_it_goes_cancels_it(
    week: Module, make_user: MakeUser, db: Session, outbox: Outbox, deliver: Deliver
) -> None:
    sara = _opted_in(make_user, db, "sara@example.com", 2)
    summary.send_week(db, NEXT_SUNDAY)
    sara.preferences = {"email_weekly_summary": False}
    db.commit()
    deliver()
    assert outbox.to("sara@example.com") == []
    assert [row.status for row in _summaries(db)] == [OutboxStatus.cancelled]


def test_the_mail_worker_queues_it_on_sunday_morning(week: Module, make_user: MakeUser, db: Session) -> None:
    _opted_in(make_user, db, "sara@example.com", 2)

    @contextmanager
    def sessions() -> Iterator[Session]:
        yield db

    saturday = dt.datetime.combine(NEXT_SUNDAY - dt.timedelta(days=1), dt.time(9), tzinfo=BAHRAIN)
    assert summary.send_due(sessions, now=saturday) == 0
    sunday = dt.datetime.combine(NEXT_SUNDAY, dt.time(9), tzinfo=BAHRAIN)
    assert summary.send_due(sessions, now=sunday) == 1
    assert summary.send_due(sessions, now=sunday + dt.timedelta(minutes=10)) == 0


def test_reps_see_the_text_to_paste_and_students_do_not(
    week: Module, client_for: ClientFor, make_user: MakeUser, db: Session
) -> None:
    _opted_in(make_user, db, "sara@example.com", 2)
    rep = make_user(name="Rep", roles=("student", "rep"), year=2)
    r = client_for(rep).get(f"{API}/summary/preview", params={"year": 2})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["year"] == 2
    assert body["subscribers"] == 1
    assert body["empty"] is False
    assert body["weekOf"] == summary.week_of(bahrain_today()).isoformat()
    assert "Questions you could answer" in body["text"]
    assert "Your account" not in body["text"]  # no personal footer in what's pasted to a group
    student = make_user(name="Student", year=2)
    assert client_for(student).get(f"{API}/summary/preview", params={"year": 2}).status_code == 403
    assert client_for(rep).get(f"{API}/summary/preview", params={"year": 4}).status_code == 422


def test_the_command_previews_and_sends(
    week: Module,
    make_user: MakeUser,
    db: Session,
    monkeypatch: pytest.MonkeyPatch,
    capsys: pytest.CaptureFixture[str],
) -> None:
    from app import cli

    @contextmanager
    def sessions() -> Iterator[Session]:
        yield db

    monkeypatch.setattr(cli, "get_sessionmaker", lambda: sessions)
    _opted_in(make_user, db, "sara@example.com", 2)
    assert cli.main(["weekly-summary", "--preview", "2"]) == 0
    assert "Questions you could answer" in capsys.readouterr().out
    assert _summaries(db) == []
    assert cli.main(["weekly-summary"]) == 0
    assert capsys.readouterr().out == "queued 1 Sunday summary\n"
    assert cli.main(["weekly-summary"]) == 0
    assert capsys.readouterr().out == "queued 0 Sunday summaries\n"
