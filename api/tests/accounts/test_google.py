"""Continue with Google: the OpenID Connect flow against a fake Google (token endpoint and keys), what the ID token must
pass, replays, the takeover of unconfirmed accounts, linking, and the admin bootstrap."""

from __future__ import annotations

from collections.abc import Callable
from typing import Any
from urllib.parse import parse_qs, urlsplit

import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_token
from app.models import AuditEntry, GoogleLogin, PasswordReset, User, UserSession
from app.services import google
from tests.accounts.conftest import (
    API,
    CLIENT_ID,
    PASSWORD,
    FakeGoogle,
    GoogleSignIn,
    google_callback,
    google_start,
    sign_in_with,
)

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]
SetOption = Callable[[str, Any], None]


def _back(r: Any) -> tuple[str, dict[str, str]]:
    """Where the callback sent the browser: (path, query)."""
    assert r.status_code == 303, r.text
    parts = urlsplit(r.headers["location"])
    assert not parts.scheme
    assert not parts.netloc
    return parts.path, {k: v[0] for k, v in parse_qs(parts.query).items()}


def _error(r: Any) -> str | None:
    return _back(r)[1].get("authError")


# ── the flow ────────────────────────────────────────────────────────────────────────────────


def test_off_without_the_settings(client: TestClient) -> None:
    r = client.post(f"{API}/auth/google", json={"returnTo": "/forum"})
    assert r.status_code == 404
    assert "isn't set up" in r.json()["error"]["message"]


def test_the_authorization_url(fake_google: FakeGoogle, client: TestClient) -> None:
    r = client.post(f"{API}/auth/google", json={"returnTo": "/forum?tab=new"})
    url = urlsplit(r.json()["url"])
    assert f"{url.scheme}://{url.netloc}{url.path}" == google.AUTHORIZE_URL
    query = {k: v[0] for k, v in parse_qs(url.query).items()}
    assert query["client_id"] == CLIENT_ID
    assert query["redirect_uri"] == "http://127.0.0.1:5173/api/v1/auth/google/callback"
    assert query["response_type"] == "code"
    assert query["scope"] == "openid email"
    assert query["code_challenge_method"] == "S256"
    assert len(query["state"]) >= 43
    assert len(query["nonce"]) >= 43
    assert query["state"] != query["nonce"]
    cookie = next(h for h in r.headers.get_list("set-cookie") if h.startswith("dsba_google="))
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "Max-Age=600" in cookie


def test_a_new_account_signs_in(
    fake_google: FakeGoogle, google_sign_in: GoogleSignIn, client_for: ClientFor, db: Session
) -> None:
    c = client_for()
    r = google_sign_in(c, return_to="/forum?tab=new", sub="sub-sara", email="Sara@Gmail.com")
    assert _back(r) == ("/forum", {"tab": "new"})
    me = c.get(f"{API}/me").json()
    assert me["email"] == "sara@gmail.com"
    assert me["emailConfirmed"] is True
    assert me["googleLinked"] is True
    assert me["hasPassword"] is False
    assert me["needsProfile"] is True
    # PKCE: the verifier went to the token endpoint, and hashes to the challenge sent to Google
    [sent] = fake_google.token_requests
    assert sent["grant_type"] == ["authorization_code"]
    assert sent["code"] == ["the-code"]
    assert sent["client_secret"] == ["test-secret"]
    assert sent["redirect_uri"] == ["http://127.0.0.1:5173/api/v1/auth/google/callback"]
    login = db.scalar(select(GoogleLogin))
    assert login is not None
    assert sent["code_verifier"] == [login.code_verifier]
    cleared = next(h for h in r.headers.get_list("set-cookie") if h.startswith("dsba_google="))
    assert "Max-Age=0" in cleared or "expires=" in cleared.lower()


def test_the_same_google_account_signs_in_again(google_sign_in: GoogleSignIn, client_for: ClientFor) -> None:
    first, second = client_for(), client_for()
    google_sign_in(first, sub="sub-1", email="same@gmail.com")
    google_sign_in(second, sub="sub-1", email="same@gmail.com")
    assert first.get(f"{API}/me").json()["id"] == second.get(f"{API}/me").json()["id"]


def test_the_session_rotates(google_sign_in: GoogleSignIn, make_user: MakeUser, client_for: ClientFor) -> None:
    make_user(email="someone@example.com", password=PASSWORD)
    c = client_for()
    sign_in_with(c, "someone@example.com")
    old = c.cookies.get("dsba_session")
    google_sign_in(c, sub="sub-new", email="new@gmail.com")
    assert c.cookies.get("dsba_session") not in (None, old)
    assert c.get(f"{API}/me").json()["email"] == "new@gmail.com"


@pytest.mark.parametrize(
    ("raw", "safe"),
    [
        ("/forum", "/forum"),
        ("/library/abc?x=1#top", "/library/abc?x=1#top"),
        ("//evil.example/x", "/"),
        ("/\\evil.example", "/"),
        ("https://evil.example", "/"),
        ("evil.example", "/"),
        ("/api/v1/me", "/"),
        ("/forum\nSet-Cookie: x", "/"),
        ("/" + "a" * 600, "/"),
        (None, "/"),
    ],
)
def test_only_same_origin_paths_to_go_back_to(raw: str | None, safe: str) -> None:
    assert google.safe_return(raw) == safe


def test_another_site_to_go_back_to_becomes_home(google_sign_in: GoogleSignIn, client_for: ClientFor) -> None:
    r = google_sign_in(client_for(), return_to="//evil.example/steal", sub="sub-x", email="x@gmail.com")
    assert _back(r) == ("/", {})


# ── what the ID token must pass ─────────────────────────────────────────────────────────────


@pytest.mark.parametrize(
    ("claims", "error"),
    [
        ({"aud": "someone-else.apps.googleusercontent.com"}, "google_failed"),
        ({"iss": "https://evil.example"}, "google_failed"),
        ({"exp": 1_000_000_000}, "google_failed"),  # long expired
        ({"iat": None}, "google_failed"),
        ({"nonce": "not-the-nonce"}, "google_failed"),
        ({"nonce": None}, "google_failed"),
        ({"sub": None}, "google_failed"),
        ({"email_verified": False}, "google_unverified"),
        ({"email_verified": "true"}, "google_unverified"),  # only a real true counts
        ({"email": "not an address"}, "google_failed"),
    ],
)
def test_bad_id_tokens_sign_nobody_in(
    google_sign_in: GoogleSignIn, client_for: ClientFor, db: Session, claims: dict[str, Any], error: str
) -> None:
    c = client_for()
    r = google_sign_in(c, return_to="/forum", **claims)
    assert _back(r)[0] == "/forum"
    assert _error(r) == error
    assert c.get(f"{API}/me").status_code == 401
    assert db.scalar(select(User).where(User.email == "sara@gmail.com")) is None


def test_a_token_signed_with_another_key(fake_google: FakeGoogle, client_for: ClientFor) -> None:
    c = client_for()
    query = google_start(c)
    fake_google.nonce = query["nonce"]
    other = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    fake_google.token_body = {"id_token": fake_google.id_token(key=other)}
    r = google_callback(c, query["state"])
    assert _error(r) == "google_failed"
    assert c.get(f"{API}/me").status_code == 401


def test_a_token_naming_an_unknown_key(fake_google: FakeGoogle, client_for: ClientFor) -> None:
    c = client_for()
    query = google_start(c)
    fake_google.nonce = query["nonce"]
    fake_google.kid = "rotated-away"
    fake_google.token_body = {"id_token": fake_google.id_token()}
    fake_google.kid = "test-key"  # Google no longer publishes the key the token names
    assert _error(google_callback(c, query["state"])) == "google_failed"
    assert fake_google.key_fetches == 1


def test_an_unsigned_token(fake_google: FakeGoogle, client_for: ClientFor) -> None:
    import jwt

    c = client_for()
    query = google_start(c)
    claims = {"iss": "https://accounts.google.com", "aud": CLIENT_ID, "sub": "x", "email": "x@gmail.com"}
    fake_google.token_body = {"id_token": jwt.encode({**claims, "nonce": query["nonce"]}, key="", algorithm="none")}
    assert _error(google_callback(c, query["state"])) == "google_failed"


@pytest.mark.parametrize(
    ("status", "body"), [(400, {"error": "invalid_grant"}), (200, {"access_token": "x"}), (500, {})]
)
def test_the_token_endpoint_refuses(
    fake_google: FakeGoogle, client_for: ClientFor, status: int, body: dict[str, Any]
) -> None:
    c = client_for()
    query = google_start(c)
    fake_google.token_status, fake_google.token_body = status, body
    assert _error(google_callback(c, query["state"])) == "google_failed"


def test_cancelled_at_google(fake_google: FakeGoogle, client_for: ClientFor) -> None:
    c = client_for()
    query = google_start(c, "/library")
    r = c.get(
        f"{API}/auth/google/callback",
        params={"state": query["state"], "error": "access_denied"},
        follow_redirects=False,
    )
    assert _back(r) == ("/library", {"authError": "google_cancelled"})
    assert fake_google.token_requests == []


def test_the_keys_are_cached(google_sign_in: GoogleSignIn, fake_google: FakeGoogle, client_for: ClientFor) -> None:
    google_sign_in(client_for(), sub="a", email="a@gmail.com")
    google_sign_in(client_for(), sub="b", email="b@gmail.com")
    assert fake_google.key_fetches == 1


# ── state, replays and other browsers ───────────────────────────────────────────────────────


def test_a_state_works_once(fake_google: FakeGoogle, client_for: ClientFor) -> None:
    c = client_for()
    query = google_start(c)
    fake_google.nonce = query["nonce"]
    state = query["state"]
    assert _error(google_callback(c, state)) is None
    c.cookies.set("dsba_google", state)  # the cookie put back, and the same callback again
    assert _error(google_callback(c, state)) == "google_failed"
    assert len(fake_google.token_requests) == 1


def test_a_state_from_another_browser_fails(fake_google: FakeGoogle, client_for: ClientFor) -> None:
    """Login CSRF: someone else's callback link, opened in this browser, doesn't sign it in."""
    attacker, victim = client_for(), client_for()
    query = google_start(attacker)
    fake_google.nonce = query["nonce"]
    r = google_callback(victim, query["state"])
    assert _error(r) == "google_failed"
    assert victim.get(f"{API}/me").status_code == 401
    assert fake_google.token_requests == []


def test_a_missing_or_unknown_state_fails(fake_google: FakeGoogle, client_for: ClientFor) -> None:
    c = client_for()
    google_start(c)
    assert _error(c.get(f"{API}/auth/google/callback", params={"code": "x"}, follow_redirects=False)) == "google_failed"
    c.cookies.set("dsba_google", "made-up-state")
    assert _error(google_callback(c, "made-up-state")) == "google_failed"


def test_an_expired_state_fails(fake_google: FakeGoogle, client_for: ClientFor, db: Session) -> None:
    from datetime import timedelta

    c = client_for()
    query = google_start(c)
    login = db.scalar(select(GoogleLogin).where(GoogleLogin.state_hash == hash_token(query["state"])))
    assert login is not None
    login.expires_at -= timedelta(minutes=11)
    db.commit()
    assert _error(google_callback(c, query["state"])) == "google_failed"


def test_a_replayed_nonce_fails(fake_google: FakeGoogle, client_for: ClientFor) -> None:
    """An ID token from an earlier sign-in, replayed into a new one, carries the old nonce."""
    c = client_for()
    first = google_start(c)
    fake_google.nonce = first["nonce"]
    old_token = fake_google.id_token()
    assert _error(google_callback(c, first["state"])) is None
    second = google_start(c)
    fake_google.token_body = {"id_token": old_token}
    assert _error(google_callback(c, second["state"])) == "google_failed"


def test_starts_per_network(fake_google: FakeGoogle, client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(google, "STARTS_PER_NETWORK_PER_HOUR", 2)
    assert client.post(f"{API}/auth/google", json={}).status_code == 200
    assert client.post(f"{API}/auth/google", json={}).status_code == 200
    r = client.post(f"{API}/auth/google", json={})
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "rate_limited"


# ── takeover: Google outranks an address typed at sign-up ──────────────────────────────────


def test_google_takes_over_an_unconfirmed_account(
    google_sign_in: GoogleSignIn, make_user: MakeUser, client_for: ClientFor, db: Session
) -> None:
    squatter = make_user(email="owner@gmail.com", password=PASSWORD, confirmed=False, name="Squatter")
    their_browser = client_for(squatter)
    db.add(PasswordReset(user_id=squatter.id, token_hash="r" * 64, expires_at=squatter.created_at.replace(year=2100)))
    db.commit()
    owner = client_for()
    r = google_sign_in(owner, sub="sub-owner", email="owner@gmail.com")
    assert _error(r) is None
    me = owner.get(f"{API}/me").json()
    assert me["id"] == str(squatter.id)
    assert me["emailConfirmed"] is True
    assert me["hasPassword"] is False
    assert their_browser.get(f"{API}/me").status_code == 401  # every old session ended
    assert sign_in_with(client_for(), "owner@gmail.com").status_code == 422  # the old password is gone
    db.expire_all()
    reset = db.scalar(select(PasswordReset).where(PasswordReset.user_id == squatter.id))
    assert reset is not None
    assert reset.used_at is not None
    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "user.takeover"))
    assert entry is not None
    assert entry.target_id == str(squatter.id)
    assert entry.actor_id is None
    assert entry.data == {"via": "google", "hadPassword": True, "targetName": "Squatter"}


def test_a_confirmed_account_is_never_taken_over(
    google_sign_in: GoogleSignIn, make_user: MakeUser, client_for: ClientFor, db: Session
) -> None:
    holder = make_user(email="kept@gmail.com", password=PASSWORD)
    holder.google_sub = "sub-original"
    db.commit()
    c = client_for()
    r = google_sign_in(c, sub="sub-impostor", email="kept@gmail.com")
    assert _error(r) == "email_taken"
    assert c.get(f"{API}/me").status_code == 401
    assert sign_in_with(client_for(), "kept@gmail.com").status_code == 200


def test_a_confirmed_password_account_gets_google(
    google_sign_in: GoogleSignIn, make_user: MakeUser, client_for: ClientFor, db: Session
) -> None:
    """Confirmed earlier (by Google, or dev-login), with no Google account on it yet: Google signs in to it, and the
    password stays."""
    holder = make_user(email="both@gmail.com", password=PASSWORD)
    c = client_for()
    assert _error(google_sign_in(c, sub="sub-both", email="both@gmail.com")) is None
    me = c.get(f"{API}/me").json()
    assert me["id"] == str(holder.id)
    assert me["hasPassword"] is True
    assert me["googleLinked"] is True


# ── admins ──────────────────────────────────────────────────────────────────────────────────


def _slugs(c: TestClient) -> list[str]:
    return [r["slug"] for r in c.get(f"{API}/me").json()["roles"]]


def test_admin_identifiers_apply_on_a_google_sign_in_only(
    google_sign_in: GoogleSignIn, set_option: SetOption, client_for: ClientFor, db: Session
) -> None:
    set_option("admin_identifiers", ["Founder@Gmail.com"])
    by_password = client_for()
    r = by_password.post(f"{API}/auth/sign-up", json={"email": "founder@gmail.com", "password": PASSWORD})
    assert r.status_code == 201
    assert [x["slug"] for x in r.json()["user"]["roles"]] == ["student"]  # typed, not confirmed: no Admin
    c = client_for()
    google_sign_in(c, sub="sub-founder", email="founder@gmail.com")  # takes the typed account over
    assert _slugs(c) == ["admin", "student"]
    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "user.roles"))
    assert entry is not None
    assert entry.data["via"] == "bootstrap"


def test_admin_identifiers_wait_while_the_hub_has_an_admin(
    google_sign_in: GoogleSignIn, set_option: SetOption, make_user: MakeUser, client_for: ClientFor
) -> None:
    make_user(roles=("student", "admin"))
    set_option("admin_identifiers", ["late@gmail.com"])
    c = client_for()
    google_sign_in(c, sub="sub-late", email="late@gmail.com")
    assert _slugs(c) == ["student"]


# ── linking Google to a signed-in account ──────────────────────────────────────────────────


def test_link_google_confirms_the_account(
    google_sign_in: GoogleSignIn, make_user: MakeUser, client_for: ClientFor, db: Session
) -> None:
    user = make_user(email="typed@example.com", password=PASSWORD, confirmed=False)
    other_browser = client_for(user)
    c = client_for(user)
    r = google_sign_in(c, return_to="/account", path="/me/google", sub="sub-typed", email="real@gmail.com")
    assert _back(r) == ("/account", {})
    me = c.get(f"{API}/me").json()
    assert me["id"] == str(user.id)
    assert me["email"] == "real@gmail.com"  # the Google account's address, confirmed
    assert me["emailConfirmed"] is True
    assert me["googleLinked"] is True
    assert me["hasPassword"] is True
    assert other_browser.get(f"{API}/me").status_code == 401
    login = db.scalar(select(GoogleLogin))
    assert login is not None
    assert login.user_id == user.id


def test_link_needs_a_recent_sign_in(
    fake_google: FakeGoogle, make_user: MakeUser, client_for: ClientFor, older_sessions: Callable[..., None]
) -> None:
    c = client_for(make_user(password=PASSWORD))
    older_sessions()
    r = c.post(f"{API}/me/google", json={})
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "step_up_required"


def test_link_refuses_a_google_account_another_account_has(
    google_sign_in: GoogleSignIn, make_user: MakeUser, client_for: ClientFor, db: Session
) -> None:
    taken = make_user(email="first@gmail.com")
    taken.google_sub = "sub-taken"
    db.commit()
    c = client_for(make_user(email="second@example.com", password=PASSWORD, confirmed=False))
    r = google_sign_in(c, path="/me/google", return_to="/account", sub="sub-taken", email="first@gmail.com")
    assert _back(r) == ("/account", {"authError": "google_taken"})
    assert c.get(f"{API}/me").json()["googleLinked"] is False


def test_link_refuses_an_address_another_account_has(
    google_sign_in: GoogleSignIn, make_user: MakeUser, client_for: ClientFor
) -> None:
    make_user(email="theirs@gmail.com")
    c = client_for(make_user(email="mine@example.com", password=PASSWORD, confirmed=False))
    r = google_sign_in(c, path="/me/google", return_to="/account", sub="sub-mine", email="theirs@gmail.com")
    assert _error(r) == "email_taken"
    assert c.get(f"{API}/me").json()["email"] == "mine@example.com"


def test_link_in_a_browser_that_signed_out_fails(
    fake_google: FakeGoogle, make_user: MakeUser, client_for: ClientFor
) -> None:
    c = client_for(make_user(password=PASSWORD))
    query = google_start(c, "/account", "/me/google")
    fake_google.nonce = query["nonce"]
    c.post(f"{API}/auth/logout")
    c.headers["X-CSRF-Token"] = c.cookies.get("dsba_csrf") or ""
    assert _error(google_callback(c, query["state"])) == "google_failed"


def test_guests_cannot_link(fake_google: FakeGoogle, client: TestClient) -> None:
    assert client.post(f"{API}/me/google", json={}).status_code == 401


def test_the_google_cookie_is_host_only_in_production(set_option: SetOption) -> None:
    set_option("session_cookie", "__Host-dsba_session")
    assert google.cookie_name() == "__Host-dsba_google"


def test_deleting_the_account_deletes_its_google_logins(
    fake_google: FakeGoogle, make_user: MakeUser, client_for: ClientFor, db: Session, storage: Any
) -> None:
    from app.services import accounts

    user = make_user(password=PASSWORD)
    google_start(client_for(user), "/account", "/me/google")
    accounts.delete_account(db, user, storage)
    db.commit()
    assert db.scalar(select(GoogleLogin).where(GoogleLogin.user_id == user.id)) is None
    assert db.scalars(select(UserSession).where(UserSession.user_id == user.id)).all() == []
