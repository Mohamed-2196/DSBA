"""Notification emails (decision D1, ui-ux review UX-6): queued in the outbox with the notification, according to the
person's switch for that kind, and sent by the mail worker with retries; the notification in the Hub always comes."""

from __future__ import annotations

import logging
import threading
import uuid
from collections.abc import Callable, Iterator
from concurrent.futures import ThreadPoolExecutor
from contextlib import contextmanager
from datetime import timedelta

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import Engine, create_engine, delete, select
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app import cli
from app.core.time import utcnow
from app.models import EmailOutbox, Notification, OutboxStatus, User
from app.schemas.notifications import NotificationKind
from app.services import mailer
from app.services import outbox as mail_outbox
from app.services.mailer import DeliveryError
from app.services.notify import notify, notify_all
from tests.accounts.conftest import API, Deliver, Outbox
from tests.core.helpers import new_reply, new_thread

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]


def _queued(db: Session, user: User) -> list[EmailOutbox]:
    return list(
        db.scalars(
            select(EmailOutbox)
            .where(EmailOutbox.user_id == user.id)
            .order_by(EmailOutbox.created_at)
            .execution_options(populate_existing=True)
        )
    )


def _notifications(db: Session, user: User) -> list[Notification]:
    return list(db.scalars(select(Notification).where(Notification.user_id == user.id)))


def test_a_reply_emails_the_thread_author(
    client_for: ClientFor, make_user: MakeUser, outbox: Outbox, deliver: Deliver, db: Session
) -> None:
    author = make_user(email="author@example.com", name="Sara Author")
    replier = make_user(name="Omar Replier")
    thread = new_thread(client_for(author), "How do I find the MGF of a Laplace variable?", "MGF of a Laplace")
    reply = new_reply(client_for(replier), thread["id"], "Integrate e^{tx} against the density, split at zero.")
    [row] = _queued(db, author)
    assert (row.kind, row.to_address, row.status) == ("thread_reply", "author@example.com", OutboxStatus.pending)
    assert outbox == []  # nothing goes out during the request
    assert deliver() == 1
    [mail] = outbox.to("author@example.com")
    assert mail.html is None  # plain text
    assert mail.subject == "Omar Replier replied to your thread “MGF of a Laplace”"
    assert f"http://127.0.0.1:5173/forum/{thread['slug']}#reply-{reply['id']}" in mail.text
    assert "Integrate e^{tx} against the density" in mail.text
    assert "“Replies” is on in Your account" in mail.text
    assert "http://127.0.0.1:5173/account#acct-emails" in mail.text
    assert _queued(db, author)[0].status == OutboxStatus.sent
    assert len(_notifications(db, author)) == 1


def test_a_switch_turns_off_the_email_never_the_notification(
    client_for: ClientFor, make_user: MakeUser, outbox: Outbox, deliver: Deliver, db: Session
) -> None:
    author = make_user(email="quiet@example.com")
    c = client_for(author)
    assert c.patch(f"{API}/me", json={"preferences": {"emailReplies": False}}).status_code == 200
    thread = new_thread(c, "A question with replies I only want to see in the Hub.")
    new_reply(client_for(make_user()), thread["id"], "An answer.")
    assert _queued(db, author) == []
    assert [n.kind for n in _notifications(db, author)] == ["thread_reply"]
    assert deliver() == 0


def test_no_email_without_an_email_address(
    client_for: ClientFor, make_user: MakeUser, outbox: Outbox, deliver: Deliver, db: Session
) -> None:
    author = make_user(phone="+97333123490")
    thread = new_thread(client_for(author), "Phone-only students get the notification in the Hub.")
    new_reply(client_for(make_user()), thread["id"], "An answer.")
    assert _queued(db, author) == []
    assert len(_notifications(db, author)) == 1


@pytest.mark.parametrize(
    ("kind", "switch"),
    [
        ("thread_reply", "emailReplies"),
        ("reply_reply", "emailReplies"),
        ("answer_accepted", "emailAnswerAccepted"),
        ("upload_published", "emailUploadReviews"),
        ("upload_rejected", "emailUploadReviews"),
    ],
)
def test_each_kind_follows_its_own_switch(
    client_for: ClientFor, make_user: MakeUser, db: Session, kind: NotificationKind, switch: str
) -> None:
    person = make_user(email=f"{kind}@example.com")
    actor = make_user()
    notify(db, person.id, kind, "Something happened", url="/forum/x", actor=actor)
    db.commit()
    assert [r.kind for r in _queued(db, person)] == [kind]
    client_for(person).patch(f"{API}/me", json={"preferences": {switch: False}})
    notify(db, person.id, kind, "Something else happened", url="/forum/y", actor=actor)
    db.commit()
    assert len(_queued(db, person)) == 1  # only the first
    assert len(_notifications(db, person)) == 2  # both in the Hub


@pytest.mark.parametrize("kind", ["report_resolved", "system"])
def test_kinds_without_a_switch_send_no_email(make_user: MakeUser, db: Session, kind: NotificationKind) -> None:
    person = make_user(email=f"{kind}@example.com")
    notify(db, person.id, kind, "A notice in the Hub")
    db.commit()
    assert _queued(db, person) == []


def test_a_new_issue_tells_everyone_and_emails_those_who_want_it(
    make_user: MakeUser, db: Session, outbox: Outbox, deliver: Deliver
) -> None:
    editor = make_user(email="editor@example.com")
    wants = make_user(email="wants@example.com")
    declined = make_user(email="declined@example.com")
    declined.preferences = {"email_new_issues": False}
    phone_only = make_user(phone="+97333123491")
    db.commit()
    count = notify_all(
        db,
        "new_issue",
        "The October issue is out",
        body="Exams and a new study room.",
        url="/newsletter/october",
        actor=editor,
    )
    db.commit()
    assert count >= 3
    for person in (wants, declined, phone_only):
        assert [n.kind for n in _notifications(db, person)] == ["new_issue"]
    assert _notifications(db, editor) == []
    assert [r.to_address for r in _queued(db, wants)] == ["wants@example.com"]
    assert _queued(db, declined) == []
    assert _queued(db, phone_only) == []
    deliver()
    [mail] = outbox.to("wants@example.com")
    assert "/newsletter/october" in mail.text
    assert "New newsletter issues" in mail.text


def test_turned_off_or_moved_before_sending_cancels(
    client_for: ClientFor, make_user: MakeUser, outbox: Outbox, deliver: Deliver, db: Session
) -> None:
    switched = make_user(email="switched@example.com")
    moved = make_user(email="moved@example.com")
    actor = make_user()
    for person in (switched, moved):
        notify(db, person.id, "answer_accepted", "Your answer was accepted", url="/forum/z", actor=actor)
    db.commit()
    client_for(switched).patch(f"{API}/me", json={"preferences": {"emailAnswerAccepted": False}})
    moved.email = "elsewhere@example.com"
    db.commit()
    assert deliver() == 2
    assert outbox == []
    assert [r.status for r in _queued(db, switched)] == [OutboxStatus.cancelled]
    assert [r.status for r in _queued(db, moved)] == [OutboxStatus.cancelled]


def test_account_notices_ignore_the_switches(
    client_for: ClientFor, make_user: MakeUser, outbox: Outbox, deliver: Deliver
) -> None:
    user = make_user(email="notices@example.com")
    c = client_for(user)
    off = {"emailReplies": False, "emailAnswerAccepted": False, "emailUploadReviews": False, "emailNewIssues": False}
    c.patch(f"{API}/me", json={"preferences": off})
    r = c.post(f"{API}/me/identifiers/otp", json={"identifier": "+97333123492"})
    code = outbox.to("+97333123492")[-1].code
    r = c.post(f"{API}/me/identifiers/verify", json={"challengeId": r.json()["challengeId"], "code": code})
    assert r.status_code == 200, r.text
    deliver()
    [notice] = outbox.to("notices@example.com")
    assert notice.subject == "Your DSBA Hub account changed"


# ── the worker ──────────────────────────────────────────────────────────────────────────────


def test_failures_are_retried_with_backoff_then_given_up(
    make_user: MakeUser,
    db: Session,
    deliver: Deliver,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    person = make_user(email="flaky@example.com")
    notify(db, person.id, "upload_published", "Your file is in the library", url="/library/x", actor=make_user())
    db.commit()
    tries: list[str] = []

    def down(to: str, subject: str, text: str, html: str | None = None) -> None:
        tries.append(to)
        raise DeliveryError("The email could not be sent.")

    monkeypatch.setattr(mailer, "send_email", down)
    caplog.set_level(logging.WARNING, logger="dsba.outbox")
    assert deliver() == 1
    [row] = _queued(db, person)
    assert (row.status, row.attempts, row.last_error) == (OutboxStatus.pending, 1, "The email could not be sent.")
    wait = row.next_attempt_at - utcnow()
    assert timedelta(seconds=20) < wait <= timedelta(seconds=36)
    assert deliver() == 0  # not due yet
    for _ in range(mail_outbox.MAX_ATTEMPTS - 1):
        row.next_attempt_at = utcnow() - timedelta(seconds=1)
        db.commit()
        assert deliver() == 1
    [row] = _queued(db, person)
    assert (row.status, row.attempts) == (OutboxStatus.failed, mail_outbox.MAX_ATTEMPTS)
    assert len(tries) == mail_outbox.MAX_ATTEMPTS
    assert any("gave up" in r.getMessage() and "f•••@example.com" in r.getMessage() for r in caplog.records)
    assert not any("flaky@example.com" in r.getMessage() for r in caplog.records)


def test_backoff_grows_and_stops_at_six_hours() -> None:
    waits = [mail_outbox.backoff(n) for n in range(1, 30)]
    assert timedelta(seconds=24) <= waits[0] <= timedelta(seconds=36)
    assert timedelta(seconds=48) <= waits[1] <= timedelta(seconds=72)
    assert all(w <= mail_outbox.MAX_RETRY * 1.2 for w in waits)
    assert waits[-1] >= mail_outbox.MAX_RETRY * 0.8


def test_old_rows_are_purged(make_user: MakeUser, db: Session) -> None:
    person = make_user(email="old-mail@example.com")
    long_ago = utcnow() - mail_outbox.KEEP_DONE - timedelta(days=1)
    for status in (OutboxStatus.sent, OutboxStatus.failed, OutboxStatus.cancelled, OutboxStatus.pending):
        db.add(
            EmailOutbox(
                user_id=person.id,
                kind="thread_reply",
                to_address=person.email or "",
                subject="s",
                body="b",
                status=status,
                created_at=long_ago,
                next_attempt_at=utcnow() + timedelta(days=1),
            )
        )
    db.commit()
    assert mail_outbox.purge(db) == 3
    assert [r.status for r in _queued(db, person)] == [OutboxStatus.pending]


def test_the_mail_worker_command(
    make_user: MakeUser, db: Session, outbox: Outbox, monkeypatch: pytest.MonkeyPatch
) -> None:
    person = make_user(email="cli-mail@example.com")
    notify(db, person.id, "thread_reply", "A reply", url="/forum/a", actor=make_user())
    db.commit()

    @contextmanager
    def _session() -> Iterator[Session]:
        yield db

    monkeypatch.setattr(cli, "get_sessionmaker", lambda: _session)
    assert cli.main(["mail-worker", "--once"]) == 0
    assert [m.to for m in outbox] == ["cli-mail@example.com"]


def test_the_export_lists_the_emails(
    client_for: ClientFor, make_user: MakeUser, db: Session, deliver: Deliver, outbox: Outbox
) -> None:
    person = make_user(email="export-mail@example.com")
    notify(db, person.id, "thread_reply", "A reply to export", url="/forum/b", actor=make_user())
    db.commit()
    deliver()
    emails = client_for(person).get(f"{API}/me/export").json()["emails"]
    assert [(e["kind"], e["toAddress"], e["subject"], e["status"]) for e in emails] == [
        ("thread_reply", "export-mail@example.com", "A reply to export", "sent")
    ]
    assert emails[0]["sentAt"] is not None


# ── several workers at once (real separate connections) ─────────────────────────────────────


@pytest.fixture
def own_connections(engine: Engine) -> Iterator[sessionmaker[Session]]:
    separate = create_engine(engine.url.render_as_string(hide_password=False), poolclass=NullPool)
    yield sessionmaker(bind=separate, expire_on_commit=False, autoflush=False)
    separate.dispose()


def test_two_workers_never_send_the_same_email(
    own_connections: sessionmaker[Session], monkeypatch: pytest.MonkeyPatch
) -> None:
    tag = uuid.uuid4().hex[:8]
    addresses = [f"w1-{tag}@example.com", f"w2-{tag}@example.com"]
    with own_connections() as s:
        for to in addresses:
            s.add(EmailOutbox(kind="account_notice", to_address=to, subject="Notice", body="Text"))
        s.commit()
    both_sending = threading.Barrier(2, timeout=10)
    sent: list[str] = []

    def slow(to: str, subject: str, text: str, html: str | None = None) -> None:
        sent.append(to)
        both_sending.wait()  # each worker holds its row while the other sends: they must hold different rows

    monkeypatch.setattr(mailer, "send_email", slow)

    def worker(_: int) -> bool:
        with own_connections() as s:
            return mail_outbox.send_one(s)

    try:
        with ThreadPoolExecutor(2) as pool:
            assert list(pool.map(worker, range(2))) == [True, True]
        assert sorted(sent) == sorted(addresses)
        with own_connections() as s:
            rows = s.scalars(select(EmailOutbox).where(EmailOutbox.to_address.in_(addresses))).all()
            assert [r.status for r in rows] == [OutboxStatus.sent, OutboxStatus.sent]
    finally:
        with own_connections() as s:
            s.execute(delete(EmailOutbox).where(EmailOutbox.to_address.in_(addresses)))
            s.commit()


def test_an_email_into_a_switched_off_feature_is_cancelled(
    make_user: MakeUser, outbox: Outbox, deliver: Deliver, db: Session, set_feature: Callable[..., None]
) -> None:
    replied, issued = make_user(email="replied@example.com"), make_user(email="issued@example.com")
    actor = make_user()
    notify(db, replied.id, "thread_reply", "Omar replied to your thread", url="/forum/z", actor=actor)
    notify(db, issued.id, "new_issue", "Issue 4 is out", url="/newsletter/issue-4", actor=actor)
    db.commit()
    set_feature("forum", "off")
    assert deliver() == 2
    assert [m.to for m in outbox] == ["issued@example.com"]
    assert [r.status for r in _queued(db, replied)] == [OutboxStatus.cancelled]


def test_every_emailed_kind_names_its_feature() -> None:
    assert set(mail_outbox.EMAIL_FEATURES) == set(mail_outbox.EMAIL_SWITCHES)
