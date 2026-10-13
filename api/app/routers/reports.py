"""Reports of posts and uploads, and the moderators' queue. Owner: community agent.
Rules and queries live in app/services/forum.py."""

from __future__ import annotations

from typing import Annotated, Literal
from uuid import UUID

from fastapi import Query, Request, status

from app.core.access import Box
from app.core.pagination import Limit, Offset
from app.core.security import DB, client_ip, requires, requires_any
from app.models import User
from app.routers._base import router_for
from app.schemas.common import Ok
from app.schemas.moderation import ReportCreate, ReportOut, ReportPage, ReportResolve
from app.services import access, reports

router = router_for("reports")
ReportsQueue = Annotated[
    User,
    requires_any(
        Box.forum_moderate,
        Box.library_manage,
        Box.requests_manage,
        refusal="Only people who moderate the forum, manage the library or handle requests can do this.",
    ),
]


@router.post("/reports", response_model=Ok, status_code=status.HTTP_201_CREATED)
def create_report(body: ReportCreate, user: Annotated[User, requires(Box.reports_create)], db: DB) -> Ok:
    """Report a thread, reply, library item or request (one open report per person and target).

    Errors: not_found (404) when the target doesn't exist or the reporter can't see it, already_reported (409),
    rate_limited (429), feature_off (404: the forum, the library or requests are switched off)."""
    access.require_feature(db, user, reports.TARGET_FEATURES[body.target_type])
    reports.create_report(db, user, body)
    db.commit()
    return Ok()


@router.get("/admin/reports", response_model=ReportPage)
def list_reports(
    user: ReportsQueue,
    db: DB,
    status_: Literal["open", "resolved", "dismissed"] = Query(default="open", alias="status"),
    limit: Limit = 20,
    offset: Offset = 0,
) -> ReportPage:
    """Open reports oldest first (a queue); closed ones most recently closed first. Each person sees the reports they
    can act on: forum posts with forum.moderate, library files with library.manage, requests with requests.manage,
    each while its feature is on for them. `reporter` is set for admins only (student reps are classmates)."""
    return reports.list_reports(db, user, status_, limit, offset)


@router.post("/admin/reports/{report_id}/resolve", response_model=ReportOut)
def resolve_report(report_id: UUID, body: ReportResolve, request: Request, user: ReportsQueue, db: DB) -> ReportOut:
    """Close a report (hiding the post is a separate moderation call). Notifies the reporter. Audited.

    Errors: not_found (404) when the report isn't in this person's queue, report_closed (409) when it was already
    closed."""
    out = reports.resolve_report(db, user, report_id, body, client_ip(request))
    db.commit()
    return out
