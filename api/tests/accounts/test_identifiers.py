"""Email addresses, hints, rate-limit keys and the small helpers behind the limits."""

from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta
from typing import Any

import pytest

from app.core.errors import ApiError
from app.core.time import utcnow
from app.services import ratelimit
from app.services.identifiers import account_key, admin_identifiers, destination_hint, normalize_email, rate_key


def test_normalize_email() -> None:
    assert normalize_email("  Name@Example.COM ") == "name@example.com"


@pytest.mark.parametrize("raw", ["", "nobody", "a@", "@example.com", "33123456", "a b@example.com"])
def test_normalize_email_refuses(raw: str) -> None:
    with pytest.raises(ApiError) as e:
        normalize_email(raw)
    assert e.value.code == "invalid_email"


@pytest.mark.parametrize(("value", "hint"), [("sara@example.com", "s•••@example.com"), ("@x.com", "•••@x.com")])
def test_destination_hint(value: str, hint: str) -> None:
    assert destination_hint(value) == hint


@pytest.mark.parametrize(
    ("address", "key"),
    [
        ("name@example.com", "name@example.com"),
        ("name+tag@example.com", "name@example.com"),
        ("first.last+a+b@example.com", "first.last@example.com"),
        ("first.last@gmail.com", "firstlast@gmail.com"),
        ("f.i.r.s.t+x@googlemail.com", "first@gmail.com"),
        ("+only@example.com", "@example.com"),
    ],
)
def test_rate_key(address: str, key: str) -> None:
    assert rate_key(address) == key


def test_account_key_is_a_keyed_hash_of_the_rate_key() -> None:
    assert account_key("name+1@gmail.com") == account_key("n.a.m.e@googlemail.com")
    assert account_key("name@gmail.com") != account_key("other@gmail.com")
    assert "name" not in account_key("name@gmail.com")


def test_admin_identifiers_are_normalised(set_option: Callable[[str, Any], None]) -> None:
    set_option("admin_identifiers", ["Boss@Example.com", "+973 3399 9999", "nonsense"])
    assert admin_identifiers() == frozenset({"boss@example.com"})


def test_wait_for() -> None:
    now = utcnow()
    hour = timedelta(hours=1)
    assert ratelimit.wait_for([], 1, hour, now) == 0
    times = [now - timedelta(minutes=m) for m in (1, 10, 50)]  # newest first
    assert ratelimit.wait_for(times, 4, hour, now) == 0
    assert ratelimit.wait_for(times, 3, hour, now) == 600  # the oldest leaves in 10 minutes
    assert ratelimit.wait_for(times, 2, hour, now) == 3000
    assert ratelimit.wait_for(times, 0, hour, now) == 3600


@pytest.mark.parametrize(
    ("seconds", "text"),
    [(1, "1 second"), (45, "45 seconds"), (60, "1 minute"), (61, "2 minutes"), (3600, "1 hour"), (86_400, "24 hours")],
)
def test_human_wait(seconds: int, text: str) -> None:
    assert ratelimit.human_wait(seconds) == text


def test_ip_bucket() -> None:
    assert ratelimit.ip_bucket("203.0.113.9") == "203.0.113.9"
    assert ratelimit.ip_bucket("2001:db8:1:2:3:4:5:6") == "2001:db8:1:2::/64"
    assert ratelimit.ip_bucket("2001:db8:1:2:3:4:5:6", 48) == "2001:db8:1::/48"
    assert ratelimit.ip_bucket("203.0.113.9", 48) == "203.0.113.9"
    assert ratelimit.ip_bucket(None) is None
