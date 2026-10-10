"""The client's address (security review, finding 1): X-Forwarded-For counts only from a trusted proxy."""

from __future__ import annotations

import ipaddress
from collections.abc import Callable

import pytest
from fastapi import Request
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.security import client_ip
from app.models import AuditEntry, OtpChallenge, User
from app.services import ratelimit
from tests.core.conftest import BrowserAt, SetOption
from tests.core.helpers import API, new_thread

PROXY = "10.0.0.2"


def _request(peer: str | None, *forwarded: str) -> Request:
    headers = [(b"x-forwarded-for", value.encode()) for value in forwarded]
    return Request({"type": "http", "headers": headers, "client": (peer, 1234) if peer else None})


@pytest.mark.parametrize(
    ("peer", "forwarded", "expected"),
    [
        ("203.0.113.5", (), "203.0.113.5"),
        ("203.0.113.5", ("198.51.100.7",), "203.0.113.5"),  # nobody is trusted: the header is ignored
        ("203.0.113.5", ("not-an-ip",), "203.0.113.5"),
        ("::ffff:203.0.113.9", (), "203.0.113.9"),
        ("2001:DB8::1", (), "2001:db8::1"),
        ("testclient", (), None),
        (None, ("198.51.100.7",), None),
    ],
)
def test_without_trusted_proxies_the_peer_is_the_client(
    peer: str | None, forwarded: tuple[str, ...], expected: str | None
) -> None:
    assert client_ip(_request(peer, *forwarded)) == expected


@pytest.mark.parametrize(
    ("peer", "forwarded", "expected"),
    [
        (PROXY, ("198.51.100.7",), "198.51.100.7"),
        (PROXY, ("6.6.6.6, 198.51.100.7",), "198.51.100.7"),  # what the client wrote in front is ignored
        (PROXY, ("6.6.6.6", "198.51.100.7"), "198.51.100.7"),  # two header lines read as one list
        (PROXY, ("198.51.100.7, 10.0.0.9",), "198.51.100.7"),  # another trusted proxy in the chain
        (PROXY, ("10.0.0.7, 10.0.0.9",), "10.0.0.7"),  # only proxies: as far back as the chain goes
        (PROXY, (), PROXY),  # the proxy asking for itself (a health check)
        (PROXY, ("not-an-ip",), None),  # never a guess, never a 500
        (PROXY, ("198.51.100.7, not-an-ip",), None),
        (PROXY, ("not-an-ip, 198.51.100.7",), "198.51.100.7"),
        (PROXY, ("::ffff:198.51.100.7",), "198.51.100.7"),
        ("203.0.113.5", ("198.51.100.7",), "203.0.113.5"),  # not from the proxy: the header means nothing
        ("2001:db8:1::5", ("2001:db8:ffff::1",), "2001:db8:ffff::1"),
    ],
)
def test_forwarded_for_counts_only_from_a_trusted_proxy(
    set_option: SetOption, peer: str, forwarded: tuple[str, ...], expected: str | None
) -> None:
    set_option("trusted_proxies", [ipaddress.ip_network("10.0.0.0/24"), ipaddress.ip_network("2001:db8:1::/48")])
    assert client_ip(_request(peer, *forwarded)) == expected
    assert ratelimit.request_ip(_request(peer, *forwarded)) == expected


def _start(c: TestClient, identifier: str, forwarded: str | None = None) -> int:
    headers = {"X-Forwarded-For": forwarded} if forwarded else {}
    return c.post(f"{API}/auth/otp", json={"identifier": identifier}, headers=headers).status_code


def _challenge_ips(db: Session, prefix: str) -> set[str | None]:
    rows = db.scalars(select(OtpChallenge.ip).where(OtpChallenge.identifier.like(f"{prefix}%")))
    return {str(ip) if ip is not None else None for ip in rows}


def test_a_spoofed_forwarded_for_does_not_escape_the_per_ip_limit(
    browser_at: BrowserAt, set_option: SetOption, db: Session
) -> None:
    set_option("otp_max_per_ip_per_hour", 2)
    c = browser_at("203.0.113.5")
    assert _start(c, "spoof1@example.com", "1.1.1.1") == 202
    assert _start(c, "spoof2@example.com", "2.2.2.2") == 202
    assert _start(c, "spoof3@example.com", "3.3.3.3") == 429  # a new header value is not a new address
    assert _challenge_ips(db, "spoof") == {"203.0.113.5"}


def test_behind_a_trusted_proxy_each_client_counts_for_itself(
    browser_at: BrowserAt, set_option: SetOption, db: Session
) -> None:
    set_option("trusted_proxies", [ipaddress.ip_network(f"{PROXY}/32")])
    set_option("otp_max_per_ip_per_hour", 1)
    proxy = browser_at(PROXY)
    assert _start(proxy, "behind1@example.com", "198.51.100.7") == 202
    assert _start(proxy, "behind2@example.com", "203.0.113.9") == 202  # another student behind the same proxy
    assert _start(proxy, "behind3@example.com", "6.6.6.6, 198.51.100.7") == 429  # the first one again
    assert _challenge_ips(db, "behind") == {"198.51.100.7", "203.0.113.9"}


def test_a_forwarded_for_that_is_not_an_address_is_no_address(
    browser_at: BrowserAt, set_option: SetOption, db: Session
) -> None:
    set_option("trusted_proxies", [ipaddress.ip_network(f"{PROXY}/32")])
    assert _start(browser_at(PROXY), "garbage@example.com", "abc") == 202  # not a 500 from the INET column
    assert _challenge_ips(db, "garbage") == {None}


def test_audit_rows_record_the_client_behind_the_proxy(
    browser_at: BrowserAt,
    client_for: Callable[..., TestClient],
    set_option: SetOption,
    student: User,
    moderator: User,
    db: Session,
) -> None:
    set_option("trusted_proxies", [ipaddress.ip_network(f"{PROXY}/32")])
    t = new_thread(client_for(student), "Hide me, please")
    rep = browser_at(PROXY, moderator)
    r = rep.post(
        f"{API}/forum/threads/{t['id']}/moderate",
        json={"status": "hidden"},
        headers={"X-Forwarded-For": "6.6.6.6, 198.51.100.7"},
    )
    assert r.status_code == 200, r.text
    entry = db.scalar(select(AuditEntry).where(AuditEntry.action == "forum.thread.hide"))
    assert entry is not None
    assert str(entry.ip) == "198.51.100.7"


def test_the_scheme_comes_from_a_trusted_proxy_only(browser_at: BrowserAt, set_option: SetOption) -> None:
    def redirect(c: TestClient) -> str:
        r = c.get(f"{API}/modules/", headers={"X-Forwarded-Proto": "https"}, follow_redirects=False)
        assert r.status_code == 307
        return str(r.headers["location"])

    assert redirect(browser_at("203.0.113.5")).startswith("http://testserver/")  # the client can't say https
    set_option("trusted_proxies", [ipaddress.ip_network(f"{PROXY}/32")])
    assert redirect(browser_at(PROXY)).startswith("https://testserver/")
