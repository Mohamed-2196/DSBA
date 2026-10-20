"""Passwords on the account: the rules, confirming it's you, changing or adding one, the reset links admins make, and
the staff roles only confirmed accounts may hold."""

from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta
from typing import Any
from urllib.parse import urlsplit

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.core.security import hash_token
from app.models import AuditEntry, Notification, PasswordReset, User
from app.services import passwords
from tests.accounts.conftest import API, PASSWORD, Deliver, Outbox, sign_in_with, sync_csrf

ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]
Older = Callable[..., None]
NEW_PASSWORD = "a brand new passphrase"


def _code(r: Any) -> str:
    return str(r.json()["error"]["code"])


def _signed_in(client_for: ClientFor, email: str, password: str = PASSWORD) -> TestClient:
    c = client_for()
    assert sign_in_with(c, email, password).status_code == 200
    return c


# ── the rules ───────────────────────────────────────────────────────────────────────────────


def test_the_common_list_is_bundled() -> None:
    common = passwords.common_passwords()
    assert len(common) >= 990
    assert {"password", "123456", "qwerty", "1234567890"} <= common


@pytest.mark.parametrize("good", [PASSWORD, "Manama-Bahrain-2026", "ünïcödé passphrase", "x" * 9 + "yz"])
def test_good_passwords_pass(good: str) -> None:
    passwords.check_new(good, "someone@example.com")


def test_passwords_are_normalised_before_hashing() -> None:
    stored = passwords.hash_password("ﬁne ﬁne ﬁne ﬁne")  # the "fi" ligature: NFKC makes it "fi"
    assert passwords.matches(stored, "fine fine fine fine")
    assert not passwords.matches(stored, "fine fine fine fin")
    assert not passwords.matches(None, "anything at all")
    assert not passwords.matches("not a hash", "anything at all")


def test_a_weak_password_names_the_field() -> None:
    with pytest.raises(ApiError) as e:
        passwords.check_new("short", "a@example.com", field="newPassword")
    assert e.value.code == "weak_password"
    assert e.value.fields is not None
    assert "newPassword" in e.value.fields


def test_overlong_passwords_are_refused(client_for: ClientFor) -> None:
    r = client_for().post(f"{API}/auth/sign-up", json={"email": "long@example.com", "password": "x" * 257})
    assert r.status_code == 422


# ── confirming it's you ─────────────────────────────────────────────────────────────────────


def test_step_up_with_the_password(client_for: ClientFor, make_user: MakeUser, older_sessions: Older) -> None:
    make_user(email="stepper@example.com", password=PASSWORD)
    c = _signed_in(client_for, "stepper@example.com")
    older_sessions()
    assert _code(c.delete(f"{API}/me")) == "step_up_required"
    wrong = c.post(f"{API}/me/step-up", json={"password": "not my password"})
    assert wrong.status_code == 422
    assert _code(wrong) == "wrong_password"
    r = c.post(f"{API}/me/step-up", json={"password": PASSWORD})
    assert r.status_code == 200
    assert 590 <= r.json()["expiresIn"] <= 600
    sync_csrf(c)
    assert c.delete(f"{API}/me").status_code == 204


def test_wrong_step_up_passwords_count_with_sign_ins(
    client_for: ClientFor, make_user: MakeUser, set_option: Callable[[str, Any], None]
) -> None:
    make_user(email="guessed@example.com", password=PASSWORD)
    set_option("sign_in_failures_per_address_network_per_hour", 2)
    c = _signed_in(client_for, "guessed@example.com")
    assert _code(c.post(f"{API}/me/step-up", json={"password": "guess one here"})) == "wrong_password"
    assert _code(c.post(f"{API}/me/step-up", json={"password": "guess two here"})) == "wrong_password"
    assert _code(c.post(f"{API}/me/step-up", json={"password": PASSWORD})) == "rate_limited"
    assert sign_in_with(client_for(), "guessed@example.com").status_code == 429


def test_an_account_without_a_password_steps_up_with_google(client_for: ClientFor, make_user: MakeUser) -> None:
    c = client_for(make_user())
    r = c.post(f"{API}/me/step-up", json={"password": PASSWORD})
    assert r.status_code == 403
    assert "Continue with Google" in r.json()["error"]["message"]


def test_guests_cannot_step_up(client: TestClient) -> None:
    assert client.post(f"{API}/me/step-up", json={"password": PASSWORD}).status_code == 401


# ── changing or adding a password ───────────────────────────────────────────────────────────


def test_change_the_password(
    client_for: ClientFor, make_user: MakeUser, outbox: Outbox, deliver: Deliver, db: Session
) -> None:
    user = make_user(email="changer@example.com", password=PASSWORD)
    elsewhere = _signed_in(client_for, "changer@example.com")
    c = _signed_in(client_for, "changer@example.com")
    missing = c.put(f"{API}/me/password", json={"newPassword": NEW_PASSWORD})
    assert (missing.status_code, _code(missing)) == (422, "wrong_password")
    wrong = c.put(f"{API}/me/password", json={"currentPassword": "not it at all", "newPassword": NEW_PASSWORD})
    assert (wrong.status_code, _code(wrong)) == (422, "wrong_password")
    assert "currentPassword" in wrong.json()["error"]["fields"]
    weak = c.put(f"{API}/me/password", json={"currentPassword": PASSWORD, "newPassword": "password123"})
    assert (weak.status_code, _code(weak)) == (422, "weak_password")
    assert "newPassword" in weak.json()["error"]["fields"]
    r = c.put(f"{API}/me/password", json={"currentPassword": PASSWORD, "newPassword": NEW_PASSWORD})
    assert r.status_code == 200, r.text
    assert c.get(f"{API}/me").status_code == 200  # this browser stays signed in
    assert elsewhere.get(f"{API}/me").status_code == 401  # every other one is signed out
    assert sign_in_with(client_for(), "changer@example.com").status_code == 422
    assert sign_in_with(client_for(), "changer@example.com", NEW_PASSWORD).status_code == 200
    deliver()
    [notice] = outbox.to("changer@example.com")
    assert "password changed" in notice.text
    assert user.id is not None


def test_no_notice_to_an_unconfirmed_address(
    client_for: ClientFor, make_user: MakeUser, outbox: Outbox, deliver: Deliver
) -> None:
    """An address typed at sign-up may be someone else's: security notices only go to addresses Google confirmed."""
    make_user(email="typed@example.com", password=PASSWORD, confirmed=False)
    c = _signed_in(client_for, "typed@example.com")
    assert (
        c.put(f"{API}/me/password", json={"currentPassword": PASSWORD, "newPassword": NEW_PASSWORD}).status_code == 200
    )
    deliver()
    assert outbox.to("typed@example.com") == []


def test_a_google_account_adds_a_password(
    client_for: ClientFor, make_user: MakeUser, older_sessions: Older, db: Session
) -> None:
    user = make_user(email="google-user@gmail.com")
    c = client_for(user)
    r = c.put(f"{API}/me/password", json={"newPassword": NEW_PASSWORD})
    assert r.status_code == 200, r.text
    assert r.json()["hasPassword"] is True
    assert sign_in_with(client_for(), "google-user@gmail.com", NEW_PASSWORD).status_code == 200


def test_adding_a_password_needs_a_recent_sign_in(
    client_for: ClientFor, make_user: MakeUser, older_sessions: Older
) -> None:
    c = client_for(make_user(email="stale@gmail.com"))
    older_sessions()
    r = c.put(f"{API}/me/password", json={"newPassword": NEW_PASSWORD})
    assert (r.status_code, _code(r)) == (403, "step_up_required")


# ── reset links ─────────────────────────────────────────────────────────────────────────────


@pytest.fixture
def boss(make_user: MakeUser) -> User:
    return make_user(email="head@example.com", name="Head Admin", roles=("student", "admin"))


def test_an_admin_makes_a_reset_link(client_for: ClientFor, make_user: MakeUser, boss: User, db: Session) -> None:
    forgot = make_user(email="forgot@example.com", password=PASSWORD, name="Forgetful Fatima")
    old_browser = _signed_in(client_for, "forgot@example.com")
    r = client_for(boss).post(f"{API}/admin/users/{forgot.id}/reset-link")
    assert r.status_code == 200, r.text
    link = r.json()
    url = urlsplit(link["url"])
    assert f"{url.scheme}://{url.netloc}{url.path}" == "http://127.0.0.1:5173/reset-password"
    assert url.fragment.startswith("token=")
    token = url.fragment.removeprefix("token=")
    stored = db.scalar(select(PasswordReset).where(PasswordReset.user_id == forgot.id))
    assert stored is not None
    assert stored.token_hash == hash_token(token)  # only the hash is kept
    assert token not in stored.token_hash
    assert stored.expires_at - stored.created_at == timedelta(hours=1)
    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "user.reset_link"))
    assert entry is not None
    assert entry.actor_id == boss.id
    assert entry.data["targetName"] == "Forgetful Fatima"
    assert db.scalar(select(Notification).where(Notification.user_id == forgot.id)) is not None

    weak = client_for().post(f"{API}/auth/password-reset", json={"token": token, "newPassword": "password1"})
    assert (weak.status_code, _code(weak)) == (422, "weak_password")
    c = client_for()
    used = c.post(f"{API}/auth/password-reset", json={"token": token, "newPassword": NEW_PASSWORD})
    assert used.status_code == 200, used.text
    assert used.json()["user"]["id"] == str(forgot.id)
    sync_csrf(c)
    assert c.get(f"{API}/me").status_code == 200  # signed in with it
    assert old_browser.get(f"{API}/me").status_code == 401  # everything else signed out
    assert sign_in_with(client_for(), "forgot@example.com", NEW_PASSWORD).status_code == 200
    again = client_for().post(f"{API}/auth/password-reset", json={"token": token, "newPassword": "yet another phrase"})
    assert (again.status_code, _code(again)) == (410, "reset_link_invalid")
    assert db.scalar(select(AuditEntry).where(AuditEntry.action == "user.password_reset")) is not None


def test_a_reset_link_expires(client_for: ClientFor, make_user: MakeUser, boss: User, db: Session) -> None:
    forgot = make_user(password=PASSWORD)
    token = client_for(boss).post(f"{API}/admin/users/{forgot.id}/reset-link").json()["url"].split("#token=")[1]
    stored = db.scalar(select(PasswordReset).where(PasswordReset.user_id == forgot.id))
    assert stored is not None
    stored.expires_at -= timedelta(hours=1, seconds=1)
    db.commit()
    r = client_for().post(f"{API}/auth/password-reset", json={"token": token, "newPassword": NEW_PASSWORD})
    assert (r.status_code, _code(r)) == (410, "reset_link_invalid")


def test_a_new_link_retires_the_older_one(client_for: ClientFor, make_user: MakeUser, boss: User) -> None:
    forgot = make_user(password=PASSWORD)
    c = client_for(boss)
    first = c.post(f"{API}/admin/users/{forgot.id}/reset-link").json()["url"].split("#token=")[1]
    second = c.post(f"{API}/admin/users/{forgot.id}/reset-link").json()["url"].split("#token=")[1]
    old = client_for().post(f"{API}/auth/password-reset", json={"token": first, "newPassword": NEW_PASSWORD})
    assert old.status_code == 410
    new = client_for().post(f"{API}/auth/password-reset", json={"token": second, "newPassword": NEW_PASSWORD})
    assert new.status_code == 200


def test_reset_links_are_for_admins_with_a_recent_sign_in(
    client_for: ClientFor, make_user: MakeUser, boss: User, older_sessions: Older
) -> None:
    target = make_user()
    rep = make_user(roles=("student", "rep"))
    assert client_for(rep).post(f"{API}/admin/users/{target.id}/reset-link").status_code == 403
    assert client_for().post(f"{API}/admin/users/{target.id}/reset-link").status_code == 401
    c = client_for(boss)
    older_sessions()
    r = c.post(f"{API}/admin/users/{target.id}/reset-link")
    assert (r.status_code, _code(r)) == (403, "step_up_required")


def test_no_reset_links_for_admins_or_yourself(client_for: ClientFor, make_user: MakeUser, boss: User) -> None:
    other_admin = make_user(roles=("student", "admin"))
    c = client_for(boss)
    r = c.post(f"{API}/admin/users/{other_admin.id}/reset-link")
    assert r.status_code == 403
    assert _code(c.post(f"{API}/admin/users/{boss.id}/reset-link")) == "cannot_change_self"
    assert c.post(f"{API}/admin/users/00000000-0000-0000-0000-000000000000/reset-link").status_code == 404


def test_made_up_reset_tokens_are_limited(client_for: ClientFor, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(passwords, "RESET_FAILURES_PER_NETWORK_PER_HOUR", 2)
    c = client_for()
    body = {"token": "x" * 43, "newPassword": NEW_PASSWORD}
    assert c.post(f"{API}/auth/password-reset", json=body).status_code == 410
    assert c.post(f"{API}/auth/password-reset", json=body).status_code == 410
    assert _code(c.post(f"{API}/auth/password-reset", json=body)) == "rate_limited"


# ── staff roles need a confirmed address ────────────────────────────────────────────────────


def _role_id(db: Session, slug: str) -> str:
    from app.services import access

    role = access.role_by_slug(db, slug)
    assert role is not None
    return str(role.id)


def test_staff_roles_need_a_confirmed_address(
    client_for: ClientFor, make_user: MakeUser, boss: User, db: Session
) -> None:
    typed = make_user(email="typed-rep@example.com", confirmed=False)
    c = client_for(boss)
    body = {"roleIds": [_role_id(db, "student"), _role_id(db, "rep")]}
    r = c.put(f"{API}/admin/users/{typed.id}/roles", json=body)
    assert (r.status_code, _code(r)) == (409, "account_not_confirmed")
    assert "continue with Google" in r.json()["error"]["message"]
    admin = c.put(f"{API}/admin/users/{typed.id}/roles", json={"roleIds": [_role_id(db, "admin")]})
    assert _code(admin) == "account_not_confirmed"
    confirmed = make_user(email="real-rep@gmail.com")
    assert c.put(f"{API}/admin/users/{confirmed.id}/roles", json=body).status_code == 200


def test_the_people_list_says_who_is_confirmed(client_for: ClientFor, make_user: MakeUser, boss: User) -> None:
    make_user(email="unproven@example.com", name="Unproven Umar", confirmed=False)
    page = client_for(boss).get(f"{API}/admin/users", params={"q": "unproven"}).json()
    [row] = page["items"]
    assert row["emailConfirmed"] is False
    assert row["email"] == "unproven@example.com"
    assert "phone" not in row
