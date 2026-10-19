"""The notebook's uploads (the pictures, files and PDFs students put in their notes): the hourly limit admins set in
Manage, each student's counts per day, and the numbers Manage shows admins.

- check_rate(): at most `NotebookLimits.uploads_per_hour` note files per student per hour (rows in the window,
  whatever became of them), counted under the student's upload lock. A refusal is counted for Manage, and that count
  is committed before the 429, since the request fails.
- record_upload(): one more upload on the student's day, with its declared bytes.
- numbers(): uploads in the last hour, 24 hours and 7 days; students refused at the limit; the top uploaders by
  count and by bytes (display names only); everyone's note files against the sum of their rooms.
Services leave the commit to the handler, except check_rate's refusal."""

from __future__ import annotations

import datetime as dt
import uuid
from datetime import timedelta
from typing import Any

from sqlalchemy import ColumnElement, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session

from app.core.errors import rate_limited
from app.core.time import bahrain_today, utcnow
from app.models import Notebook, NotebookLimits, NotebookUploadDay, Upload, UploadPurpose, UploadStatus, User
from app.schemas.notes import NotebookLimitsIn, NotebookUploader, NotebookUploadsOut
from app.services import audit, ratelimit

HOUR = timedelta(hours=1)
WEEK_DAYS = 7
TOP = 5


def limits(db: Session) -> NotebookLimits:
    """The one row of limits (the migrations make it)."""
    return db.get_one(NotebookLimits, 1)


def _count(db: Session, user: User, *, uploads: int = 0, size_bytes: int = 0, capped: int = 0) -> None:
    row = pg_insert(NotebookUploadDay).values(
        id=uuid.uuid4(), user_id=user.id, day=bahrain_today(), uploads=uploads, size_bytes=size_bytes, capped=capped
    )
    day = NotebookUploadDay
    db.execute(
        row.on_conflict_do_update(
            index_elements=["user_id", "day"],
            set_={
                "uploads": day.uploads + row.excluded.uploads,
                "size_bytes": day.size_bytes + row.excluded.size_bytes,
                "capped": day.capped + row.excluded.capped,
            },
        )
    )


def check_rate(db: Session, user: User) -> None:
    """429 rate_limited (with Retry-After) when the student uploaded `uploads_per_hour` note files in the last hour.
    Holds the student's upload lock until the transaction ends: the caller inserts the new row in it."""
    ratelimit.lock(db, f"uploads:{user.id}")
    mine = [Upload.user_id == user.id, Upload.purpose == UploadPurpose.note_file]
    wait = ratelimit.window_wait(
        db, Upload.created_at, mine, limit=limits(db).uploads_per_hour, window=HOUR, now=utcnow()
    )
    if wait:
        _count(db, user, capped=1)
        db.commit()  # the refusal counts for Manage although the request fails
        raise rate_limited(
            wait,
            "You've added a lot of pictures and files to your notes in the last hour. "
            f"Try again in {ratelimit.human_wait(wait)}.",
        )


def record_upload(db: Session, user: User, size_bytes: int) -> None:
    _count(db, user, uploads=1, size_bytes=size_bytes)


def set_limits(db: Session, user: User, body: NotebookLimitsIn, ip: str | None) -> None:
    """Admins set the uploads per student per hour. Audited (`notebook.limits`) with before and after."""
    lim = limits(db)
    before = {"uploadsPerHour": lim.uploads_per_hour}
    lim.uploads_per_hour = body.uploads_per_hour
    lim.updated_by, lim.updated_at = user.id, utcnow()
    audit.record(
        db, user, "notebook.limits", data={"before": before, "after": {"uploadsPerHour": lim.uploads_per_hour}}, ip=ip
    )


def _uploads_since(db: Session, window: timedelta) -> int:
    q = select(func.count()).where(Upload.purpose == UploadPurpose.note_file, Upload.created_at > utcnow() - window)
    return int(db.scalar(q) or 0)


def _top(db: Session, since: dt.date, order: ColumnElement[Any]) -> list[NotebookUploader]:
    d = NotebookUploadDay
    uploads, size, capped = func.sum(d.uploads), func.sum(d.size_bytes), func.sum(d.capped)
    rows = db.execute(
        select(User.id, User.display_name, uploads, size, capped)
        .join(User, User.id == d.user_id)
        .where(d.day >= since)
        .group_by(User.id, User.display_name)
        .having(uploads + capped > 0)
        .order_by(order.desc(), User.id)
        .limit(TOP)
    ).tuples()
    return [
        NotebookUploader(user_id=uid, display_name=name, uploads=int(n), size_bytes=int(b), capped=int(c))
        for uid, name, n, b, c in rows
    ]


def numbers(db: Session) -> NotebookUploadsOut:
    from app.services.notes import FILES_LIMIT  # notes imports uploads, which imports this module

    lim, d = limits(db), NotebookUploadDay
    since = bahrain_today() - timedelta(days=WEEK_DAYS - 1)
    week, capped_students, capped = db.execute(
        select(
            func.coalesce(func.sum(d.uploads), 0),
            func.count(func.distinct(d.user_id)).filter(d.capped > 0),
            func.coalesce(func.sum(d.capped), 0),
        ).where(d.day >= since)
    ).one()
    files = db.scalar(
        select(func.coalesce(func.sum(Upload.size_bytes), 0)).where(
            Upload.purpose == UploadPurpose.note_file, Upload.status != UploadStatus.released
        )
    )
    students = int(db.scalar(select(func.count(func.distinct(Notebook.user_id)))) or 0)
    return NotebookUploadsOut(
        uploads_per_hour=lim.uploads_per_hour,
        updated_at=lim.updated_at,
        uploads_last_hour=_uploads_since(db, HOUR),
        uploads_last_day=_uploads_since(db, timedelta(days=1)),
        uploads_last_week=int(week),
        capped_students=int(capped_students),
        capped_uploads=int(capped),
        top_by_count=_top(db, since, func.sum(d.uploads)),
        top_by_bytes=_top(db, since, func.sum(d.size_bytes)),
        students=students,
        files_bytes=int(files or 0),
        files_limit_bytes=FILES_LIMIT,
        budget_bytes=students * FILES_LIMIT,
    )
