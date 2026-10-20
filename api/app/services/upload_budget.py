"""The hub's and each account's daily upload budgets (security review SEC-14), set by admins in Manage → Numbers.

Every upload declares its size when it starts (POST /uploads), and the presigned policy holds it to that size. Before
a new one is handed out, check() adds up what the person, and then the whole hub, declared in the last 24 hours
(whatever became of those uploads) and refuses one that would go over either budget: 429 rate_limited, with the wait
until enough of the window has passed. The person's upload lock is already held (uploads.check_rate); the hub's lock
is taken after it, always in that order."""

from __future__ import annotations

import logging
import math
from datetime import datetime, timedelta

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.orm import Session

from app.core.errors import rate_limited
from app.core.time import utcnow
from app.models import Upload, UploadLimits, User
from app.schemas.uploads import UploadLimitsIn, UploadLimitsOut
from app.services import audit, ratelimit

log = logging.getLogger("dsba.uploads")

DAY = timedelta(hours=24)
MB = 1024 * 1024


def limits(db: Session) -> UploadLimits:
    """The one row of budgets (the migrations make it)."""
    return db.get_one(UploadLimits, 1)


def _wait(db: Session, where: list[ColumnElement[bool]], limit_bytes: int, size_bytes: int, now: datetime) -> int:
    """Seconds until `size_bytes` more fit in `limit_bytes` per 24 hours (0: they fit now)."""
    rows = (
        db.execute(
            select(Upload.created_at, Upload.size_bytes)
            .where(*where, Upload.created_at > now - DAY)
            .order_by(Upload.created_at)
        )
        .tuples()
        .all()
    )
    used = sum(size for _, size in rows)
    over = used + size_bytes - limit_bytes
    if over <= 0:
        return 0
    if size_bytes > limit_bytes:
        return math.ceil(DAY.total_seconds())
    for created, size in rows:  # the oldest leave the window first
        over -= size
        if over <= 0:
            return max(1, math.ceil((created + DAY - now).total_seconds()))
    return math.ceil(DAY.total_seconds())


def check(db: Session, user: User, size_bytes: int) -> None:
    """429 rate_limited when an upload of `size_bytes` would take the person, or the hub, over its 24-hour budget.
    The caller holds the person's upload lock; the hub's is held from here until the transaction ends."""
    lim, now = limits(db), utcnow()
    wait = _wait(db, [Upload.user_id == user.id], lim.account_mb_per_day * MB, size_bytes, now)
    if wait:
        raise rate_limited(
            wait,
            f"You've uploaded a lot of files today. You can upload this one in {ratelimit.human_wait(wait)}.",
        )
    ratelimit.lock(db, "uploads:hub")
    wait = _wait(db, [], lim.hub_mb_per_day * MB, size_bytes, now)
    if wait:
        log.warning("The hub's daily upload budget (%d MB) is reached: uploads are paused", lim.hub_mb_per_day)
        raise rate_limited(
            wait,
            f"The Hub has taken in a lot of files today. Try again in {ratelimit.human_wait(wait)}.",
        )


def set_limits(db: Session, user: User, body: UploadLimitsIn, ip: str | None) -> None:
    """Admins set the budgets. Audited (`uploads.limits`) with before and after."""
    lim = limits(db)
    before = {"hubMbPerDay": lim.hub_mb_per_day, "accountMbPerDay": lim.account_mb_per_day}
    lim.hub_mb_per_day, lim.account_mb_per_day = body.hub_mb_per_day, body.account_mb_per_day
    lim.updated_by, lim.updated_at = user.id, utcnow()
    after = {"hubMbPerDay": lim.hub_mb_per_day, "accountMbPerDay": lim.account_mb_per_day}
    audit.record(db, user, "uploads.limits", data={"before": before, "after": after}, ip=ip)


def numbers(db: Session) -> UploadLimitsOut:
    lim = limits(db)
    used = db.scalar(select(func.coalesce(func.sum(Upload.size_bytes), 0)).where(Upload.created_at > utcnow() - DAY))
    return UploadLimitsOut(
        hub_mb_per_day=lim.hub_mb_per_day,
        account_mb_per_day=lim.account_mb_per_day,
        updated_at=lim.updated_at,
        bytes_last_day=int(used or 0),
    )
