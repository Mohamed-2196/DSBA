"""Notifications on phones and computers (web push): turning it on for a browser, queuing a push when a notification
is made, and the worker sending it (app/services/push.py). The push service is a stand-in: nothing reaches the
network."""

from __future__ import annotations

import json
import logging
import threading
import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any

import httpx
import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import ec
from fastapi.testclient import TestClient
from pydantic import SecretStr
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app import cli
from app.core.time import bahrain_today, utcnow
from app.models import BoardCard, EmailOutbox, Notification, OutboxStatus, PushOutbox, PushSubscription, User
from app.services import push
from app.services.notify import notify, notify_all
from app.services.webpush import b64encode, settings_problems
from tests.accounts.conftest import API, PASSWORD, logout, sync_csrf
from tests.board.conftest import add
from tests.core.helpers import new_reply, new_thread
from tests.core.test_webpush import RFC_AS_PRIVATE, RFC_AS_PUBLIC, _decrypt

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]
SUBJECT = "mailto:hub@example.com"


@dataclass
class Browser:
    """A browser's side of a subscription: its keys, and the JSON its PushSubscription gives."""

    private: ec.EllipticCurvePrivateKey = field(default_factory=lambda: ec.generate_private_key(ec.SECP256R1()))
    auth: bytes = field(default_factory=lambda: uuid.uuid4().bytes)
    endpoint: str = field(default_factory=lambda: f"https://fcm.googleapis.com/fcm/send/{uuid.uuid4().hex}")

    def json(self) -> dict[str, Any]:
        public = self.private.public_key().public_bytes(
            serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint
        )
        return {
            "endpoint": self.endpoint,
            "expirationTime": None,
            "keys": {"p256dh": b64encode(public), "auth": b64encode(self.auth)},
        }

    def read(self, body: bytes) -> dict[str, Any]:
        data: dict[str, Any] = json.loads(_decrypt(body, self.private, self.auth))
        return data


@dataclass
class PushService:
    """The browsers' push services: records what was posted, and answers with `status` (or raises `error`)."""

    status: int = 201
    error: Exception | None = None
    headers: dict[str, str] = field(default_factory=dict)
    posted: list[httpx.Request] = field(default_factory=list)

    def handler(self, request: httpx.Request) -> httpx.Response:
        self.posted.append(request)
        if self.error is not None:
            raise self.error
        return httpx.Response(self.status, headers=self.headers)


Deliver = Callable[[], int]


@pytest.fixture
def push_on(set_option: Callable[[str, Any], None], set_feature: Callable[..., None]) -> None:
    """The hub has a VAPID key (RFC 8291's example sender key) and push is on for everyone."""
    set_option("vapid_private_key", SecretStr(RFC_AS_PRIVATE))
    set_option("vapid_subject", SUBJECT)
    set_feature("push", "everyone")


@pytest.fixture
def service() -> PushService:
    return PushService()


@pytest.fixture
def send(db: Session, service: PushService) -> Deliver:
    """send() runs the worker's push part until nothing is due. -> how many it handled."""

    @contextmanager
    def _session() -> Iterator[Session]:
        yield db

    http = httpx.Client(transport=httpx.MockTransport(service.handler))
    return lambda: push.drain(_session, http=http)


def _on(c: TestClient, browser: Browser) -> None:
    r = c.post(f"{API}/push/subscriptions", json=browser.json())
    assert r.status_code == 204, r.text


def _queued(db: Session, user: User) -> list[PushOutbox]:
    return list(
        db.scalars(
            select(PushOutbox)
            .where(PushOutbox.user_id == user.id)
            .order_by(PushOutbox.created_at, PushOutbox.id)
            .execution_options(populate_existing=True)
        )
    )


def _subscriptions(db: Session, user: User) -> list[PushSubscription]:
    return list(
        db.scalars(
            select(PushSubscription)
            .where(PushSubscription.user_id == user.id)
            .execution_options(populate_existing=True)
        )
    )


# ── this device ──────────────────────────────────────────────────────────────────────────────


@pytest.mark.usefixtures("push_on")
def test_the_key_is_the_hubs_public_key(client_for: ClientFor, make_user: MakeUser) -> None:
    r = client_for(make_user()).get(f"{API}/push/key")
    assert r.status_code == 200
    assert r.json() == {"publicKey": RFC_AS_PUBLIC}


@pytest.mark.usefixtures("push_on")
def test_turning_it_on_records_this_browser_once(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    person = make_user()
    c = client_for(person)
    browser = Browser()
    _on(c, browser)
    _on(c, browser)  # the web app sends it again on every start
    [sub] = _subscriptions(db, person)
    assert sub.endpoint == browser.endpoint
    assert sub.last_success_at is None


@pytest.mark.usefixtures("push_on")
def test_the_same_browser_signed_in_as_someone_else_is_theirs_now(
    client_for: ClientFor, make_user: MakeUser, db: Session
) -> None:
    first, second = make_user(), make_user()
    browser = Browser()
    _on(client_for(first), browser)
    _on(client_for(second), browser)
    assert _subscriptions(db, first) == []
    assert len(_subscriptions(db, second)) == 1


@pytest.mark.usefixtures("push_on")
def test_turning_it_off_forgets_only_your_own_browser(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    mine, theirs = make_user(), make_user()
    browser = Browser()
    _on(client_for(mine), browser)
    r = client_for(theirs).post(f"{API}/push/subscriptions/remove", json={"endpoint": browser.endpoint})
    assert r.status_code == 204
    assert len(_subscriptions(db, mine)) == 1
    r = client_for(mine).post(f"{API}/push/subscriptions/remove", json={"endpoint": browser.endpoint})
    assert r.status_code == 204
    assert _subscriptions(db, mine) == []


@pytest.mark.usefixtures("push_on")
@pytest.mark.parametrize(
    ("change", "field_name"),
    [
        ({"endpoint": "https://evil.example/push"}, "endpoint"),
        ({"endpoint": "http://fcm.googleapis.com/fcm/send/x"}, "endpoint"),
        ({"keys": {"p256dh": "AAAA", "auth": "BTBZMqHH6r4Tts7J_aSIgg"}}, "keys.p256dh"),
        ({"keys": {"p256dh": b64encode(b"\x04" + b"\x01" * 64), "auth": "BTBZMqHH6r4Tts7J_aSIgg"}}, "keys.p256dh"),
        ({"keys": {"p256dh": RFC_AS_PUBLIC, "auth": "short"}}, "keys.auth"),
    ],
)
def test_anything_but_a_browsers_subscription_is_refused(
    client_for: ClientFor, make_user: MakeUser, db: Session, change: dict[str, Any], field_name: str
) -> None:
    person = make_user()
    r = client_for(person).post(f"{API}/push/subscriptions", json={**Browser().json(), **change})
    assert r.status_code == 422, r.text
    assert field_name in r.text
    assert _subscriptions(db, person) == []


@pytest.mark.usefixtures("push_on")
def test_a_person_keeps_at_most_ten_browsers(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    person = make_user()
    c = client_for(person)
    browsers = [Browser() for _ in range(push.MAX_DEVICES + 1)]
    for i, b in enumerate(browsers):
        _on(c, b)
        db.execute(
            update(PushSubscription)
            .where(PushSubscription.endpoint == b.endpoint)
            .values(created_at=utcnow() - timedelta(minutes=100 - i))
        )
        db.commit()
    kept = {s.endpoint for s in _subscriptions(db, person)}
    assert len(kept) == push.MAX_DEVICES
    assert browsers[0].endpoint not in kept  # the one subscribed longest ago


def test_off_when_the_switch_is_off_or_the_hub_has_no_key(
    client_for: ClientFor,
    make_user: MakeUser,
    set_option: Callable[[str, Any], None],
    set_feature: Callable[..., None],
) -> None:
    c = client_for(make_user())
    assert c.get(f"{API}/push/key").status_code == 404  # off until an admin turns it on
    set_feature("push", "everyone")
    r = c.get(f"{API}/push/key")
    assert r.status_code == 404, "no VAPID key: no push"
    assert c.post(f"{API}/push/subscriptions", json=Browser().json()).status_code == 404
    set_option("vapid_private_key", SecretStr(RFC_AS_PRIVATE))
    set_option("vapid_subject", SUBJECT)
    assert c.get(f"{API}/push/key").status_code == 200
    assert client_for().get(f"{API}/push/key").status_code == 401


def test_admins_follow_the_switch(
    client_for: ClientFor, make_user: MakeUser, push_on: None, set_feature: Callable[..., None]
) -> None:
    admin = make_user(roles=("admin",))
    set_feature("push", "off")
    assert client_for(admin).get(f"{API}/push/key").status_code == 404


# ── choices ──────────────────────────────────────────────────────────────────────────────────


def test_only_replies_to_your_own_posts_start_on(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user())
    prefs = c.get(f"{API}/me").json()["preferences"]
    assert {k: v for k, v in prefs.items() if k.startswith("push")} == {
        "pushReplies": True,
        "pushFollowed": False,
        "pushAnswerAccepted": False,
        "pushUploadReviews": False,
        "pushNewIssues": False,
        "pushDateChanges": False,
        "pushReminders": False,
    }
    r = c.patch(f"{API}/me", json={"preferences": {"pushReplies": False, "pushNewIssues": True}})
    assert r.status_code == 200
    prefs = r.json()["preferences"]
    assert (prefs["pushReplies"], prefs["pushNewIssues"]) == (False, True)
    assert prefs["emailReplies"] is True  # the emails are their own choices


# ── queuing and sending ──────────────────────────────────────────────────────────────────────


@pytest.mark.usefixtures("push_on")
def test_a_reply_pushes_to_the_authors_browser(
    client_for: ClientFor, make_user: MakeUser, db: Session, service: PushService, send: Deliver
) -> None:
    author = make_user(name="Sara Author")
    c = client_for(author)
    browser = Browser()
    _on(c, browser)
    thread = new_thread(c, "How do I find the MGF of a Laplace variable?", "MGF of a Laplace")
    reply = new_reply(client_for(make_user(name="Omar Replier")), thread["id"], "Integrate e^{tx} against it.")
    [row] = _queued(db, author)
    assert (row.kind, row.status) == ("thread_reply", OutboxStatus.pending)
    assert service.posted == []  # nothing goes out during the request

    assert send() == 1
    [request] = service.posted
    assert str(request.url) == browser.endpoint
    assert request.headers["content-encoding"] == "aes128gcm"
    assert request.headers["ttl"] == str(push.TTL)
    token, k = request.headers["authorization"].removeprefix("vapid t=").split(", k=")
    assert k == RFC_AS_PUBLIC
    claims = jwt.decode(token, options={"verify_signature": False})
    assert (claims["aud"], claims["sub"]) == ("https://fcm.googleapis.com", SUBJECT)
    message = browser.read(request.content)
    assert message["title"] == "Omar Replier replied to your thread “MGF of a Laplace”"
    assert message["body"].startswith("Integrate e^{tx}")
    assert message["url"] == f"/forum/{thread['slug']}#reply-{reply['id']}"
    assert message["tag"] == f"thread-{thread['id']}"
    assert message["badge"] == 1  # the unread notifications, for the app's icon
    [row] = _queued(db, author)
    assert row.status == OutboxStatus.sent
    assert _subscriptions(db, author)[0].last_success_at is not None


@pytest.mark.usefixtures("push_on")
def test_kinds_that_start_off_push_only_once_turned_on(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    person = make_user()
    c = client_for(person)
    _on(c, Browser())
    notify(db, person.id, "upload_published", "Your file is in the library", url="/library/x")
    notify(db, person.id, "system", "Something else", url="/")  # never pushed
    db.commit()
    assert _queued(db, person) == []
    c.patch(f"{API}/me", json={"preferences": {"pushUploadReviews": True}})
    notify(db, person.id, "upload_published", "Your next file is in the library", url="/library/y")
    db.commit()
    assert [r.kind for r in _queued(db, person)] == ["upload_published"]


@pytest.mark.usefixtures("push_on")
def test_each_browser_gets_its_own_push(
    client_for: ClientFor, make_user: MakeUser, db: Session, send: Deliver, service: PushService
) -> None:
    person = make_user()
    phone, laptop = Browser(), Browser()
    _on(client_for(person), phone)
    _on(client_for(person), laptop)  # another browser: another session
    notify(db, person.id, "thread_reply", "A reply", url="/forum/x", actor=make_user())
    db.commit()
    assert len(_queued(db, person)) == 2
    assert send() == 2
    assert sorted(str(r.url) for r in service.posted) == sorted([phone.endpoint, laptop.endpoint])


@pytest.mark.usefixtures("push_on")
def test_a_new_issue_pushes_to_those_who_turned_it_on(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    keen, quiet, no_browser = make_user(), make_user(), make_user()
    for person in (keen, quiet):
        _on(client_for(person), Browser())
    client_for(keen).patch(f"{API}/me", json={"preferences": {"pushNewIssues": True}})
    client_for(no_browser).patch(f"{API}/me", json={"preferences": {"pushNewIssues": True}})
    notify_all(db, "new_issue", "Issue 12 of The DSBA Newsletter is out", url="/newsletter/12")
    db.commit()
    [row] = _queued(db, keen)
    n = db.get(Notification, row.notification_id)
    assert n is not None
    assert n.user_id == keen.id
    assert row.payload["title"] == "Issue 12 of The DSBA Newsletter is out"
    assert _queued(db, quiet) == []
    assert _queued(db, no_browser) == []


@pytest.mark.usefixtures("push_on")
def test_a_browser_gets_at_most_ten_an_hour(client_for: ClientFor, make_user: MakeUser, db: Session) -> None:
    person, actor = make_user(), make_user()
    _on(client_for(person), Browser())
    for i in range(push.PUSH_MAX_PER_HOUR + 3):
        notify(db, person.id, "thread_reply", f"Reply {i}", url="/forum/x", actor=actor)
    db.commit()
    assert len(_queued(db, person)) == push.PUSH_MAX_PER_HOUR
    assert len(list(db.scalars(select(Notification).where(Notification.user_id == person.id)))) == 13


def test_nothing_is_queued_while_the_hub_has_no_key(
    client_for: ClientFor, make_user: MakeUser, db: Session, set_feature: Callable[..., None], send: Deliver
) -> None:
    set_feature("push", "everyone")
    person = make_user()
    db.add(
        PushSubscription(
            user_id=person.id,
            session_id=_session_of(client_for, person, db),
            endpoint=Browser().endpoint,
            p256dh=RFC_AS_PUBLIC,
            auth="BTBZMqHH6r4Tts7J_aSIgg",
        )
    )
    db.commit()
    notify(db, person.id, "thread_reply", "A reply", url="/forum/x", actor=make_user())
    db.commit()
    assert _queued(db, person) == []
    assert send() == 0


def _session_of(client_for: ClientFor, person: User, db: Session) -> uuid.UUID:
    from app.models import UserSession

    client_for(person)
    sid = db.scalar(select(UserSession.id).where(UserSession.user_id == person.id))
    assert sid is not None
    return sid


# ── when its turn comes ──────────────────────────────────────────────────────────────────────


def _one_waiting(client_for: ClientFor, make_user: MakeUser, db: Session) -> tuple[User, TestClient, Browser]:
    person = make_user()
    c = client_for(person)
    browser = Browser()
    _on(c, browser)
    notify(db, person.id, "thread_reply", "A reply", url="/forum/x", actor=make_user())
    db.commit()
    assert len(_queued(db, person)) == 1
    return person, c, browser


@pytest.mark.usefixtures("push_on")
def test_a_browser_its_push_service_forgot_is_forgotten(
    client_for: ClientFor, make_user: MakeUser, db: Session, service: PushService, send: Deliver
) -> None:
    person, _, _ = _one_waiting(client_for, make_user, db)
    service.status = 410
    assert send() == 1
    [row] = _queued(db, person)
    assert (row.status, row.last_error) == (OutboxStatus.cancelled, "gone (410)")
    assert _subscriptions(db, person) == []


@pytest.mark.usefixtures("push_on")
@pytest.mark.parametrize("trouble", [503, 429, httpx.ConnectError("no route")])
def test_a_busy_or_unreachable_push_service_is_tried_again_later(
    client_for: ClientFor, make_user: MakeUser, db: Session, service: PushService, send: Deliver, trouble: Any
) -> None:
    person, _, _ = _one_waiting(client_for, make_user, db)
    if isinstance(trouble, int):
        service.status = trouble
    else:
        service.error = trouble
    assert send() == 1
    [row] = _queued(db, person)
    assert (row.status, row.attempts) == (OutboxStatus.pending, 1)
    assert row.next_attempt_at > utcnow()
    assert len(_subscriptions(db, person)) == 1


@pytest.mark.usefixtures("push_on")
def test_retry_after_is_honoured(
    client_for: ClientFor, make_user: MakeUser, db: Session, service: PushService, send: Deliver
) -> None:
    person, _, _ = _one_waiting(client_for, make_user, db)
    service.status, service.headers = 429, {"Retry-After": "3600"}
    send()
    [row] = _queued(db, person)
    assert row.next_attempt_at > utcnow() + timedelta(minutes=59)


@pytest.mark.usefixtures("push_on")
def test_a_refused_push_is_given_up_at_once(
    client_for: ClientFor, make_user: MakeUser, db: Session, service: PushService, send: Deliver
) -> None:
    person, _, _ = _one_waiting(client_for, make_user, db)
    service.status = 403
    send()
    [row] = _queued(db, person)
    assert (row.status, row.last_error) == (OutboxStatus.failed, "refused (403)")


@pytest.mark.usefixtures("push_on")
def test_retries_stop_after_the_last_attempt(
    client_for: ClientFor, make_user: MakeUser, db: Session, service: PushService, send: Deliver
) -> None:
    person, _, _ = _one_waiting(client_for, make_user, db)
    service.status = 500
    for _ in range(push.MAX_ATTEMPTS):
        db.execute(update(PushOutbox).where(PushOutbox.user_id == person.id).values(next_attempt_at=utcnow()))
        db.commit()
        send()
    [row] = _queued(db, person)
    assert (row.status, row.attempts) == (OutboxStatus.failed, push.MAX_ATTEMPTS)


@pytest.mark.usefixtures("push_on")
def test_signing_out_stops_the_browsers_pushes(
    client_for: ClientFor, make_user: MakeUser, db: Session, service: PushService, send: Deliver
) -> None:
    person, c, _ = _one_waiting(client_for, make_user, db)
    assert logout(c).status_code == 204
    assert send() == 1
    [row] = _queued(db, person)
    assert (row.status, row.last_error) == (OutboxStatus.cancelled, "signed out")
    assert service.posted == []
    assert _subscriptions(db, person) == []
    notify(db, person.id, "thread_reply", "Another reply", url="/forum/x", actor=make_user())
    db.commit()
    assert len(_queued(db, person)) == 1  # nothing new


@pytest.mark.usefixtures("push_on")
@pytest.mark.parametrize("why", ["choice", "push", "forum", "read"])
def test_a_push_no_longer_wanted_is_cancelled(
    client_for: ClientFor,
    make_user: MakeUser,
    db: Session,
    service: PushService,
    send: Deliver,
    set_feature: Callable[..., None],
    why: str,
) -> None:
    person, c, _ = _one_waiting(client_for, make_user, db)
    if why == "choice":
        c.patch(f"{API}/me", json={"preferences": {"pushReplies": False}})
    elif why == "read":
        c.post(f"{API}/notifications/read-all")
    else:
        set_feature(why, "off")
    assert send() == 1
    [row] = _queued(db, person)
    assert row.status == OutboxStatus.cancelled
    assert service.posted == []


@pytest.mark.usefixtures("push_on")
def test_old_rows_are_purged(client_for: ClientFor, make_user: MakeUser, db: Session, send: Deliver) -> None:
    person, _, _ = _one_waiting(client_for, make_user, db)
    send()
    db.execute(update(PushOutbox).values(created_at=utcnow() - timedelta(days=31)))
    db.commit()
    assert push.purge(db) == 1
    assert _queued(db, person) == []


# ── settings ─────────────────────────────────────────────────────────────────────────────────


def test_push_settings_are_both_or_neither() -> None:
    assert settings_problems(None, None) == []
    assert settings_problems(RFC_AS_PRIVATE, SUBJECT) == []
    assert settings_problems(RFC_AS_PRIVATE, "https://hub.example.com") == []
    assert any("DSBA_VAPID_SUBJECT" in p for p in settings_problems(RFC_AS_PRIVATE, None))
    assert any("DSBA_VAPID_PRIVATE_KEY" in p for p in settings_problems(None, SUBJECT))
    assert any("mailto:" in p for p in settings_problems(RFC_AS_PRIVATE, "hub@example.com"))
    assert any("isn't a P-256 private key" in p for p in settings_problems("nope", SUBJECT))


def test_every_pushed_kind_names_its_feature_and_a_choice_the_preferences_have() -> None:
    from app.schemas.auth import Preferences

    assert set(push.PUSH_FEATURES) == set(push.PUSH_SWITCHES)
    assert set(push.PUSH_DEFAULTS) <= set(Preferences.model_fields)
    assert [name for name, on in push.PUSH_DEFAULTS.items() if on] == ["push_replies"]


@pytest.mark.usefixtures("push_on")
def test_an_unexpected_error_fails_that_push_and_the_next_one_still_goes(
    client_for: ClientFor, make_user: MakeUser, db: Session, service: PushService, send: Deliver
) -> None:
    person, _, _ = _one_waiting(client_for, make_user, db)
    service.error = RuntimeError("something nobody planned for")
    assert send() == 1
    [row] = _queued(db, person)
    assert (row.status, row.last_error) == (OutboxStatus.failed, "failed (RuntimeError)")
    service.error = None
    notify(db, person.id, "thread_reply", "Another reply", url="/forum/y", actor=make_user())
    db.commit()
    assert send() == 1
    assert _queued(db, person)[-1].status == OutboxStatus.sent


# ── the code review's findings (COM-203) ────────────────────────────────────────────────────


@pytest.mark.usefixtures("push_on")
def test_no_log_line_names_a_browsers_endpoint(
    client_for: ClientFor, make_user: MakeUser, db: Session, send: Deliver, caplog: pytest.LogCaptureFixture
) -> None:
    """httpx logs every request's URL at INFO, and a push's URL is the browser's endpoint: whoever reads the worker's
    logs could otherwise take every browser's address."""
    _, _, browser = _one_waiting(client_for, make_user, db)
    caplog.set_level(logging.DEBUG)
    assert send() == 1
    path = browser.endpoint.rsplit("/", 1)[-1]
    assert not [r for r in caplog.records if path in r.getMessage()]


def _step_up(c: TestClient) -> None:
    r = c.post(f"{API}/me/step-up", json={"password": PASSWORD})
    sync_csrf(c)  # a new session comes with a new CSRF cookie
    assert r.status_code == 200, r.text


@pytest.mark.usefixtures("push_on")
def test_confirming_your_password_keeps_this_browsers_pushes(
    client_for: ClientFor, make_user: MakeUser, db: Session, service: PushService, send: Deliver
) -> None:
    person = make_user(password=PASSWORD)
    c = client_for(person)
    _on(c, Browser())
    _step_up(c)  # a new session for this browser, with no page load to subscribe again
    notify(db, person.id, "thread_reply", "A reply", url="/forum/x", actor=make_user())
    db.commit()
    [row] = _queued(db, person)
    assert send() == 1
    assert _queued(db, person)[0].status == OutboxStatus.sent
    assert len(service.posted) == 1
    assert row.subscription_id == _subscriptions(db, person)[0].id


@pytest.mark.usefixtures("push_on")
def test_signing_in_as_someone_else_on_the_browser_doesnt_give_them_its_pushes(
    client_for: ClientFor, make_user: MakeUser, db: Session
) -> None:
    first = make_user()
    second = make_user(email="second-person@example.com", password=PASSWORD)
    c = client_for(first)
    _on(c, Browser())
    r = c.post(f"{API}/auth/sign-in", json={"email": "second-person@example.com", "password": PASSWORD})
    sync_csrf(c)
    assert r.status_code == 200, r.text
    notify(db, first.id, "thread_reply", "A reply", url="/forum/x", actor=make_user())
    notify(db, second.id, "thread_reply", "A reply", url="/forum/x", actor=make_user())
    db.commit()
    assert _queued(db, first) == []  # the browser's session was the first person's, and it ended
    assert _queued(db, second) == []


@pytest.mark.usefixtures("push_on")
def test_a_push_that_breaks_before_sending_fails_alone(
    client_for: ClientFor,
    make_user: MakeUser,
    db: Session,
    send: Deliver,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    person, _, _ = _one_waiting(client_for, make_user, db)

    def broken(*_: object) -> int:
        raise RuntimeError("the unread count broke")

    with monkeypatch.context() as m:
        m.setattr(push, "_unread", broken)
        assert send() == 1
    [row] = _queued(db, person)
    assert (row.status, row.last_error) == (OutboxStatus.failed, "failed (RuntimeError)")
    notify(db, person.id, "thread_reply", "Another reply", url="/forum/y", actor=make_user())
    db.commit()
    assert send() == 1
    assert _queued(db, person)[-1].status == OutboxStatus.sent


@pytest.mark.usefixtures("push_on")
def test_nothing_is_queued_while_push_is_off_for_the_reader(
    client_for: ClientFor, make_user: MakeUser, db: Session, set_feature: Callable[..., None]
) -> None:
    person = make_user()
    c = client_for(person)
    _on(c, Browser())
    c.patch(f"{API}/me", json={"preferences": {"pushNewIssues": True}})
    set_feature("push", "off")
    notify(db, person.id, "thread_reply", "A reply", url="/forum/x", actor=make_user())
    notify_all(db, "new_issue", "Issue 12 is out", url="/newsletter/12")
    db.commit()
    assert _queued(db, person) == []


def test_a_broken_key_outside_production_turns_push_off_instead_of_breaking_notifications(
    client_for: ClientFor,
    make_user: MakeUser,
    db: Session,
    set_option: Callable[[str, Any], None],
    set_feature: Callable[..., None],
) -> None:
    set_option("vapid_private_key", SecretStr("not a key"))
    set_option("vapid_subject", SUBJECT)
    set_feature("push", "everyone")
    person = make_user()
    assert push.configured() is False
    notify(db, person.id, "thread_reply", "A reply", url="/forum/x", actor=make_user())
    db.commit()
    assert client_for(person).get(f"{API}/push/key").status_code == 404


@pytest.mark.usefixtures("push_on")
def test_the_export_lists_this_persons_browsers_without_their_addresses(
    client_for: ClientFor, make_user: MakeUser, db: Session
) -> None:
    person = make_user()
    c = client_for(person)
    browser = Browser()
    _on(c, browser)
    r = c.get(f"{API}/me/export")
    assert r.status_code == 200
    [device] = r.json()["pushDevices"]
    assert device["service"] == "fcm.googleapis.com"
    assert set(device) == {"service", "createdAt", "lastSuccessAt"}
    assert browser.endpoint not in r.text


# ── the push worker: pushes only, no emails ─────────────────────────────────────────────────────


@pytest.mark.usefixtures("push_on")
def test_the_push_worker_sends_the_pushes_and_leaves_the_emails_waiting(
    client_for: ClientFor, make_user: MakeUser, db: Session, service: PushService
) -> None:
    """Where pushes go out but emails shouldn't yet (dev), the push worker runs instead of the mail worker: it sends
    a notification's push, and the same notification's email stays queued, unsent."""
    person, _, browser = _one_waiting(client_for, make_user, db)
    emails = list(db.scalars(select(EmailOutbox).where(EmailOutbox.user_id == person.id)))
    assert [e.status for e in emails] == [OutboxStatus.pending]

    @contextmanager
    def _session() -> Iterator[Session]:
        yield db

    http = httpx.Client(transport=httpx.MockTransport(service.handler))
    assert push.run_worker(_session, once=True, http=http, stop=threading.Event()) == 0
    assert [str(r.url) for r in service.posted] == [browser.endpoint]
    assert [r.status for r in _queued(db, person)] == [OutboxStatus.sent]
    db.expire_all()
    assert [e.status for e in db.scalars(select(EmailOutbox).where(EmailOutbox.user_id == person.id))] == [
        OutboxStatus.pending
    ]


def test_the_push_worker_command(db: Session, monkeypatch: pytest.MonkeyPatch) -> None:
    """`python -m app.cli push-worker` runs push.run_worker with the app's sessions; --once and --poll pass through."""
    seen: dict[str, Any] = {}

    def fake(sessions: Any, *, once: bool, poll_seconds: float) -> int:
        seen.update(sessions=sessions, once=once, poll=poll_seconds)
        return 0

    marker = object()
    monkeypatch.setattr(cli, "get_sessionmaker", lambda: marker)
    monkeypatch.setattr(push, "run_worker", fake)
    assert cli.main(["push-worker", "--once", "--poll", "2"]) == 0
    assert seen == {"sessions": marker, "once": True, "poll": 2.0}


@pytest.mark.usefixtures("push_on")
def test_the_push_worker_turns_due_reminders_into_pushes(
    client_for: ClientFor,
    make_user: MakeUser,
    db: Session,
    service: PushService,
    set_feature: Callable[..., None],
) -> None:
    """As the mail worker does, the push worker turns the reminders that have come into notifications, so a board
    card's reminder reaches the device; its email still waits, unsent."""
    set_feature("board", "everyone")
    person = make_user()
    person.preferences = {"push_reminders": True}
    db.commit()
    c = client_for(person)
    browser = Browser()
    _on(c, browser)
    card = add(c, title="Hand in the essay", dueDate=(bahrain_today() + timedelta(days=1)).isoformat(), dueTime="10:00")
    assert c.patch(f"{API}/board-cards/{card['id']}", json={"remindBefore": 60}).status_code == 200
    db.execute(update(BoardCard).where(BoardCard.id == card["id"]).values(remind_at=utcnow() - timedelta(minutes=1)))
    db.commit()

    @contextmanager
    def _session() -> Iterator[Session]:
        yield db

    http = httpx.Client(transport=httpx.MockTransport(service.handler))
    assert push.run_worker(_session, once=True, http=http, stop=threading.Event()) == 0
    assert [browser.read(r.content)["title"] for r in service.posted] == ["Due tomorrow at 10:00: Hand in the essay"]
    db.expire_all()
    emails = db.scalars(select(EmailOutbox).where(EmailOutbox.user_id == person.id)).all()
    assert all(e.status == OutboxStatus.pending for e in emails)


def test_the_push_worker_leaves_the_signal_handlers_alone_when_given_its_own_stop(
    db: Session, monkeypatch: pytest.MonkeyPatch
) -> None:
    """Called with its own stop event (tests, a host process), it doesn't take over Ctrl-C."""
    installed: list[int] = []
    monkeypatch.setattr("signal.signal", lambda signum, _handler: installed.append(signum))

    @contextmanager
    def _session() -> Iterator[Session]:
        yield db

    push.run_worker(_session, once=True, stop=threading.Event())
    assert installed == []
