"""Email turned off (DSBA_EMAIL_BACKEND=off): the hub runs without a mail provider. Nothing is queued for email
(notification emails, account notices, Sunday summaries); notifications still come in the Hub and as pushes; the web
app is told, so no screen offers an email; the question about emails at sign-up isn't asked;
and the mail worker still sends the pushes and runs its jobs."""

from __future__ import annotations

import datetime as dt
import logging
from collections.abc import Callable, Iterator
from contextlib import contextmanager, nullcontext
from typing import Any
from urllib.parse import urlsplit

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app import cli
from app.core.time import BAHRAIN
from app.models import EmailOutbox, Notification, PushOutbox, User
from app.services import outbox as mail_outbox
from app.services import summary
from app.services.notify import notify, notify_all
from tests.accounts.conftest import API, PASSWORD, sign_in_with
from tests.accounts.test_push import Browser, _on
from tests.accounts.test_push import push_on as push_on  # the fixture

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]
SetOption = Callable[[str, Any], None]


@pytest.fixture
def email_off(set_option: SetOption) -> None:
    set_option("email_backend", "off")


def _emails(db: Session) -> list[EmailOutbox]:
    return list(db.scalars(select(EmailOutbox).execution_options(populate_existing=True)))


@pytest.mark.usefixtures("email_off", "push_on")
def test_notifications_come_in_the_hub_and_as_pushes_and_nothing_is_queued_for_email(
    client_for: ClientFor, make_user: MakeUser, db: Session
) -> None:
    person = make_user(email="pushed@example.com")
    person.preferences = {**person.preferences, "email_replies": True, "email_new_issues": True}
    db.commit()
    _on(client_for(person), Browser())
    notify(db, person.id, "thread_reply", "A reply to your thread", url="/forum/a", actor=make_user())
    notify_all(db, "new_issue", "The November issue is out", url="/newsletter/november")
    db.commit()
    kinds = sorted(db.scalars(select(Notification.kind).where(Notification.user_id == person.id)))
    assert kinds == ["new_issue", "thread_reply"]
    assert [p.payload["title"] for p in db.scalars(select(PushOutbox).where(PushOutbox.user_id == person.id))] == [
        "A reply to your thread"  # replies start on as pushes; new issues start off
    ]
    assert _emails(db) == []


@pytest.mark.usefixtures("email_off")
def test_account_notices_are_not_queued(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    user = make_user(email="notice-off@example.com")
    r = client_for(user).put(f"{API}/me/password", json={"newPassword": "correct horse battery"})
    assert r.status_code == 200, r.text
    assert _emails(db) == []
    assert mail_outbox.queue(db, to="x@example.com", subject="s", body="b", kind=mail_outbox.ACCOUNT_NOTICE) is None


@pytest.mark.usefixtures("email_off")
def test_no_sunday_summary_is_queued(make_user: MakeUser, db: Session) -> None:
    keen = make_user(email="summary-off@example.com", year=2)
    keen.preferences = {**keen.preferences, "email_weekly_summary": True}
    db.commit()
    sunday = dt.datetime(2026, 11, 15, 12, tzinfo=BAHRAIN)
    assert summary.send_week(db, sunday.date()) == 0
    assert summary.send_due(lambda: nullcontext(db), sunday) == 0
    assert _emails(db) == []


def test_the_session_says_whether_email_is_on(client_for: ClientFor, set_option: SetOption) -> None:
    assert client_for().get(f"{API}/auth/session").json()["email"] is True
    set_option("email_backend", "off")
    assert client_for().get(f"{API}/auth/session").json()["email"] is False


@pytest.mark.usefixtures("email_off")
def test_sign_up_needs_no_answer_about_emails(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    user = make_user(name=None, year=None, emails=None)
    c = client_for(user)
    r = c.patch(f"{API}/me", json={"displayName": "Sara Ahmed", "year": 1})
    assert r.status_code == 200, r.text
    assert (r.json()["needsProfile"], r.json()["preferences"]["notificationEmails"]) == (False, None)
    # with email off, every email switch reads off
    assert not any(v for k, v in r.json()["preferences"].items() if k.startswith("email"))


@pytest.mark.usefixtures("email_off")
def test_the_mail_worker_still_runs_the_pushes_and_jobs(
    db: Session, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    """With email off the mail worker keeps going: past papers' tagging and the forum checks the API left run only
    in it (a forum picture whose check never runs stays hidden)."""
    from app.services import paper_tagging
    from app.services.forum import checks

    ran: list[str] = []

    def job(name: str) -> Callable[..., int]:
        def run_due(*_a: Any, **_k: Any) -> int:
            ran.append(name)
            return 1 if ran.count(name) == 1 else 0  # one due job, then none

        return run_due

    monkeypatch.setattr(paper_tagging, "run_due", job("tagging"))
    monkeypatch.setattr(checks, "run_due", job("forum"))

    @contextmanager
    def _session() -> Iterator[Session]:
        yield db

    monkeypatch.setattr(cli, "get_sessionmaker", lambda: _session)
    with caplog.at_level(logging.INFO):
        assert cli.main(["mail-worker", "--once"]) == 0
    assert ran.count("tagging") >= 1 and ran.count("forum") >= 1
    assert "email is off" in caplog.text
    assert _emails(db) == []


@pytest.mark.usefixtures("email_off")
def test_a_forgotten_password_is_reset_with_an_admins_link(
    client_for: ClientFor, make_user: MakeUser, db: Session
) -> None:
    boss = make_user(email="head-off@example.com", name="Head Admin", roles=("student", "admin"))
    forgot = make_user(email="forgot-off@example.com", password=PASSWORD, name="Forgetful Fatima")
    r = client_for(boss).post(f"{API}/admin/users/{forgot.id}/reset-link")
    assert r.status_code == 200, r.text
    token = urlsplit(r.json()["url"]).fragment.removeprefix("token=")
    used = client_for().post(f"{API}/auth/password-reset", json={"token": token, "newPassword": "a brand new phrase"})
    assert used.status_code == 200, used.text
    assert sign_in_with(client_for(), "forgot-off@example.com", "a brand new phrase").status_code == 200
    assert _emails(db) == []  # no account notice is queued
