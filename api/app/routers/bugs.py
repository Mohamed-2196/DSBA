"""Bug reports: anyone reports, admins triage. The rules live in app/services/bugs.py."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Query, Request, status

from app.core.pagination import Limit, Offset
from app.core.security import DB, OptionalUser, client_ip, requires_admin
from app.models import User
from app.routers._base import router_for
from app.schemas.bugs import BugReportCreate, BugReportCreated, BugReportOut, BugReportPage, BugReportUpdate, BugStatus
from app.services import bugs as svc

router = router_for("bugs")
Admin = Annotated[User, requires_admin()]


@router.post("/bug-reports", response_model=BugReportCreated, status_code=status.HTTP_201_CREATED)
def report_bug(body: BugReportCreate, request: Request, user: OptionalUser, db: DB) -> BugReportCreated:
    """Report a bug, signed in or not. A signed-in reporter may attach a screenshot: an upload of theirs with
    purpose bug_screenshot. Every admin is told in the hub.

    Errors: invalid_input (422: `pageUrl` isn't a page of the hub; `screenshotUploadId` isn't your unused
    screenshot, or you're signed out), rate_limited (429: 10 an hour, 5 an hour for guests from one network)."""
    report = svc.create(db, user, body, client_ip(request))
    db.commit()
    return BugReportCreated(id=report.id)


@router.get("/admin/bug-reports", response_model=BugReportPage)
def bug_reports(
    _: Admin,
    db: DB,
    status_: Annotated[BugStatus, Query(alias="status")] = "open",
    limit: Limit = 20,
    offset: Offset = 0,
) -> BugReportPage:
    """The reports with this status (open by default), newest first. `openCount` counts every open report."""
    return svc.queue(db, status_, limit, offset)


@router.patch("/admin/bug-reports/{report_id}", response_model=BugReportOut)
def update_bug_report(report_id: UUID, body: BugReportUpdate, request: Request, user: Admin, db: DB) -> BugReportOut:
    """Mark a report fixed or won't fix, or open it again. Audited (`bug_report.status`).

    Errors: not_found (404)."""
    report = svc.get_report(db, report_id, lock=True)
    svc.set_status(db, user, report, body.status, client_ip(request))
    db.commit()
    return svc.report_out(db, report)
