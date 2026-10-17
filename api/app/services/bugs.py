"""Bug reports: anyone, guests included, reports what went wrong on a page; admins triage them in Manage.

- A signed-in person may send 10 an hour, a guest 5 an hour from one network (client_ip(), an IPv6 /64), and guests
  30 an hour all together: past that, a guest is asked to sign in.
- A signed-in reporter may attach a screenshot: their own bug_screenshot upload, checked and not yet used. It becomes
  attached to the report, so the sweep keeps it; /media shows it to its uploader and to admins only.
- Every active admin hears of new reports in the hub (never by email), one notification at a time: while it is
  unread, the next report counts it up ("3 new bug reports") instead of adding another. An admin isn't told of their
  own.
- An admin marks a report fixed or won't fix (audited), or opens it again.
Services leave the commit to the handler."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import timedelta
from typing import Any, cast
from urllib.parse import urlsplit

from sqlalchemy import ColumnElement, CursorResult, and_, func, select, true, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.access import ADMIN
from app.core.errors import invalid, not_found
from app.core.links import is_hub_path, media_path
from app.core.time import utcnow
from app.models import (
    AccessRole,
    BugReport,
    BugStatus,
    Notification,
    RoleGrant,
    Upload,
    UploadPurpose,
    UploadStatus,
    User,
    UserStatus,
)
from app.schemas.bugs import BugReportCreate, BugReportOut, BugReportPage
from app.schemas.bugs import BugStatus as StatusKey
from app.services import access, audit, ratelimit
from app.services.accounts import public_user
from app.services.notify import notify_all

PER_HOUR_SIGNED_IN = 10
PER_HOUR_GUEST = 5  # from one network
PER_HOUR_ALL_GUESTS = 30
WINDOW = timedelta(hours=1)
KEEP_IP = timedelta(days=1)  # a guest's address counts for the limit only within WINDOW: the sweep clears it after
TOO_MANY = "You've sent a lot of reports. Try again in {}."
GUESTS_FULL = "A lot of reports came in from people who aren't signed in. Sign in to send yours, or try again in {}."
PAGE_RULE = "Give the address of a page of the hub, like /library."
SCREENSHOT_RULE = "Attach a screenshot you uploaded for this report."
EXCERPT = 120


def page_path(value: str) -> str | None:
    """The page as a path inside the app: '/library/abc?x=1' as it is, the app's own full address cut down to its
    path. None for anything else (another site, '//host', a scheme)."""
    v = value.strip()
    if v.lower().startswith(("http://", "https://")):
        try:
            parts = urlsplit(v)
        except ValueError:
            return None
        origins = {o.rstrip("/").lower() for o in get_settings().web_origins}
        if f"{parts.scheme}://{parts.netloc}".lower() not in origins:
            return None
        v = (
            (parts.path or "/")
            + (f"?{parts.query}" if parts.query else "")
            + (f"#{parts.fragment}" if parts.fragment else "")
        )
    return v if is_hub_path(v) and len(v) <= 500 else None


def _check_rate(db: Session, reporter: User | None, ip: str | None) -> None:
    if reporter is not None:
        ratelimit.enforce(
            db,
            f"bug-reports:{reporter.id}",
            BugReport.created_at,
            [BugReport.user_id == reporter.id],
            limit=PER_HOUR_SIGNED_IN,
            window=WINDOW,
            message=TOO_MANY,
        )
        return
    ratelimit.enforce(
        db,
        f"bug-reports:ip:{ratelimit.ip_bucket(ip)}",
        BugReport.created_at,
        [BugReport.user_id.is_(None), ratelimit.in_ip_bucket(BugReport.ip, ip)],
        limit=PER_HOUR_GUEST,
        window=WINDOW,
        message=TOO_MANY,
    )
    ratelimit.enforce(  # one home or phone connection holds many networks
        db,
        "bug-reports:guests",
        BugReport.created_at,
        [BugReport.user_id.is_(None)],
        limit=PER_HOUR_ALL_GUESTS,
        window=WINDOW,
        message=GUESTS_FULL,
    )


def _screenshot(db: Session, reporter: User | None, upload_id: uuid.UUID) -> Upload:
    """The reporter's own checked screenshot, not yet attached to anything: else 422 on screenshotUploadId."""
    up = db.get(Upload, upload_id, with_for_update=True)
    if (
        reporter is None
        or up is None
        or up.user_id != reporter.id
        or up.purpose != UploadPurpose.bug_screenshot
        or up.status != UploadStatus.uploaded
    ):
        raise invalid("screenshotUploadId", SCREENSHOT_RULE)
    return up


def _admins() -> ColumnElement[bool]:
    """Active accounts holding Admin."""
    holders = (
        select(RoleGrant.user_id).join(AccessRole, AccessRole.id == RoleGrant.role_id).where(AccessRole.slug == ADMIN)
    )
    return and_(User.status == UserStatus.active, User.id.in_(holders))


def _tell_admins(db: Session, reporter: User | None, report: BugReport, excerpt: str) -> None:
    """Every active admin but the reporter hears of the report: an admin whose bug report notification is still
    unread sees it count up, with this report's words, and moves to the top; the others get a new one."""
    ratelimit.lock(db, "bug-reports:admins")  # two reports at once both count
    waiting = db.scalars(
        select(Notification)
        .join(User, User.id == Notification.user_id)
        .where(
            Notification.kind == "bug_report",
            Notification.read_at.is_(None),
            _admins(),
            User.id != reporter.id if reporter is not None else true(),
        )
        .with_for_update(of=Notification)
    ).all()
    newest = {"bugReportId": str(report.id)}
    for n in waiting:
        count = int(n.data.get("count", 1)) + 1
        n.title, n.body, n.actor_id = f"{count} new bug reports", excerpt, None
        n.data = {**newest, "count": count}
        n.created_at = utcnow()
    notify_all(
        db,
        "bug_report",
        "New bug report",
        body=excerpt,
        url="/manage/bugs",
        actor=reporter,
        data={**newest, "count": 1},
        email=False,
        only=and_(_admins(), User.id.not_in([n.user_id for n in waiting])),
    )


def create(db: Session, reporter: User | None, body: BugReportCreate, ip: str | None) -> BugReport:
    """Saves the report, attaches its screenshot and tells the admins."""
    path = page_path(body.page_url)
    if path is None:
        raise invalid("pageUrl", PAGE_RULE)
    screenshot = _screenshot(db, reporter, body.screenshot_upload_id) if body.screenshot_upload_id else None
    _check_rate(db, reporter, ip)
    report = BugReport(
        id=uuid.uuid4(),
        user_id=reporter.id if reporter else None,
        ip=ip,
        what_happened=body.what_happened,
        expected=body.expected,
        page_url=path,
        app_version=body.app_version,
        browser=body.browser,
        status=BugStatus.open,
        created_at=utcnow(),
    )
    db.add(report)
    db.flush()
    if screenshot is not None:
        screenshot.status = UploadStatus.attached
        screenshot.bug_report_id = report.id
    excerpt = body.what_happened if len(body.what_happened) <= EXCERPT else body.what_happened[: EXCERPT - 1] + "…"
    _tell_admins(db, reporter, report, excerpt)
    return report


# ── admins ──────────────────────────────────────────────────────────────────────────────────


def get_report(db: Session, report_id: uuid.UUID, *, lock: bool = False) -> BugReport:
    report = db.get(BugReport, report_id, with_for_update=lock or None)
    if report is None:
        raise not_found("This bug report doesn't exist.")
    return report


def _outs(db: Session, rows: Sequence[BugReport]) -> list[BugReportOut]:
    people_ids = {i for r in rows for i in (r.user_id, r.resolved_by) if i is not None}
    people = {u.id: u for u in db.scalars(select(User).where(User.id.in_(people_ids)))} if people_ids else {}
    access.prefetch(db, people.values())
    report_ids = [r.id for r in rows]
    shots = (
        dict(
            db.execute(
                select(Upload.bug_report_id, Upload.id).where(
                    Upload.bug_report_id.in_(report_ids), Upload.status == UploadStatus.attached
                )
            )
            .tuples()
            .all()
        )
        if report_ids
        else {}
    )
    return [
        BugReportOut.model_validate(
            {
                "id": r.id,
                "created_at": r.created_at,
                "status": r.status.value,
                "what_happened": r.what_happened,
                "expected": r.expected,
                "page_url": r.page_url,
                "app_version": r.app_version,
                "browser": r.browser,
                "reporter": public_user(people.get(r.user_id)) if r.user_id else None,
                "screenshot_url": media_path(shots[r.id]) if r.id in shots else None,
                "resolved_at": r.resolved_at,
                "resolved_by": public_user(people.get(r.resolved_by)) if r.resolved_by else None,
            }
        )
        for r in rows
    ]


def report_out(db: Session, report: BugReport) -> BugReportOut:
    return _outs(db, [report])[0]


def open_count(db: Session) -> int:
    """Reports waiting for an admin (Manage's count)."""
    return db.scalar(select(func.count()).select_from(BugReport).where(BugReport.status == BugStatus.open)) or 0


def queue(db: Session, status: StatusKey, limit: int, offset: int) -> BugReportPage:
    """The reports with this status, newest first."""
    where = BugReport.status == BugStatus(status)
    total = db.scalar(select(func.count()).select_from(BugReport).where(where)) or 0
    rows = db.scalars(
        select(BugReport).where(where).order_by(BugReport.created_at.desc(), BugReport.id).limit(limit).offset(offset)
    ).all()
    return BugReportPage(items=_outs(db, rows), total=total, limit=limit, offset=offset, open_count=open_count(db))


def set_status(db: Session, admin: User, report: BugReport, status: StatusKey, ip: str | None) -> None:
    """Fixed or won't fix records who and when; open again clears them. Audited when the status changes."""
    new = BugStatus(status)
    if new == report.status:
        return
    report.status = new
    if new == BugStatus.open:
        report.resolved_at, report.resolved_by = None, None
    else:
        report.resolved_at, report.resolved_by = utcnow(), admin.id
    audit.record(
        db,
        admin,
        "bug_report.status",
        "bug_report",
        report.id,
        {"status": new.value, "page": report.page_url},
        ip,
    )


def clear_old_ips(db: Session) -> int:
    """Forgets the address of reports older than KEEP_IP (the sweep): the limit no longer counts them."""
    old = (
        update(BugReport)
        .where(BugReport.ip.is_not(None), BugReport.created_at < utcnow() - KEEP_IP)
        .values(ip=None)
        .execution_options(synchronize_session=False)
    )
    return cast(CursorResult[Any], db.execute(old)).rowcount
