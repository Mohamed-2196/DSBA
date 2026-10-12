"""Step-up (decision D2, security review SEC-9): changing how one signs in and deleting the account need a code sent
to an identifier the account already has, unless this browser signed in a few minutes ago."""

from __future__ import annotations

import uuid
from collections.abc import Callable

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_token
from app.models import OtpChallenge, User, UserSession
from app.services import sessions
from tests.accounts.conftest import API, Outbox, SignIn, start, sync_csrf, verify, wrong

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]
Older = Callable[..., None]


@pytest.fixture(autouse=True)
def no_resend_wait(set_option: Callable[[str, object], None]) -> None:
    """These tests sign in and step up within seconds; in real life the session is ten minutes old by then."""
    set_option("otp_resend_seconds", 0)


def _step_up(c: TestClient, outbox: Outbox, to: str, via: str | None = None) -> dict[str, int]:
    r = c.post(f"{API}/me/step-up", json={"via": via} if via else {})
    assert r.status_code == 202, r.text
    code = outbox.to(to)[-1].code
    r2 = c.post(f"{API}/me/step-up/verify", json={"challengeId": r.json()["challengeId"], "code": code})
    sync_csrf(c)  # a new session comes with a new CSRF cookie
    assert r2.status_code == 200, r2.text
    result: dict[str, int] = r2.json()
    return result


def _fresh(db: Session, user_id: object) -> User:
    found = db.scalar(select(User).where(User.id == user_id).execution_options(populate_existing=True))
    assert found is not None
    return found


def test_a_browser_that_just_signed_in_needs_no_step_up(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user(email="fresh@example.com", phone="+97333123480"))
    r = c.delete(f"{API}/me/identifiers/phone")
    assert r.status_code == 200, r.text
    assert r.json()["phone"] is None


@pytest.mark.parametrize(
    ("method", "path", "body"),
    [
        ("POST", "/me/identifiers/otp", {"identifier": "+97333123481"}),
        ("POST", "/me/identifiers/otp", {"identifier": "other@example.com"}),
        ("DELETE", "/me/identifiers/phone", None),
        ("DELETE", "/me", None),
    ],
)
def test_an_older_session_must_step_up_first(
    client_for: ClientFor,
    make_user: MakeUser,
    older_sessions: Older,
    outbox: Outbox,
    db: Session,
    method: str,
    path: str,
    body: dict[str, str] | None,
) -> None:
    user = make_user(email="older@example.com", phone="+97333123482")
    c = client_for(user)
    older_sessions()
    r = c.request(method, f"{API}{path}", json=body)
    assert r.status_code == 403, r.text
    assert r.json()["error"]["code"] == "step_up_required"
    assert outbox == []  # no code went anywhere
    after = _fresh(db, user.id)
    assert (after.email, after.phone) == ("older@example.com", "+97333123482")


def test_step_up_by_email_then_change_the_phone_number(
    sign_in: SignIn, make_user: MakeUser, older_sessions: Older, outbox: Outbox, db: Session
) -> None:
    make_user(email="steps@example.com", phone="+97333123483")
    c, _ = sign_in("steps@example.com")
    old_token = c.cookies.get("dsba_session")
    older_sessions()
    r = c.post(f"{API}/me/step-up", json={})
    assert r.status_code == 202
    assert r.json()["channel"] == "email"
    assert r.json()["destinationHint"] == "s•••@example.com"
    mail = outbox.to("steps@example.com")[-1]
    assert "confirm it's you" in mail.text
    assert "someone may be signed in to your account" in mail.text
    r2 = c.post(f"{API}/me/step-up/verify", json={"challengeId": r.json()["challengeId"], "code": mail.code})
    sync_csrf(c)
    assert r2.status_code == 200, r2.text
    assert 590 <= r2.json()["expiresIn"] <= sessions.STEP_UP_WINDOW.total_seconds()
    # the browser has a new session; the old one ended
    assert c.cookies.get("dsba_session") != old_token
    old = db.scalar(select(UserSession).where(UserSession.token_hash == hash_token(old_token or "")))
    assert old is not None
    assert old.revoked_at is not None
    # now the change goes through, with a second code to the new number
    r = c.post(f"{API}/me/identifiers/otp", json={"identifier": "+97333123484"})
    assert r.status_code == 202, r.text
    text = outbox.to("+97333123484")[-1]
    r = c.post(f"{API}/me/identifiers/verify", json={"challengeId": r.json()["challengeId"], "code": text.code})
    assert r.status_code == 200, r.text
    assert r.json()["phone"] == "+97333123484"


def test_step_up_by_text_and_without_such_an_identifier(
    client_for: ClientFor, make_user: MakeUser, older_sessions: Older, outbox: Outbox, sign_in: SignIn
) -> None:
    phone_only = client_for(make_user(phone="+97333123485"))
    older_sessions()
    r = phone_only.post(f"{API}/me/step-up", json={})  # no email: the phone number
    assert r.status_code == 202
    assert r.json()["channel"] == "sms"
    r = phone_only.post(f"{API}/me/step-up", json={"via": "email"})
    assert r.status_code == 422
    assert set(r.json()["error"]["fields"]) == {"via"}
    make_user(email="both@example.com", phone="+97333123486")
    both, _ = sign_in("both@example.com")
    older_sessions()
    assert _step_up(both, outbox, "+97333123486", via="phone")["expiresIn"] > 0
    assert both.delete(f"{API}/me/identifiers/email").status_code == 200


def test_delete_the_account_after_a_step_up(
    sign_in: SignIn, make_user: MakeUser, older_sessions: Older, outbox: Outbox, db: Session
) -> None:
    user = make_user(email="leaving@example.com")
    c, _ = sign_in("leaving@example.com")
    older_sessions()
    assert c.delete(f"{API}/me").status_code == 403
    _step_up(c, outbox, "leaving@example.com")
    assert c.delete(f"{API}/me").status_code == 204
    assert db.scalar(select(User).where(User.id == user.id).execution_options(populate_existing=True)) is None


def test_the_window_closes(client_for: ClientFor, make_user: MakeUser, older_sessions: Older, outbox: Outbox) -> None:
    c = client_for(make_user(email="window@example.com", phone="+97333123487"))
    older_sessions()
    _step_up(c, outbox, "window@example.com")
    older_sessions()  # the new session is now older than the window too
    assert c.delete(f"{API}/me/identifiers/phone").json()["error"]["code"] == "step_up_required"


def test_codes_work_only_in_their_own_flow(
    client_for: ClientFor, make_user: MakeUser, older_sessions: Older, outbox: Outbox
) -> None:
    owner = make_user(email="flows@example.com")
    c = client_for(owner)
    older_sessions()
    r = c.post(f"{API}/me/step-up", json={})
    step_up_code, step_up_challenge = outbox[-1].code, r.json()["challengeId"]
    # a step-up code can't sign anyone in, even in another browser
    guest = client_for()
    assert verify(guest, step_up_challenge, step_up_code).status_code == 410
    # nor can someone else's session use it
    other = client_for(make_user(email="someone@example.com"))
    r = other.post(f"{API}/me/step-up/verify", json={"challengeId": step_up_challenge, "code": step_up_code})
    assert r.status_code == 410
    # and a sign-in code can't confirm a step-up
    r = start(client_for(), "flows@example.com")
    assert r.status_code == 202
    r2 = c.post(f"{API}/me/step-up/verify", json={"challengeId": r.json()["challengeId"], "code": outbox[-1].code})
    assert r2.status_code == 410


def test_wrong_step_up_codes_count(
    client_for: ClientFor, make_user: MakeUser, older_sessions: Older, outbox: Outbox, db: Session
) -> None:
    c = client_for(make_user(email="guess@example.com"))
    older_sessions()
    r = c.post(f"{API}/me/step-up", json={})
    challenge, code = r.json()["challengeId"], outbox[-1].code
    for left in (4, 3, 2, 1):
        r2 = c.post(f"{API}/me/step-up/verify", json={"challengeId": challenge, "code": wrong(code)})
        assert r2.status_code == 422
        assert f"{left} tr" in r2.json()["error"]["message"]
    r2 = c.post(f"{API}/me/step-up/verify", json={"challengeId": challenge, "code": wrong(code)})
    assert r2.json()["error"]["code"] == "too_many_attempts"
    r2 = c.post(f"{API}/me/step-up/verify", json={"challengeId": challenge, "code": code})
    assert r2.status_code == 429
    row = db.get(OtpChallenge, challenge)
    assert row is not None
    assert row.user_id is not None  # bound to the account


def test_guests_cannot_step_up(client: TestClient) -> None:
    assert client.post(f"{API}/me/step-up", json={}).status_code == 401
    body = {"challengeId": str(uuid.uuid4()), "code": "123456"}
    assert client.post(f"{API}/me/step-up/verify", json=body).status_code == 401
