"""Wrong codes and limits without lockouts (security review SEC-2, decision D4), and the limits keeping their count
when an account is deleted (student test, security note).

- Wrong codes lock the pair of address and network, never the address: its owner signs in from anywhere else.
- After many wrong codes for an address from anywhere, its codes are long (10 letters and digits): nobody can guess
  one, and the owner still signs in.
- The daily cap of codes for an address counts per network; the hourly one only slows down."""

from __future__ import annotations

import logging
import re
from collections.abc import Callable
from typing import Any

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import OtpChallenge
from app.routers import auth as auth_router
from app.services import otp
from app.services.identifiers import anon_identifier
from tests.accounts.conftest import API, Outbox, SignIn, sync_csrf, wrong

ClientFor = Callable[..., TestClient]
SetOption = Callable[[str, Any], None]


@pytest.fixture
def from_network(monkeypatch: pytest.MonkeyPatch) -> None:
    """Requests say which network they come from in an x-test-ip header (as a trusted proxy would)."""
    monkeypatch.setattr(auth_router, "client_ip", lambda request: request.headers.get("x-test-ip"))


@pytest.fixture
def small_limits(monkeypatch: pytest.MonkeyPatch, set_option: SetOption) -> None:
    """Five wrong codes lock a network out of an address and make the address's codes long."""
    monkeypatch.setattr(otp, "FAILED_CODES_PER_DAY", 5)
    monkeypatch.setattr(otp, "LONG_CODES_AFTER", 5)
    set_option("otp_resend_seconds", 0)


def _start(c: TestClient, identifier: str, ip: str) -> Any:
    return c.post(f"{API}/auth/otp", json={"identifier": identifier}, headers={"x-test-ip": ip})


def _verify(c: TestClient, challenge_id: str, code: str, ip: str = "203.0.113.1") -> Any:
    r = c.post(f"{API}/auth/otp/verify", json={"challengeId": challenge_id, "code": code}, headers={"x-test-ip": ip})
    sync_csrf(c)
    return r


def _guess_five_times(c: TestClient, identifier: str, ip: str, outbox: Outbox) -> None:
    r = _start(c, identifier, ip)
    assert r.status_code == 202, r.text
    code = outbox.to(identifier)[-1].code
    for _ in range(5):
        _verify(c, r.json()["challengeId"], wrong(code), ip)


ATTACKER, OWNER = "198.51.100.66", "203.0.113.10"


def test_wrong_codes_lock_only_the_network_they_came_from(
    client_for: ClientFor, outbox: Outbox, from_network: None, small_limits: None
) -> None:
    stranger = client_for()
    _guess_five_times(stranger, "victim@example.com", ATTACKER, outbox)
    r = _start(stranger, "victim@example.com", ATTACKER)
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "rate_limited"
    assert "from your network" in r.json()["error"]["message"]
    assert r.json()["error"]["retryAfter"] > 23 * 3600
    # the owner, anywhere else, still gets a code and signs in with it
    owner = client_for()
    r = _start(owner, "victim@example.com", OWNER)
    assert r.status_code == 202, r.text
    assert r.json()["codeFormat"] == "long"
    code = outbox.to("victim@example.com")[-1].long_code
    assert _verify(owner, r.json()["challengeId"], code, OWNER).status_code == 200
    # other addresses from the attacker's network are not locked
    assert _start(stranger, "someone.else@example.com", ATTACKER).status_code == 202


def test_long_codes_after_wrong_codes_from_anywhere(
    client_for: ClientFor, outbox: Outbox, from_network: None, small_limits: None
) -> None:
    c = client_for()
    for ip in ("198.51.100.1", "198.51.100.2"):  # spread over networks: no network is locked, the address is warned
        r = _start(c, "spread@example.com", ip)
        code = outbox.to("spread@example.com")[-1].code
        for _ in range(3):
            _verify(c, r.json()["challengeId"], wrong(code), ip)
    r = _start(c, "spread@example.com", "198.51.100.3")
    assert r.status_code == 202, r.text
    assert r.json()["codeFormat"] == "long"
    mail = outbox.to("spread@example.com")[-1]
    written = mail.long_code
    assert re.fullmatch(r"[A-HJ-NP-Z2-9]{5}-[A-HJ-NP-Z2-9]{5}", written)  # no 0/O, 1/I/L
    assert "longer than usual" in mail.text
    assert written in (mail.subject or "")
    # a 6-digit guess is just a wrong code; the real one works in any case, with or without the dash
    challenge = r.json()["challengeId"]
    assert _verify(c, challenge, "123456").json()["error"]["code"] == "invalid_code"
    r = _verify(c, challenge, written.replace("-", "").lower())
    assert r.status_code == 200, r.text


def test_long_codes_by_text(client_for: ClientFor, outbox: Outbox, from_network: None, small_limits: None) -> None:
    c = client_for()
    r = _start(c, "+97333123470", "198.51.100.4")
    for _ in range(5):
        _verify(c, r.json()["challengeId"], wrong(outbox[-1].code), "198.51.100.4")
    r = _start(c, "+97333123470", "198.51.100.5")
    assert r.json()["codeFormat"] == "long"
    text = outbox.to("+97333123470")[-1]
    assert re.search(r"code is [A-Z0-9]{5}-[A-Z0-9]{5}\.", text.text)
    assert _verify(c, r.json()["challengeId"], text.long_code, "198.51.100.5").status_code == 200


def test_signing_in_clears_the_count(
    client_for: ClientFor, outbox: Outbox, from_network: None, small_limits: None
) -> None:
    c = client_for()
    r = _start(c, "clears@example.com", ATTACKER)
    code = outbox[-1].code
    for _ in range(4):
        _verify(c, r.json()["challengeId"], wrong(code), ATTACKER)
    assert _verify(c, r.json()["challengeId"], code, ATTACKER).status_code == 200
    r = _start(client_for(), "clears@example.com", ATTACKER)
    assert r.status_code == 202
    assert r.json()["codeFormat"] == "digits"


def test_the_daily_cap_counts_per_network(
    client_for: ClientFor, outbox: Outbox, from_network: None, set_option: SetOption
) -> None:
    set_option("otp_resend_seconds", 0)
    set_option("otp_max_per_identifier_per_day", 2)
    c = client_for()
    assert _start(c, "capped@example.com", ATTACKER).status_code == 202
    assert _start(c, "capped@example.com", ATTACKER).status_code == 202
    r = _start(c, "capped@example.com", ATTACKER)
    assert r.status_code == 429
    assert "from your network" in r.json()["error"]["message"]
    assert _start(client_for(), "capped@example.com", OWNER).status_code == 202


def test_the_hourly_cap_only_slows_down(
    client_for: ClientFor, outbox: Outbox, from_network: None, set_option: SetOption, age: Callable[..., None]
) -> None:
    set_option("otp_resend_seconds", 0)
    set_option("otp_max_per_identifier_per_hour", 2)
    c = client_for()
    for ip in (ATTACKER, "198.51.100.77"):
        assert _start(c, "hourly@example.com", ip).status_code == 202
    r = _start(client_for(), "hourly@example.com", OWNER)
    assert r.status_code == 429
    assert r.json()["error"]["retryAfter"] <= 3600  # an hour at most, never a day
    age(3601)
    assert _start(client_for(), "hourly@example.com", OWNER).status_code == 202


def test_alarms(
    client_for: ClientFor,
    outbox: Outbox,
    from_network: None,
    small_limits: None,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    monkeypatch.setattr(otp, "SPRAY_ALARM", 5)
    caplog.set_level(logging.WARNING, logger="dsba.otp")
    _guess_five_times(client_for(), "alarm@example.com", ATTACKER, outbox)
    messages = [r.getMessage() for r in caplog.records]
    assert any("are locked for one network" in m and "a•••@example.com" in m for m in messages)
    assert any("are long now" in m for m in messages)
    assert any("5 wrong sign-in codes across the site" in m for m in messages)
    assert not any("alarm@example.com" in m for m in messages)  # masked, never the address


# ── deleting the account refills nothing (student test, security note) ────────────────────────


def test_deleting_the_account_keeps_the_address_limits(
    client_for: ClientFor, outbox: Outbox, sign_in: SignIn, set_option: SetOption, age: Callable[..., None], db: Session
) -> None:
    set_option("otp_max_per_identifier_per_hour", 2)
    c, _ = sign_in("loop@example.com")
    assert c.delete(f"{API}/me").status_code == 204
    rows = db.scalars(
        select(OtpChallenge).where(OtpChallenge.identifier == anon_identifier("email", "loop@example.com"))
    )
    assert len(rows.all()) == 1
    age(31)
    again = client_for()
    assert again.post(f"{API}/auth/otp", json={"identifier": "loop@example.com"}).status_code == 202
    age(31)
    r = again.post(f"{API}/auth/otp", json={"identifier": "Loop+2@Example.com"})  # the same inbox
    assert r.status_code == 429  # the deleted account's code still counts


def test_deleting_the_account_keeps_the_text_budget(
    client_for: ClientFor, outbox: Outbox, sign_in: SignIn, set_option: SetOption
) -> None:
    set_option("sms_max_per_hour", 1)
    c, _ = sign_in("+97333123471")
    assert c.delete(f"{API}/me").status_code == 204
    r = client_for().post(f"{API}/auth/otp", json={"identifier": "+97333123472"})
    assert r.status_code == 429
    assert r.json()["error"]["code"] == "sms_unavailable"
