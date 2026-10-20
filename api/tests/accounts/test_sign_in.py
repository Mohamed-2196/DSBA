"""Signing in with a one-time code: the flow, the code rules, the limits and the session it creates."""

from __future__ import annotations

import hashlib
import hmac
import uuid
from collections.abc import Callable
from datetime import timedelta
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import hash_token
from app.core.time import utcnow
from app.models import AuditEntry, OtpChallenge, OtpPurpose, User, UserSession
from app.routers import auth as auth_router
from app.services import access, accounts, mailer
from app.services.mailer import DeliveryError
from tests.accounts.conftest import API, Outbox, SignIn, logout, start, verify, wrong

ClientFor = Callable[..., TestClient]


def _challenge(db: Session, challenge_id: str) -> OtpChallenge:
    found = db.scalar(
        select(OtpChallenge).where(OtpChallenge.id == challenge_id).execution_options(populate_existing=True)
    )
    assert found is not None
    return found


# ── the flow ────────────────────────────────────────────────────────────────────────────────


def test_sign_in_by_email_creates_an_account(client_for: ClientFor, outbox: Outbox, db: Session) -> None:
    c = client_for()
    r = start(c, "  Sara.Student@Example.com ")
    assert r.status_code == 202, r.text
    body = r.json()
    assert set(body) == {"challengeId", "channel", "destinationHint", "expiresIn", "resendAfter", "codeFormat"}
    assert body["channel"] == "email"
    assert body["codeFormat"] == "digits"
    assert body["destinationHint"] == "s•••@example.com"
    assert body["expiresIn"] == 600
    assert body["resendAfter"] == 30
    [mail] = outbox
    assert mail.channel == "email"
    assert mail.to == "sara.student@example.com"

    r = verify(c, body["challengeId"], mail.code)
    assert r.status_code == 200, r.text
    result = r.json()
    assert result["isNewUser"] is True
    me = result["user"]
    assert me["email"] == "sara.student@example.com"
    assert me["phone"] is None
    assert me["needsProfile"] is True
    assert me["displayName"] is None
    assert [r["slug"] for r in me["roles"]] == ["student"]
    assert me["status"] == "active"
    assert me["preferences"] == {  # no emails until the question about them is answered in the profile step
        "notificationEmails": None,
        "emailReplies": False,
        "emailAnswerAccepted": False,
        "emailUploadReviews": False,
        "emailNewIssues": False,
        "emailDateChanges": False,
        "emailWeeklySummary": False,
        "trackProgress": False,
        "homeBlocks": None,
    }

    cookie = next(h for h in r.headers.get_list("set-cookie") if h.startswith("dsba_session="))
    assert "HttpOnly" in cookie
    assert "SameSite=lax" in cookie
    assert "Path=/" in cookie
    assert c.get(f"{API}/me").json()["id"] == me["id"]
    user = db.get(User, me["id"])
    assert user is not None
    assert user.last_seen_at is not None


def test_sign_in_by_local_phone_number(client_for: ClientFor, outbox: Outbox) -> None:
    c = client_for()
    r = start(c, "3312 3456")
    assert r.status_code == 202, r.text
    assert r.json()["channel"] == "sms"
    assert r.json()["destinationHint"] == "+973 •••• ••56"
    [text] = outbox
    assert text.channel == "sms"
    assert text.to == "+97333123456"
    r = verify(c, r.json()["challengeId"], text.code)
    assert r.status_code == 200, r.text
    assert r.json()["user"]["phone"] == "+97333123456"
    assert r.json()["user"]["email"] is None
    assert r.json()["isNewUser"] is True


def test_existing_account_signs_in_again(sign_in: SignIn, make_user: Callable[..., User]) -> None:
    user = make_user(email="returning@example.com", name="Returning Student")
    _, result = sign_in("returning@example.com")
    assert result["isNewUser"] is False
    assert result["user"]["id"] == str(user.id)
    assert result["user"]["needsProfile"] is False
    _, by_phone = sign_in("+973 3600 0001")
    assert by_phone["isNewUser"] is True
    assert by_phone["user"]["id"] != str(user.id)


def test_start_answers_the_same_whether_or_not_an_account_exists(
    client_for: ClientFor, outbox: Outbox, make_user: Callable[..., User]
) -> None:
    make_user(email="known@example.com")
    known = start(client_for(), "known@example.com")
    unknown = start(client_for(), "unknown@example.com")
    assert known.status_code == unknown.status_code == 202
    a, b = known.json(), unknown.json()
    assert a.keys() == b.keys()
    for key in ("channel", "expiresIn", "resendAfter"):
        assert a[key] == b[key]
    # the emails are the same apart from the code
    assert outbox[0].subject
    assert outbox[1].subject
    assert outbox[0].text.replace(outbox[0].code, "X") == outbox[1].text.replace(outbox[1].code, "X")


@pytest.mark.parametrize("identifier", ["not an address", "a@", "@example.com", "123", "+973 1234"])
def test_invalid_identifier(client_for: ClientFor, outbox: Outbox, identifier: str) -> None:
    r = start(client_for(), identifier)
    assert r.status_code == 422
    assert r.json()["error"]["code"] in ("invalid_identifier", "invalid_input")
    assert outbox == []


@pytest.mark.parametrize("number", ["17123456", "80001234", "+966501234567", "+12025550123"])
def test_no_texts_to_landlines_toll_free_or_other_countries(client_for: ClientFor, outbox: Outbox, number: str) -> None:
    r = start(client_for(), number)
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "sms_unavailable"
    assert outbox == []


def test_allowed_regions_come_from_the_settings(
    client_for: ClientFor, outbox: Outbox, set_option: Callable[[str, Any], None]
) -> None:
    set_option("sms_allowed_regions", ["BH", "SA"])
    assert start(client_for(), "+966501234567").status_code == 202


def test_csrf_header_is_required(client_for: ClientFor, outbox: Outbox) -> None:
    c = client_for()
    del c.headers["X-CSRF-Token"]
    assert start(c, "csrf@example.com").status_code == 403
    assert outbox == []


# ── the messages ────────────────────────────────────────────────────────────────────────────


def test_email_message(client_for: ClientFor, outbox: Outbox) -> None:
    start(client_for(), "mail@example.com")
    [mail] = outbox
    assert mail.subject == f"Your DSBA Hub code: {mail.code}"
    assert f"Your DSBA Hub code is {mail.code}." in mail.text
    assert "expires in 10 minutes" in mail.text
    assert "If you didn't try to sign in, you can ignore this email." in mail.text
    assert mail.html is not None
    assert mail.code in mail.html


def test_text_message_ends_with_a_webotp_line(
    client_for: ClientFor, outbox: Outbox, set_option: Callable[[str, Any], None]
) -> None:
    set_option("web_base_url", "https://hub.example.bh:8443/app")
    start(client_for(), "33123457")
    [text] = outbox
    code = text.code
    assert text.text == f"Your DSBA Hub code is {code}. It expires in 10 minutes.\n\n@hub.example.bh #{code}"


def test_codes_are_stored_only_as_an_hmac(client_for: ClientFor, outbox: Outbox, db: Session) -> None:
    r = start(client_for(), "hash@example.com")
    ch = _challenge(db, r.json()["challengeId"])
    code = outbox[-1].code
    expected = hmac.new(b"test-secret-key", f"{ch.id}:{code}".encode(), hashlib.sha256).hexdigest()
    assert ch.code_hash == expected
    assert code not in ch.code_hash
    assert ch.expires_at - ch.created_at == timedelta(seconds=600)
    assert ch.purpose == OtpPurpose.sign_in
    assert ch.user_id is None


# ── codes: wrong, expired, used, retired ───────────────────────────────────────────────────


def test_wrong_codes_count_down_then_lock_the_code(client_for: ClientFor, outbox: Outbox, db: Session) -> None:
    c = client_for()
    cid = start(c, "wrong@example.com").json()["challengeId"]
    code = outbox[-1].code
    for left in (4, 3, 2, 1):
        r = verify(c, cid, wrong(code))
        assert r.status_code == 422
        err = r.json()["error"]
        assert err["code"] == "invalid_code"
        assert f"{left} {'try' if left == 1 else 'tries'} left" in err["message"]
        assert err["fields"] == {"code": err["message"]}
    r = verify(c, cid, wrong(code))
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "too_many_attempts"
    r = verify(c, cid, code)  # the right code no longer works either
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "too_many_attempts"
    assert _challenge(db, cid).attempts == 5
    assert "dsba_session" not in c.cookies


def test_expired_code(client_for: ClientFor, outbox: Outbox, age: Callable[..., None]) -> None:
    c = client_for()
    cid = start(c, "late@example.com").json()["challengeId"]
    age(601)
    r = verify(c, cid, outbox[-1].code)
    assert r.status_code == 410
    assert r.json()["error"]["code"] == "code_expired"


def test_a_code_works_once(client_for: ClientFor, outbox: Outbox) -> None:
    c = client_for()
    cid = start(c, "once@example.com").json()["challengeId"]
    assert verify(c, cid, outbox[-1].code).status_code == 200
    r = verify(client_for(), cid, outbox[-1].code)
    assert r.status_code == 410
    assert r.json()["error"]["code"] == "code_expired"


def test_a_new_code_retires_the_older_ones(client_for: ClientFor, outbox: Outbox, age: Callable[..., None]) -> None:
    c = client_for()
    first = start(c, "resend@example.com").json()["challengeId"]
    first_code = outbox[-1].code
    age(31)
    second = start(c, "resend@example.com").json()["challengeId"]
    assert verify(c, first, first_code).status_code == 410
    assert verify(c, second, outbox[-1].code).status_code == 200


def test_unknown_challenge(client: TestClient) -> None:
    r = verify(client, "00000000-0000-4000-8000-000000000000", "123456")
    assert r.status_code == 410
    assert r.json()["error"]["code"] == "code_expired"


def test_badly_formed_code(client_for: ClientFor, outbox: Outbox) -> None:
    c = client_for()
    cid = start(c, "format@example.com").json()["challengeId"]
    r = verify(c, cid, "12345")
    assert r.status_code == 422
    assert r.json()["error"]["code"] == "invalid_input"


def test_a_code_for_adding_an_identifier_cannot_sign_in(
    client_for: ClientFor, outbox: Outbox, make_user: Callable[..., User]
) -> None:
    owner = client_for(make_user(email="owner@example.com"))
    r = owner.post(f"{API}/me/identifiers/otp", json={"identifier": "33123458"})
    assert r.status_code == 202, r.text
    stranger = client_for()
    r = verify(stranger, r.json()["challengeId"], outbox[-1].code)
    assert r.status_code == 410
    assert "dsba_session" not in stranger.cookies


# ── limits ──────────────────────────────────────────────────────────────────────────────────


def test_resend_cooldown(client_for: ClientFor, outbox: Outbox, age: Callable[..., None]) -> None:
    c = client_for()
    assert start(c, "cool@example.com").status_code == 202
    r = start(client_for(), "cool@example.com")  # another browser: the limit is per address
    assert r.status_code == 429
    err = r.json()["error"]
    assert err["code"] == "rate_limited"
    assert 1 <= err["retryAfter"] <= 30
    assert r.headers["Retry-After"] == str(err["retryAfter"])
    assert len(outbox) == 1
    assert start(c, "other@example.com").status_code == 202  # other addresses are not held back
    age(31, "cool@example.com")
    assert start(c, "cool@example.com").status_code == 202


def test_codes_per_address_per_hour(
    client_for: ClientFor, outbox: Outbox, set_option: Callable[[str, Any], None], age: Callable[..., None]
) -> None:
    set_option("otp_resend_seconds", 0)
    c = client_for()
    for _ in range(5):
        assert start(c, "hourly@example.com").status_code == 202
    r = start(c, "hourly@example.com")
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "rate_limited"
    assert 3500 <= r.json()["error"]["retryAfter"] <= 3600
    assert "address" in r.json()["error"]["message"]
    age(3601, "hourly@example.com")
    assert start(c, "hourly@example.com").status_code == 202


def test_codes_per_address_per_day(
    client_for: ClientFor, outbox: Outbox, set_option: Callable[[str, Any], None], age: Callable[..., None]
) -> None:
    set_option("otp_resend_seconds", 0)
    set_option("otp_max_per_identifier_per_day", 7)
    c = client_for()
    for _ in range(5):
        assert start(c, "daily@example.com").status_code == 202
    age(3601)
    for _ in range(2):
        assert start(c, "daily@example.com").status_code == 202
    r = start(c, "daily@example.com")
    assert r.status_code == 429
    assert r.json()["error"]["retryAfter"] > 3600


def test_codes_per_ip_per_hour(
    client_for: ClientFor,
    outbox: Outbox,
    set_option: Callable[[str, Any], None],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(auth_router, "client_ip", lambda request: request.headers.get("x-test-ip"))
    set_option("otp_max_per_ip_per_hour", 3)
    c = client_for()
    here = {"x-test-ip": "203.0.113.7"}
    for i in range(3):
        assert c.post(f"{API}/auth/otp", json={"identifier": f"ip{i}@example.com"}, headers=here).status_code == 202
    r = c.post(f"{API}/auth/otp", json={"identifier": "ip9@example.com"}, headers=here)
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "rate_limited"
    assert "network" in r.json()["error"]["message"]
    elsewhere = {"x-test-ip": "198.51.100.1"}
    assert c.post(f"{API}/auth/otp", json={"identifier": "ip9@example.com"}, headers=elsewhere).status_code == 202


def test_ipv6_clients_are_counted_by_their_64(
    client_for: ClientFor,
    outbox: Outbox,
    set_option: Callable[[str, Any], None],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(auth_router, "client_ip", lambda request: request.headers.get("x-test-ip"))
    set_option("otp_max_per_ip_per_hour", 2)
    c = client_for()

    def from_ip(ip: str, n: int) -> int:
        r = c.post(f"{API}/auth/otp", json={"identifier": f"v6-{n}@example.com"}, headers={"x-test-ip": ip})
        return int(r.status_code)

    assert from_ip("2001:db8:1:2::1", 1) == 202
    assert from_ip("2001:db8:1:2:aaaa::9", 2) == 202
    assert from_ip("2001:db8:1:2:ffff:ffff:ffff:ffff", 3) == 429  # same /64
    assert from_ip("2001:db8:1:3::1", 4) == 202  # the next /64


def test_ipv6_sites_have_a_looser_limit_on_their_48(
    client_for: ClientFor,
    outbox: Outbox,
    set_option: Callable[[str, Any], None],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Rotating /64s inside one /48 doesn't multiply the per-network limit: the /48 has a looser one (SEC-52)."""
    monkeypatch.setattr(auth_router, "client_ip", lambda request: request.headers.get("x-test-ip"))
    set_option("otp_max_per_ip_per_hour", 2)
    set_option("otp_max_per_ipv6_site_per_hour", 3)
    c = client_for()

    def from_ip(ip: str, n: int) -> int:
        r = c.post(f"{API}/auth/otp", json={"identifier": f"site-{n}@example.com"}, headers={"x-test-ip": ip})
        return int(r.status_code)

    assert from_ip("2001:db8:1:1::1", 1) == 202
    assert from_ip("2001:db8:1:1::2", 2) == 202
    assert from_ip("2001:db8:1:2::1", 3) == 202  # another /64: its own per-network limit
    assert from_ip("2001:db8:1:3::1", 4) == 429  # but the /48 has had 3
    assert from_ip("2001:db8:2::1", 5) == 202  # the next /48


def test_requests_without_an_ip_share_one_bucket(
    client_for: ClientFor, outbox: Outbox, set_option: Callable[[str, Any], None]
) -> None:
    set_option("otp_max_per_ip_per_hour", 2)  # the test client has no IP address
    assert start(client_for(), "a1@example.com").status_code == 202
    assert start(client_for(), "a2@example.com").status_code == 202
    assert start(client_for(), "a3@example.com").status_code == 429


@pytest.mark.parametrize("has_account", [True, False])
def test_wrong_codes_lock_the_address_for_a_day(
    client_for: ClientFor,
    outbox: Outbox,
    age: Callable[..., None],
    make_user: Callable[..., User],
    has_account: bool,
) -> None:
    address = "target@example.com"
    if has_account:
        make_user(email=address)
    c = client_for()
    for _ in range(3):
        cid = start(c, address).json()["challengeId"]
        for _ in range(5):
            verify(c, cid, wrong(outbox[-1].code))
        age(31)
    r = start(c, address)
    assert r.status_code == 429
    err = r.json()["error"]
    assert err["code"] == "rate_limited"
    assert "wrong codes" in err["message"]
    assert 86_000 < err["retryAfter"] <= 86_400
    age(86_400)
    assert start(c, address).status_code == 202


def test_signing_in_clears_the_wrong_code_count(
    client_for: ClientFor,
    outbox: Outbox,
    age: Callable[..., None],
    set_option: Callable[[str, Any], None],
    db: Session,
) -> None:
    set_option("otp_max_per_identifier_per_hour", 20)
    set_option("otp_max_per_identifier_per_day", 20)
    address = "forgetful@example.com"
    c = client_for()

    def fail_one_code(times: int) -> str:
        cid: str = start(c, address).json()["challengeId"]
        for _ in range(times):
            verify(c, cid, wrong(outbox[-1].code))
        age(31)
        return cid

    fail_one_code(5)
    fail_one_code(5)
    cid = start(c, address).json()["challengeId"]
    for _ in range(4):
        verify(c, cid, wrong(outbox[-1].code))
    assert verify(c, cid, outbox[-1].code).status_code == 200  # 14 wrong codes, then the right one
    still_open = db.scalars(
        select(OtpChallenge).where(OtpChallenge.identifier == address, OtpChallenge.consumed_at.is_(None))
    ).all()
    assert still_open == []
    age(31)
    fail_one_code(5)
    fail_one_code(5)
    assert start(c, address).status_code == 202


def test_text_budget(client_for: ClientFor, outbox: Outbox, set_option: Callable[[str, Any], None]) -> None:
    set_option("sms_max_per_hour", 2)
    assert start(client_for(), "33100001").status_code == 202
    assert start(client_for(), "33100002").status_code == 202
    r = start(client_for(), "33100003")
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "sms_unavailable"
    assert start(client_for(), "budget@example.com").status_code == 202  # email keeps working
    assert len([m for m in outbox if m.channel == "sms"]) == 2


def test_email_budget(client_for: ClientFor, outbox: Outbox, set_option: Callable[[str, Any], None]) -> None:
    """Every sign-in email together has a site-wide ceiling (SEC-52)."""
    set_option("email_max_per_hour", 2)
    assert start(client_for(), "budget1@example.com").status_code == 202
    assert start(client_for(), "budget2@example.com").status_code == 202
    r = start(client_for(), "budget3@example.com")
    assert r.status_code == 429
    error = r.json()["error"]
    assert error["code"] == "rate_limited"
    assert error["retryAfter"] > 0
    assert "phone number" in error["message"]
    assert start(client_for(), "33100001").status_code == 202  # texts keep working
    assert len([m for m in outbox if m.channel == "email"]) == 2


def test_email_budget_per_day(client_for: ClientFor, outbox: Outbox, set_option: Callable[[str, Any], None]) -> None:
    set_option("email_max_per_day", 1)
    assert start(client_for(), "daily1@example.com").status_code == 202
    assert start(client_for(), "daily2@example.com").status_code == 429
    assert len([m for m in outbox if m.channel == "email"]) == 1


def test_spent_sign_up_budget_never_stops_an_existing_student(
    client_for: ClientFor,
    outbox: Outbox,
    set_option: Callable[[str, Any], None],
    make_user: Callable[..., User],
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Made-up addresses from many networks spend the sign-up budget; a student whose account exists still gets a
    code (SEC-52)."""
    monkeypatch.setattr(auth_router, "client_ip", lambda request: request.headers.get("x-test-ip"))
    make_user(email="known@example.com")
    set_option("email_signups_max_per_hour", 3)
    c = client_for()
    for n in range(5):
        r = c.post(
            f"{API}/auth/otp", json={"identifier": f"made-up{n}@example.com"}, headers={"x-test-ip": f"198.51.100.{n}"}
        )
        assert r.status_code == 202, r.text
    r = c.post(f"{API}/auth/otp", json={"identifier": "known@example.com"}, headers={"x-test-ip": "192.0.2.50"})
    assert r.status_code == 202, r.text
    sent = [m.to for m in outbox if m.channel == "email"]
    assert sent == [*(f"made-up{n}@example.com" for n in range(3)), "known@example.com"]


def test_spent_sign_up_budget_answers_alike_for_known_and_unknown_addresses(
    client_for: ClientFor,
    outbox: Outbox,
    set_option: Callable[[str, Any], None],
    make_user: Callable[..., User],
    db: Session,
) -> None:
    """Over the sign-up budget, a new address gets the same answer as an existing account's (never saying whether an
    account exists), and its code is quietly not sent and can't be used."""
    make_user(email="member@example.com")
    set_option("email_signups_max_per_hour", 1)
    assert start(client_for(), "first-new@example.com").status_code == 202
    known = start(client_for(), "member@example.com")
    unknown = start(client_for(), "second-new@example.com")
    assert known.status_code == unknown.status_code == 202
    k, u = known.json(), unknown.json()
    assert k.pop("challengeId") != u.pop("challengeId")
    assert k.pop("destinationHint") != u.pop("destinationHint")  # each names its own address
    assert k == u
    assert [m.to for m in outbox if m.channel == "email"] == ["first-new@example.com", "member@example.com"]
    skipped = db.scalar(select(OtpChallenge).where(OtpChallenge.identifier == "second-new@example.com"))
    assert skipped is not None
    assert skipped.expires_at == skipped.created_at  # never usable


def test_delivery_failure(client_for: ClientFor, outbox: Outbox, monkeypatch: pytest.MonkeyPatch, db: Session) -> None:
    working = mailer.send_email
    lost: list[str] = []

    def broken(to: str, subject: str, text: str, html: str | None = None) -> None:
        lost.append(text)
        raise DeliveryError("the relay is down")

    monkeypatch.setattr(mailer, "send_email", broken)
    c = client_for()
    r = start(c, "unlucky@example.com")
    assert r.status_code == 503
    assert r.json()["error"]["code"] == "delivery_failed"
    assert "phone number" in r.json()["error"]["message"]
    failed = db.scalar(select(OtpChallenge).where(OtpChallenge.identifier == "unlucky@example.com"))
    assert failed is not None
    code = next(t for t in lost[0].split() if t.rstrip(".").isdigit()).rstrip(".")
    assert verify(c, str(failed.id), code).status_code == 410  # never usable

    monkeypatch.setattr(mailer, "send_email", working)
    assert start(c, "unlucky@example.com").status_code == 202  # no cooldown after a failure


# ── accounts and sessions ───────────────────────────────────────────────────────────────────


def test_admin_identifiers_become_admins(
    sign_in: SignIn,
    set_option: Callable[[str, Any], None],
    make_user: Callable[..., User],
    db: Session,
) -> None:
    set_option("admin_identifiers", ["Boss@Example.com", "3399 9999", "not valid"])
    rep = make_user(email="rep@example.com", roles=("student",))
    set_option("admin_identifiers", ["Boss@Example.com", "3399 9999", "not valid", "REP@example.com"])

    def slugs(identifier: str) -> list[str]:
        return [r["slug"] for r in sign_in(identifier)[1]["user"]["roles"]]

    assert slugs("rep@example.com") == ["admin", "student"]  # an existing account, while the hub has no admin
    assert slugs("boss@example.com") == ["student"]  # listed, but the hub has an admin now
    assert slugs("plain@example.com") == ["student"]
    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "user.roles", AuditEntry.target_id == str(rep.id)))
    assert entry is not None
    assert entry.actor_id is None
    assert entry.data == {
        "from": ["Student"],
        "to": ["Admin", "Student"],
        "via": "bootstrap",
        "targetName": "Test Student",
    }


def test_admin_identifiers_never_give_admin_back(
    sign_in: SignIn, set_option: Callable[[str, Any], None], db: Session
) -> None:
    """Admin taken from a listed account stays taken at its next sign-in (SEC-54)."""
    set_option("admin_identifiers", ["founder@example.com"])
    set_option("otp_resend_seconds", 0)
    _, result = sign_in("founder@example.com")
    assert [r["slug"] for r in result["user"]["roles"]] == ["admin", "student"]
    sign_in("other-admin@example.com")
    other = db.scalar(select(User).where(User.email == "other-admin@example.com"))
    founder = db.get(User, uuid.UUID(result["user"]["id"]))
    assert other is not None
    assert founder is not None
    access.give(db, other, "admin")
    student = access.role_by_slug(db, "student")
    assert student is not None
    access.set_roles(db, founder, [student])
    db.commit()
    _, again = sign_in("founder@example.com")
    assert [r["slug"] for r in again["user"]["roles"]] == ["student"]


def test_admin_identifiers_take_phone_numbers(sign_in: SignIn, set_option: Callable[[str, Any], None]) -> None:
    set_option("admin_identifiers", ["3399 9999"])
    assert [r["slug"] for r in sign_in("+97333999999")[1]["user"]["roles"]] == ["admin", "student"]


def test_admin_identifiers_ignore_a_deleted_and_remade_account(
    sign_in: SignIn, set_option: Callable[[str, Any], None], db: Session, storage: Any
) -> None:
    """A demoted admin who deletes their account and signs up again with the listed address stays a student while
    another admin runs the hub (SEC-54)."""
    set_option("admin_identifiers", ["founder@example.com"])
    set_option("otp_resend_seconds", 0)
    _, result = sign_in("founder@example.com")
    sign_in("other-admin@example.com")
    other = db.scalar(select(User).where(User.email == "other-admin@example.com"))
    founder = db.get(User, uuid.UUID(result["user"]["id"]))
    assert other is not None
    assert founder is not None
    access.give(db, other, "admin")
    student = access.role_by_slug(db, "student")
    assert student is not None
    access.set_roles(db, founder, [student])
    db.commit()
    accounts.delete_account(db, founder, storage)
    db.commit()
    _, again = sign_in("founder@example.com")
    assert again["user"]["id"] != result["user"]["id"]
    assert [r["slug"] for r in again["user"]["roles"]] == ["student"]


def test_admin_identifiers_skip_existing_accounts_while_an_admin_exists(
    sign_in: SignIn, set_option: Callable[[str, Any], None], make_user: Callable[..., User]
) -> None:
    make_user(email="head@example.com", roles=("student", "admin"))
    make_user(email="late@example.com", roles=("student",))
    set_option("admin_identifiers", ["late@example.com"])
    _, result = sign_in("late@example.com")
    assert [r["slug"] for r in result["user"]["roles"]] == ["student"]


def test_logout(sign_in: SignIn, db: Session) -> None:
    c, _ = sign_in("leaving@example.com")
    token = c.cookies.get("dsba_session")
    assert token
    csrf_before = c.cookies.get("dsba_csrf")
    r = logout(c)
    assert r.status_code == 204
    assert c.cookies.get("dsba_csrf") not in (None, csrf_before)  # a new CSRF cookie
    cleared = next(h for h in r.headers.get_list("set-cookie") if h.startswith("dsba_session="))
    assert "Max-Age=0" in cleared or "expires=" in cleared.lower()
    sess = db.scalar(
        select(UserSession).where(UserSession.token_hash == hash_token(token)).execution_options(populate_existing=True)
    )
    assert sess is not None
    assert sess.revoked_at is not None
    c.cookies.set("dsba_session", token)  # the old cookie no longer works
    assert c.get(f"{API}/me").status_code == 401


def test_logout_as_a_guest(client: TestClient) -> None:
    assert logout(client).status_code == 204
    assert client.get(f"{API}/me").status_code == 401


def test_sign_in_rotates_the_session(sign_in: SignIn, db: Session, age: Callable[..., None]) -> None:
    c, first = sign_in("rotate@example.com")
    old = c.cookies.get("dsba_session")
    assert old
    age(31)
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


def test_sign_in_deletes_sessions_that_ended_long_ago(
    sign_in: SignIn, make_user: Callable[..., User], db: Session
) -> None:
    """Ended sessions stay 30 days (who signed in from where, as the sweep keeps them), then go at the next sign-in."""
    user = make_user(email="tidy@example.com")
    now = utcnow()
    month = timedelta(days=31)
    old_expired = UserSession(user_id=user.id, token_hash=hash_token("x1"), expires_at=now - month)
    old_revoked = UserSession(
        user_id=user.id, token_hash=hash_token("x2"), expires_at=now + timedelta(days=1), revoked_at=now - month
    )
    recent = UserSession(user_id=user.id, token_hash=hash_token("x4"), expires_at=now - timedelta(days=2))
    live = UserSession(user_id=user.id, token_hash=hash_token("x3"), expires_at=now + timedelta(days=1))
    db.add_all([old_expired, old_revoked, recent, live])
    db.commit()
    sign_in("tidy@example.com")
    hashes = set(db.scalars(select(UserSession.token_hash).where(UserSession.user_id == user.id)))
    assert hash_token("x1") not in hashes
    assert hash_token("x2") not in hashes
    assert {hash_token("x3"), hash_token("x4")} <= hashes
    assert len(hashes) == 3  # the live one, the recently ended one and the new one


def test_new_session_records_the_browser(sign_in: SignIn, db: Session) -> None:
    c, result = sign_in("browser@example.com")
    sess = db.scalar(select(UserSession).where(UserSession.token_hash == hash_token(c.cookies["dsba_session"])))
    assert sess is not None
    assert sess.user_agent == "testclient"
    assert sess.expires_at - sess.created_at == timedelta(days=30)
    assert str(sess.user_id) == result["user"]["id"]


def test_sign_in_replaces_the_csrf_cookie(client_for: ClientFor, outbox: Outbox) -> None:
    c = client_for()
    before = c.cookies.get("dsba_csrf")
    cid = start(c, "csrf-rotate@example.com").json()["challengeId"]
    r = verify(c, cid, outbox[-1].code)
    assert r.status_code == 200
    assert any(h.startswith("dsba_csrf=") for h in r.headers.get_list("set-cookie"))
    assert c.cookies.get("dsba_csrf") not in (None, before)
    stale = client_for()
    stale.cookies.set("dsba_session", c.cookies["dsba_session"])  # the old token no longer passes
    stale.headers["X-CSRF-Token"] = before or ""
    stale.cookies.set("dsba_csrf", c.cookies["dsba_csrf"])
    assert stale.post(f"{API}/auth/logout").status_code == 403


def test_at_most_20_live_sessions(sign_in: SignIn, make_user: Callable[..., User], db: Session) -> None:
    user = make_user(email="busy@example.com")
    now = utcnow()
    for i in range(20):
        db.add(
            UserSession(
                user_id=user.id,
                token_hash=hash_token(f"old-{i}"),
                expires_at=now + timedelta(days=1),
                last_seen_at=now - timedelta(hours=20 - i),  # old-0 is the least recently used
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
    assert hash_token("old-1") in live


def test_email_variants_share_their_limits(
    client_for: ClientFor, outbox: Outbox, set_option: Callable[[str, Any], None]
) -> None:
    c = client_for()
    assert start(c, "Name.Surname@gmail.com").status_code == 202
    for variant in ("namesurname+1@gmail.com", "name.surname+x@googlemail.com", "n.a.m.e.s.u.r.n.a.m.e@gmail.com"):
        r = start(c, variant)
        assert r.status_code == 429, variant
        assert r.json()["error"]["code"] == "rate_limited"
    assert start(c, "name.surname@example.com").status_code == 202  # dots count elsewhere
    assert start(c, "name.surname+1@example.com").status_code == 429  # a +tag doesn't
    set_option("otp_resend_seconds", 0)
    for i in range(3):
        assert start(c, f"tagged+{i}@outlook.com").status_code == 202
    assert start(c, "tagged+3@outlook.com").status_code == 202
    assert start(c, "tagged+4@outlook.com").status_code == 202
    r = start(c, "tagged@outlook.com")  # the sixth code for one inbox in an hour
    assert r.status_code == 429
    # each address still gets its own account
    assert {m.to for m in outbox if m.to.startswith("tagged")} == {f"tagged+{i}@outlook.com" for i in range(5)}
