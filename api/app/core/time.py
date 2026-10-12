"""Time: UTC for storage, and Bahrain for "today" (the Hub's one definition, code quality review CQ-6)."""

from __future__ import annotations

import datetime as dt
from datetime import UTC, datetime
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def utcnow() -> datetime:
    return datetime.now(UTC)


def _bahrain() -> dt.tzinfo:
    try:
        return ZoneInfo("Asia/Bahrain")
    except ZoneInfoNotFoundError:  # no tz database in the image: Bahrain is UTC+3 all year (no daylight saving)
        return dt.timezone(dt.timedelta(hours=3), "Asia/Bahrain")


# Calendar days (event dates, "today", midnight for the forum's hot list) are days in Bahrain.
BAHRAIN = _bahrain()


def bahrain_today() -> dt.date:
    return utcnow().astimezone(BAHRAIN).date()
