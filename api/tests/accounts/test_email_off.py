"""Email turned off (DSBA_EMAIL_BACKEND=off): the hub runs without a mail provider. Nothing is queued for email
(notification emails, account notices, Sunday summaries); notifications still come in the Hub and as pushes; the web
app is told, so no screen offers an email; and the question about emails at sign-up isn't asked."""

from __future__ import annotations

import datetime as dt
from collections.abc import Callable
from typing import Any

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
from tests.accounts.conftest import API
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
    assert summary.send_due(lambda: _same(db), sunday) == 0
    assert _emails(db) == []


def _same(db: Session) -> Any:
    from contextlib import nullcontext

    return nullcontext(db)


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
def test_the_mail_worker_refuses_to_start(capsys: pytest.CaptureFixture[str]) -> None:
    assert cli.main(["mail-worker", "--once"]) == 1
    assert "push-worker" in capsys.readouterr().err
