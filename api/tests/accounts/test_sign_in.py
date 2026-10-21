"""Signing up and in with an email address and a password: the flow, enumeration resistance, the limits and the session
it creates."""

from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_token
from app.core.time import utcnow
from app.models import AttemptKind, SignInAttempt, User, UserSession
from app.routers import auth as auth_router
from app.services import passwords
from tests.accounts.conftest import API, PASSWORD, SignIn, logout, sign_in_with, sign_up, sync_csrf

ClientFor = Callable[..., TestClient]
SetOption = Callable[[str, Any], None]


@pytest.fixture
def from_ip(monkeypatch: pytest.MonkeyPatch) -> None:
    """Requests come from the address in their X-Test-IP header (the test client has none)."""
    monkeypatch.setattr(auth_router, "client_ip", lambda request: request.headers.get("x-test-ip"))


def _error(r: Any) -> str:
    return str(r.json()["error"]["code"])


def _post(c: TestClient, path: str, body: dict[str, str], headers: dict[str, str]) -> Any:
    """A POST from the address in `headers`, keeping the CSRF header in step with the cookie afterwards."""
    r = c.post(f"{API}{path}", json=body, headers=headers)
    sync_csrf(c)
    return r


# ── signing up ──────────────────────────────────────────────────────────────────────────────


def test_sign_up_creates_an_account_and_signs_in(client_for: ClientFor, db: Session) -> None:
    c = client_for()
    r = sign_up(c, "  Sara.Student@Example.com ")
    assert r.status_code == 201, r.text
    result = r.json()
    assert result["isNewUser"] is True
    me = result["user"]
    assert me["email"] == "sara.student@example.com"
    assert me["emailConfirmed"] is False  # nobody checked the address
    assert me["hasPassword"] is True
    assert me["googleLinked"] is False
    assert me["needsProfile"] is True
    assert [role["slug"] for role in me["roles"]] == ["student"]
    assert "phone" not in me
    cookie = next(h for h in r.headers.get_list("set-cookie") if h.startswith("dsba_session="))
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert c.get(f"{API}/me").json()["id"] == me["id"]
    user = db.get(User, me["id"])
    assert user is not None
    assert user.password_hash is not None
    assert user.password_hash.startswith("$argon2id$")
    assert PASSWORD not in user.password_hash


@pytest.mark.parametrize("password", ["newday82", "newday823"])
def test_sign_up_accepts_eight_and_nine_character_passwords(client_for: ClientFor, password: str) -> None:
    c = client_for()
    r = sign_up(c, "minimum@example.com", password)
    assert r.status_code == 201, r.text
    assert sign_in_with(client_for(), "minimum@example.com", password).status_code == 200


def test_sign_up_with_a_taken_address(client_for: ClientFor, make_user: Callable[..., User]) -> None:
    make_user(email="taken@example.com")
    r = sign_up(client_for(), "Taken@Example.com")
    assert r.status_code == 409
    assert _error(r) == "email_taken"


@pytest.mark.parametrize(
    ("password", "says"),
    [
        ("seven82", "at least 8"),
        ("password123", "most common"),
        ("1234567890", "most common"),
        ("QWERTYUIOP", "most common"),  # any case
        ("newstudent@example.com", "email address"),
        ("newstudent", "email address"),
        ("aaaaaaaaaaaa", "two different"),
    ],
)
def test_weak_passwords_are_refused(client_for: ClientFor, password: str, says: str, db: Session) -> None:
    r = sign_up(client_for(), "newstudent@example.com", password)
    assert r.status_code == 422
    assert _error(r) == "weak_password"
    assert says in r.json()["error"]["fields"]["password"]
    assert db.scalar(select(User).where(User.email == "newstudent@example.com")) is None


def test_invalid_email(client_for: ClientFor) -> None:
    r = sign_up(client_for(), "not-an-address")
    assert r.status_code == 422
    assert _error(r) == "invalid_email"


def test_sign_ups_per_network(client_for: ClientFor, set_option: SetOption, from_ip: None) -> None:
    set_option("sign_ups_per_network_per_hour", 2)
    c = client_for()
    here, there = {"x-test-ip": "203.0.113.7"}, {"x-test-ip": "198.51.100.1"}
    assert _post(c, "/auth/sign-up", {"email": "a1@example.com", "password": PASSWORD}, here).status_code == 201
    # a taken address counts too, so sign-up can't be used to test many addresses
    taken = _post(c, "/auth/sign-up", {"email": "a1@example.com", "password": PASSWORD}, here)
    assert taken.status_code == 409
    r = _post(c, "/auth/sign-up", {"email": "a3@example.com", "password": PASSWORD}, here)
    assert r.status_code == 429
    assert _error(r) == "rate_limited"
    assert r.json()["error"]["retryAfter"] > 0
    ok = _post(c, "/auth/sign-up", {"email": "a3@example.com", "password": PASSWORD}, there)
    assert ok.status_code == 201


def test_sign_ups_per_network_per_day(client_for: ClientFor, set_option: SetOption, age: Callable[..., None]) -> None:
    set_option("sign_ups_per_network_per_hour", 1)
    set_option("sign_ups_per_network_per_day", 2)
    assert sign_up(client_for(), "d1@example.com").status_code == 201
    age(3601)
    assert sign_up(client_for(), "d2@example.com").status_code == 201
    age(3601)
    assert sign_up(client_for(), "d3@example.com").status_code == 429


def test_ipv6_networks_are_counted_by_their_64(client_for: ClientFor, set_option: SetOption, from_ip: None) -> None:
    set_option("sign_ups_per_network_per_hour", 1)
    c = client_for()

    def go(ip: str, n: int) -> int:
        body = {"email": f"v6-{n}@example.com", "password": PASSWORD}
        return int(_post(c, "/auth/sign-up", body, {"x-test-ip": ip}).status_code)

    assert go("2001:db8:1:2::1", 1) == 201
    assert go("2001:db8:1:2:ffff::9", 2) == 429  # the same /64
    assert go("2001:db8:1:3::1", 3) == 201  # the next one


# ── signing in ──────────────────────────────────────────────────────────────────────────────


def test_sign_in_with_the_password(client_for: ClientFor, make_user: Callable[..., User], db: Session) -> None:
    user = make_user(email="back@example.com", password=PASSWORD)
    c = client_for()
    r = sign_in_with(c, "BACK@example.com")
    assert r.status_code == 200, r.text
    assert r.json()["isNewUser"] is False
    assert r.json()["user"]["id"] == str(user.id)
    assert c.get(f"{API}/me").status_code == 200
    kinds = db.scalars(select(SignInAttempt.kind)).all()
    assert kinds == [AttemptKind.sign_in]


@pytest.mark.parametrize("case", ["wrong password", "unknown address", "no password (Google only)"])
def test_failures_answer_alike(client_for: ClientFor, make_user: Callable[..., User], case: str) -> None:
    """An unknown address, an account without a password and a wrong password get the same answer: nothing says
    whether an account exists."""
    make_user(email="known@example.com", password=PASSWORD)
    make_user(email="google-only@example.com")
    email, password = {
        "wrong password": ("known@example.com", "not the right one"),
        "unknown address": ("nobody@example.com", PASSWORD),
        "no password (Google only)": ("google-only@example.com", PASSWORD),
    }[case]
    c = client_for()
    r = sign_in_with(c, email, password)
    assert r.status_code == 422
    assert r.json() == {
        "error": {
            "code": "invalid_credentials",
            "message": "This email address and password don't match. Try again, or continue with Google.",
        }
    }
    assert c.get(f"{API}/me").status_code == 401


def test_unknown_addresses_take_the_same_work(
    client_for: ClientFor, make_user: Callable[..., User], monkeypatch: pytest.MonkeyPatch
) -> None:
    """The password is checked against a stand-in hash when there is no account, so the answer takes as long."""
    make_user(email="timed@example.com", password=PASSWORD)
    real = passwords.hasher()
    checked: list[str] = []

    class Spy:
        def verify(self, stored: str, password: str) -> bool:
            checked.append(stored)
            return real.verify(stored, password)

        def hash(self, password: str) -> str:
            return real.hash(password)

    monkeypatch.setattr(passwords, "hasher", Spy)
    c = client_for()
    sign_in_with(c, "timed@example.com", "wrong password here")
    sign_in_with(c, "nobody-here@example.com", "wrong password here")
    assert len(checked) == 2
    assert all(h.startswith("$argon2id$") for h in checked)


def test_wrong_passwords_lock_the_address_from_one_network(
    client_for: ClientFor,
    make_user: Callable[..., User],
    set_option: SetOption,
    from_ip: None,
    age: Callable[..., None],
) -> None:
    """Decision D4: wrong passwords from one network stop that network, not the owner elsewhere."""
    make_user(email="target@example.com", password=PASSWORD)
    set_option("sign_in_failures_per_address_network_per_hour", 3)
    c = client_for()
    attacker, owner = {"x-test-ip": "203.0.113.66"}, {"x-test-ip": "198.51.100.5"}

    def go(password: str, headers: dict[str, str]) -> Any:
        return _post(c, "/auth/sign-in", {"email": "target@example.com", "password": password}, headers)

    for _ in range(3):
        assert go("guess guess guess", attacker).status_code == 422
    blocked = go(PASSWORD, attacker)  # even the right password: the pair is locked for the hour
    assert blocked.status_code == 429
    assert _error(blocked) == "rate_limited"
    assert "continue with Google" in blocked.json()["error"]["message"]
    assert go(PASSWORD, owner).status_code == 200
    age(3601)
    assert go(PASSWORD, attacker).status_code == 200


def test_wrong_passwords_from_everywhere_slow_the_address(
    client_for: ClientFor, make_user: Callable[..., User], set_option: SetOption, from_ip: None
) -> None:
    make_user(email="spray@example.com", password=PASSWORD)
    set_option("sign_in_failures_per_address_per_hour", 4)
    c = client_for()
    for i in range(4):
        body = {"email": "spray@example.com", "password": "guess guess guess"}
        assert _post(c, "/auth/sign-in", body, {"x-test-ip": f"203.0.113.{i}"}).status_code == 422
    body = {"email": "spray@example.com", "password": PASSWORD}
    assert _post(c, "/auth/sign-in", body, {"x-test-ip": "198.51.100.9"}).status_code == 429


def test_unknown_addresses_are_limited_like_known_ones(
    client_for: ClientFor, set_option: SetOption, from_ip: None
) -> None:
    set_option("sign_in_failures_per_address_network_per_hour", 2)
    c = client_for()
    here = {"x-test-ip": "203.0.113.8"}
    codes = [
        _post(c, "/auth/sign-in", {"email": "ghost@example.com", "password": PASSWORD}, here).status_code
        for _ in range(3)
    ]
    assert codes == [422, 422, 429]


def test_sign_ins_per_network(
    client_for: ClientFor, make_user: Callable[..., User], set_option: SetOption, from_ip: None
) -> None:
    make_user(email="lab1@example.com", password=PASSWORD)
    set_option("sign_ins_per_network_per_hour", 2)
    c = client_for()
    lab = {"x-test-ip": "203.0.113.20"}
    body = {"email": "lab1@example.com", "password": PASSWORD}
    assert _post(c, "/auth/sign-in", body, lab).status_code == 200
    assert _post(c, "/auth/sign-in", body, lab).status_code == 200
    assert _post(c, "/auth/sign-in", body, lab).status_code == 429
    assert _post(c, "/auth/sign-in", body, {"x-test-ip": "203.0.113.21"}).status_code == 200


def test_address_variants_share_their_limits(
    client_for: ClientFor, make_user: Callable[..., User], set_option: SetOption
) -> None:
    make_user(email="name.surname@gmail.com", password=PASSWORD)
    set_option("sign_in_failures_per_address_network_per_hour", 2)
    c = client_for()
    assert sign_in_with(c, "namesurname+1@gmail.com", "guess guess guess").status_code == 422
    assert sign_in_with(c, "n.a.m.e.surname@googlemail.com", "guess guess guess").status_code == 422
    assert sign_in_with(c, "name.surname@gmail.com").status_code == 429


def test_attempts_keep_no_address(client_for: ClientFor, db: Session) -> None:
    sign_in_with(client_for(), "private@example.com", "guess guess guess")
    [row] = db.scalars(select(SignInAttempt)).all()
    assert row.account_key is not None
    assert "private" not in row.account_key
    assert len(row.account_key) == 64


def test_the_csrf_header_is_required(client_for: ClientFor) -> None:
    c = client_for()
    c.headers.pop("X-CSRF-Token")
    r = c.post(f"{API}/auth/sign-up", json={"email": "csrf@example.com", "password": PASSWORD})
    assert r.status_code == 403
    assert _error(r) == "csrf_failed"


# ── the session ─────────────────────────────────────────────────────────────────────────────


def test_session_state_says_whether_google_is_set_up(client: TestClient, set_option: SetOption) -> None:
    assert client.get(f"{API}/auth/session").json() == {"me": None, "googleSignIn": False}
    set_option("google_client_id", "id.apps.googleusercontent.com")
    from pydantic import SecretStr

    set_option("google_client_secret", SecretStr("secret"))
    assert client.get(f"{API}/auth/session").json() == {"me": None, "googleSignIn": True}


def test_logout(sign_in: SignIn, db: Session) -> None:
    c, _ = sign_in("leaving@example.com")
    token = c.cookies.get("dsba_session")
    assert token
    csrf_before = c.cookies.get("dsba_csrf")
    r = logout(c)
    assert r.status_code == 204
    assert c.cookies.get("dsba_csrf") not in (None, csrf_before)
    sess = db.scalar(
        select(UserSession).where(UserSession.token_hash == hash_token(token)).execution_options(populate_existing=True)
    )
    assert sess is not None
    assert sess.revoked_at is not None
    c.cookies.set("dsba_session", token)
    assert c.get(f"{API}/me").status_code == 401


def test_logout_as_a_guest(client: TestClient) -> None:
    assert logout(client).status_code == 204
    assert client.get(f"{API}/me").status_code == 401


def test_sign_in_rotates_the_session(sign_in: SignIn, db: Session) -> None:
    c, first = sign_in("rotate@example.com")
    old = c.cookies.get("dsba_session")
    assert old
    _, second = sign_in("rotate@example.com", client=c)
    new = c.cookies.get("dsba_session")
    assert new
    assert new != old
    assert first["user"]["id"] == second["user"]["id"]
    old_row = db.scalar(
        select(UserSession).where(UserSession.token_hash == hash_token(old)).execution_options(populate_existing=True)
    )
    assert old_row is None or old_row.revoked_at is not None
    c.cookies.set("dsba_session", old)
    assert c.get(f"{API}/me").status_code == 401


def test_new_session_records_the_browser(sign_in: SignIn, db: Session) -> None:
    c, result = sign_in("browser@example.com")
    sess = db.scalar(select(UserSession).where(UserSession.token_hash == hash_token(c.cookies["dsba_session"])))
    assert sess is not None
    assert sess.user_agent == "testclient"
    assert sess.expires_at - sess.created_at == timedelta(days=30)
    assert str(sess.user_id) == result["user"]["id"]


def test_sign_in_replaces_the_csrf_cookie(client_for: ClientFor, make_user: Callable[..., User]) -> None:
    make_user(email="csrf-rotate@example.com", password=PASSWORD)
    c = client_for()
    before = c.cookies.get("dsba_csrf")
    r = sign_in_with(c, "csrf-rotate@example.com")
    assert r.status_code == 200
    assert any(h.startswith("dsba_csrf=") for h in r.headers.get_list("set-cookie"))
    assert c.cookies.get("dsba_csrf") not in (None, before)
    stale = client_for()
    stale.cookies.set("dsba_session", c.cookies["dsba_session"])
    stale.headers["X-CSRF-Token"] = before or ""
    stale.cookies.set("dsba_csrf", c.cookies["dsba_csrf"])
    assert stale.post(f"{API}/auth/logout").status_code == 403


def test_at_most_20_live_sessions(sign_in: SignIn, make_user: Callable[..., User], db: Session) -> None:
    user = make_user(email="busy@example.com", password=PASSWORD)
    now = utcnow()
    for i in range(20):
        db.add(
            UserSession(
                user_id=user.id,
                token_hash=hash_token(f"old-{i}"),
                expires_at=now + timedelta(days=1),
                last_seen_at=now - timedelta(hours=20 - i),
            )
        )
    db.commit()
    sign_in("busy@example.com")
    live = db.scalars(
        select(UserSession.token_hash).where(
            UserSession.user_id == user.id, UserSession.revoked_at.is_(None), UserSession.expires_at > utcnow()
        )
    ).all()
    assert len(live) == 20
    assert hash_token("old-0") not in live
