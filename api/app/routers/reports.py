"""Reports of posts and uploads, and the moderators' queue. Owner: community agent.
Rules and queries live in app/services/forum.py."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import Query, Request, status

from app.core.pagination import Limit, Offset
from app.core.security import DB, ActiveUser, Moderator, client_ip
from app.routers._base import router_for
from app.schemas.common import Ok
from app.schemas.moderation import ReportCreate, ReportOut, ReportPage, ReportResolve
from app.services import forum

router = router_for("reports")


@router.post("/reports", response_model=Ok, status_code=status.HTTP_201_CREATED)
def create_report(body: ReportCreate, user: ActiveUser, db: DB) -> Ok:
    """Report a thread, reply or library item (one open report per person and target).

    Errors: not_found (404) when the target doesn't exist or the reporter can't see it, already_reported (409),
    rate_limited (429)."""
    forum.create_report(db, user, body)
    db.commit()
    return Ok()


@router.get("/admin/reports", response_model=ReportPage)
def list_reports(
    user: Moderator,
    db: DB,
    status_: Literal["open", "resolved", "dismissed"] = Query(default="open", alias="status"),
    limit: Limit = 20,
    offset: Offset = 0,
) -> ReportPage:
    """Open reports oldest first (a queue); closed ones most recently closed first. `reporter` is set for admins only
    (student reps are classmates)."""
    return forum.list_reports(db, user, status_, limit, offset)


@router.post("/admin/reports/{report_id}/resolve", response_model=ReportOut)
def resolve_report(report_id: UUID, body: ReportResolve, request: Request, user: Moderator, db: DB) -> ReportOut:
    """Close a report (hiding the post is a separate moderation call). Notifies the reporter. Audited.

    Errors: report_closed (409) when it was already closed."""
    out = forum.resolve_report(db, user, report_id, body, client_ip(request))
    db.commit()
    return out
