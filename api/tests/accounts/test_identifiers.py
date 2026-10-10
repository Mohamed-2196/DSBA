"""Identifiers, hints, rate-limit keys and the small helpers behind the limits."""

from __future__ import annotations

from collections.abc import Callable
from datetime import timedelta
from typing import Any

import pytest
from sqlalchemy import literal, select
from sqlalchemy.orm import Session
from starlette.requests import Request

from app.core.errors import ApiError
from app.core.time import utcnow
from app.services import ratelimit
from app.services.identifiers import (
    admin_identifiers,
    destination_hint,
    email_rate_key_sql,
    normalize_identifier,
    rate_key,
    sms_capable,
)


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("  Name@Example.COM ", ("email", "name@example.com")),
        ("33123456", ("phone", "+97333123456")),
        ("+973 3312 3456", ("phone", "+97333123456")),
        ("00973 33123456", ("phone", "+97333123456")),
        ("+44 7911 123456", ("phone", "+447911123456")),
    ],
)
def test_normalize(raw: str, expected: tuple[str, str]) -> None:
    assert normalize_identifier(raw) == expected


@pytest.mark.parametrize("raw", ["name@", "hello", "1234", "+973 1"])
def test_normalize_refuses(raw: str) -> None:
    with pytest.raises(ApiError) as e:
        normalize_identifier(raw)
    assert e.value.code == "invalid_identifier"


@pytest.mark.parametrize(
    ("kind", "value", "hint"),
    [
        ("email", "mariam@gmail.com", "m•••@gmail.com"),
        ("email", "a@x.org", "a•••@x.org"),
        ("phone", "+97333123456", "+973 •••• ••56"),
        ("phone", "+966501234567", "+966 • •••• ••67"),
        ("phone", "+447911123456", "+44 •• •••• ••56"),
    ],
)
def test_destination_hint(kind: Any, value: str, hint: str) -> None:
    assert destination_hint(kind, value) == hint


def test_sms_capable() -> None:
    assert sms_capable("+97333123456", ["BH"])
    assert sms_capable("+97333123456", ["bh "])
    assert not sms_capable("+97317123456", ["BH"])  # a landline
    assert not sms_capable("+966501234567", ["BH"])
    assert sms_capable("+966501234567", ["BH", "SA"])
    assert not sms_capable("garbage", ["BH"])


@pytest.mark.parametrize(
    ("address", "key"),
    [
        ("name@example.com", "name@example.com"),
        ("name+tag@example.com", "name@example.com"),
        ("first.last+a+b@example.com", "first.last@example.com"),
        ("First.Last@gmail.com".lower(), "firstlast@gmail.com"),
        ("f.i.r.s.t+x@googlemail.com", "first@gmail.com"),
        ("+only@example.com", "@example.com"),
    ],
)
def test_rate_key_in_python_and_sql(db: Session, address: str, key: str) -> None:
    assert rate_key("email", address) == key
    assert db.scalar(select(email_rate_key_sql(literal(address)))) == key
    assert rate_key("phone", "+97333123456") == "+97333123456"


def test_admin_identifiers_are_normalised(set_option: Callable[[str, Any], None]) -> None:
    set_option("admin_identifiers", ["Boss@Example.com", "+973 3399 9999", "33999998", "nonsense"])
    assert admin_identifiers() == frozenset({"boss@example.com", "+97333999999", "+97333999998"})


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


def _request(host: str | None) -> Request:
    return Request({"type": "http", "headers": [], "client": (host, 1234) if host else None})


@pytest.mark.parametrize(
    ("host", "ip"),
    [
        ("203.0.113.9", "203.0.113.9"),
        ("::ffff:203.0.113.9", "203.0.113.9"),
        ("2001:DB8::1", "2001:db8::1"),
        ("testclient", None),
        (None, None),
    ],
)
def test_request_ip(host: str | None, ip: str | None) -> None:
    assert ratelimit.request_ip(_request(host)) == ip


def test_ip_bucket() -> None:
    assert ratelimit.ip_bucket("203.0.113.9") == "203.0.113.9"
    assert ratelimit.ip_bucket("2001:db8:1:2:3:4:5:6") == "2001:db8:1:2::/64"
    assert ratelimit.ip_bucket(None) is None
