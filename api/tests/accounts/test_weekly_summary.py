"""The Sunday summary: an opt-in email for each year with the week's exams and deadlines, new files, open
questions and the newsletter; queued once per person per week by the mail worker on Sunday morning; the same text
for reps to paste into their year's group."""

from __future__ import annotations

import datetime as dt
import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.access import Box
from app.core.time import BAHRAIN, bahrain_today, utcnow
from app.models import (
    AuditEntry,
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
    eight = dt.time(8)
    assert not summary.due(sunday + dt.timedelta(hours=7, minutes=59), eight)
    assert summary.due(sunday + dt.timedelta(hours=8), eight)
    assert not summary.due(sunday + dt.timedelta(days=1, hours=9), eight)


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


# ── its words ────────────────────────────────────────────────────────────────────────────────


WORDS = f"{API}/summary/settings"


def _words(client: TestClient) -> dict[str, Any]:
    r = client.get(WORDS)
    assert r.status_code == 200, r.text
    data: dict[str, Any] = r.json()
    return data


def test_holders_of_summary_share_edit_its_words_and_the_emails_use_them(
    week: Module,
    client_for: ClientFor,
    make_user: MakeUser,
    make_role: Callable[..., Any],
    db: Session,
    outbox: Outbox,
    deliver: Deliver,
) -> None:
    student = make_user(name="Student", year=2)
    for who in (None, student):
        assert client_for(who).get(WORDS).status_code == (401 if who is None else 403)
    make_role("summary-sharers", Box.summary_share)
    sharer = client_for(make_user(name="Huda Sharer", roles=("student", "summary-sharers")))
    loaded = _words(sharer)
    assert (loaded["version"], loaded["data"]["sendAt"]) == (0, "08:00")
    words = loaded["data"]
    words["subject"] = "Year {year}, the week of {week}"
    words["headings"]["calendar"] = "Coming up this week"
    words["closing"] = "And the rest:"
    words["sendAt"] = "06:30"
    assert client_for(student).put(WORDS, json={"version": 0, "data": words}).status_code == 403
    r = sharer.put(WORDS, json={"version": 0, "data": words})
    assert r.status_code == 200, r.text
    assert r.json()["version"] == 1
    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "summary.words"))
    assert entry is not None
    assert entry.data["parts"] == ["subject", "headings", "closing", "sendAt"]

    _opted_in(make_user, db, "sara@example.com", 2)
    assert summary.send_week(db, NEXT_SUNDAY) == 1
    db.commit()
    deliver()
    [mail] = outbox.to("sara@example.com")
    assert mail.subject is not None
    assert mail.subject.startswith("Year 2, the week of ")
    assert "Coming up this week" in mail.text
    assert "Exams and deadlines this week" not in mail.text
    assert "And the rest: " in mail.text

    stale = sharer.put(WORDS, json={"version": 0, "data": words | {"closing": "More:"}})
    assert (stale.status_code, stale.json()["error"]["code"]) == (409, "summary_changed")


def test_the_mail_worker_waits_for_the_saved_send_time(
    week: Module, client_for: ClientFor, make_user: MakeUser, db: Session
) -> None:
    admin = client_for(make_user(name="Amina Admin", roles=("student", "admin")))
    words = _words(admin)["data"] | {"sendAt": "10:15"}
    assert admin.put(WORDS, json={"version": 0, "data": words}).status_code == 200
    _opted_in(make_user, db, "sara@example.com", 2)

    @contextmanager
    def sessions() -> Iterator[Session]:
        yield db

    sunday = dt.datetime.combine(NEXT_SUNDAY, dt.time(10), tzinfo=BAHRAIN)
    assert summary.send_due(sessions, now=sunday) == 0
    assert summary.send_due(sessions, now=sunday + dt.timedelta(minutes=15)) == 1


def test_a_draft_of_the_words_is_previewed_without_saving_it(
    week: Module, client_for: ClientFor, make_user: MakeUser
) -> None:
    rep = client_for(make_user(name="Rep", roles=("student", "rep"), year=2))
    words = _words(rep)["data"] | {"subject": "Week {week} for Year {year}"}
    words["headings"]["forum"] = "Unanswered questions"
    r = rep.post(f"{WORDS}/preview", json={"year": 2, "words": words})
    assert r.status_code == 200, r.text
    assert r.json()["subject"].startswith("Week ")
    assert r.json()["subject"].endswith(" for Year 2")
    assert "Unanswered questions" in r.json()["text"]
    assert _words(rep)["version"] == 0


@pytest.mark.parametrize(
    ("change", "field"),
    [
        (lambda w: w.update(subject="Your week, {cohort}"), "data.subject"),
        (lambda w: w.update(sendAt="25:00"), "data.sendAt"),
        (lambda w: w.update(sendAt="8am"), "data.sendAt"),
        (lambda w: w["headings"].update(library=" "), "data.headings.library"),
        (lambda w: w.update(closing=""), "data.closing"),
    ],
)
def test_the_words_are_checked(
    client_for: ClientFor, make_user: MakeUser, change: Callable[[dict[str, Any]], None], field: str
) -> None:
    admin = client_for(make_user(name="Amina Admin", roles=("student", "admin")))
    words = _words(admin)["data"]
    change(words)
    r = admin.put(WORDS, json={"version": 0, "data": words})
    assert r.status_code == 422, r.text
    assert field in r.json()["error"]["fields"]
