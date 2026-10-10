"""Rate limits kept in the database: count the recent rows of a table in a time window (no Redis).

Count-then-insert is serialised with transaction-scoped advisory locks (`lock`), always taken in the same order
by every caller, so a burst of parallel requests cannot all pass the same count."""

from __future__ import annotations

import ipaddress
import math
from collections.abc import Sequence
from datetime import datetime, timedelta
from typing import Any

from fastapi import Request
from sqlalchemy import ColumnElement, select, text
from sqlalchemy import cast as sql_cast
from sqlalchemy.dialects.postgresql import INET
from sqlalchemy.orm import InstrumentedAttribute, Session

from app.core.security import client_ip

IPV6_BUCKET_PREFIX = 64  # one IPv6 client usually holds a whole /64


def request_ip(request: Request) -> str | None:
    """The client's address from core.security.client_ip, or None when it is not an IP address."""
    raw = client_ip(request)
    if not raw:
        return None
    try:
        addr = ipaddress.ip_address(raw.strip())
    except ValueError:
        return None
    if isinstance(addr, ipaddress.IPv6Address) and addr.ipv4_mapped is not None:
        return str(addr.ipv4_mapped)
    return str(addr)


def ip_bucket(ip: str | None) -> str | None:
    """What a per-IP limit counts: an IPv4 address as it is, an IPv6 address by its /64."""
    if ip is None:
        return None
    addr = ipaddress.ip_address(ip)
    if addr.version == 6:
        return str(ipaddress.ip_network(f"{addr}/{IPV6_BUCKET_PREFIX}", strict=False))
    return str(addr)


def in_ip_bucket(column: InstrumentedAttribute[Any], ip: str | None) -> ColumnElement[bool]:
    """Rows whose IP is in the same bucket as `ip`. Rows without an IP share one bucket: never skip the limit."""
    bucket = ip_bucket(ip)
    if bucket is None:
        return column.is_(None)
    if "/" in bucket:
        contained: ColumnElement[bool] = column.op("<<=", is_comparison=True)(sql_cast(bucket, INET))
        return contained
    return column == sql_cast(bucket, INET)


def lock(db: Session, key: str) -> None:
    """Holds an advisory lock on `key` until the transaction ends (commit or rollback releases it)."""
    db.execute(text("SELECT pg_advisory_xact_lock(hashtextextended(:key, 0))"), {"key": key})


def wait_for(newest_first: Sequence[datetime], limit: int, window: timedelta, now: datetime) -> int:
    """Seconds until one more event fits when at most `limit` may happen per `window` (0: it fits now).

    `newest_first` holds the events inside the window, newest first (the `limit` newest are enough)."""
    if limit <= 0:
        return max(1, math.ceil(window.total_seconds()))
    if len(newest_first) < limit:
        return 0
    return max(1, math.ceil((newest_first[limit - 1] + window - now).total_seconds()))


def window_wait(
    db: Session,
    created_at: InstrumentedAttribute[datetime],
    where: Sequence[ColumnElement[bool]],
    *,
    limit: int,
    window: timedelta,
    now: datetime,
) -> int:
    """wait_for() over the rows matching `where` whose `created_at` falls inside the window."""
    if window.total_seconds() <= 0:
        return 0
    q = select(created_at).where(*where, created_at > now - window).order_by(created_at.desc()).limit(max(limit, 1))
    return wait_for(list(db.scalars(q)), limit, window, now)


def human_wait(seconds: int) -> str:
    """'45 seconds', '3 minutes', '2 hours': for messages shown to students."""
    if seconds < 60:
        return f"{seconds} second{'s' if seconds != 1 else ''}"
    if seconds < 3600:
        minutes = math.ceil(seconds / 60)
        return f"{minutes} minute{'s' if minutes != 1 else ''}"
    hours = math.ceil(seconds / 3600)
    return f"{hours} hour{'s' if hours != 1 else ''}"
