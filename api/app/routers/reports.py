"""Reports of posts and uploads, and the moderators' queue. Owner: community agent."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import Query, Request, status

from app.core.pagination import Limit, Offset
from app.core.security import DB, ActiveUser, Moderator
from app.routers._base import router_for
from app.schemas.common import Ok
from app.schemas.moderation import ReportCreate, ReportOut, ReportPage, ReportResolve

router = router_for("reports")


@router.post("/reports", response_model=Ok, status_code=status.HTTP_201_CREATED)
def create_report(body: ReportCreate, user: ActiveUser, db: DB) -> Ok:
    """Report a thread, reply or library item (one open report per person and target)."""
    raise NotImplementedError


@router.get("/admin/reports", response_model=ReportPage)
def list_reports(
    user: Moderator,
    db: DB,
    status_: Literal["open", "resolved", "dismissed"] = Query(default="open", alias="status"),
    limit: Limit = 20,
    offset: Offset = 0,
) -> ReportPage:
    raise NotImplementedError


@router.post("/admin/reports/{report_id}/resolve", response_model=ReportOut)
def resolve_report(report_id: UUID, body: ReportResolve, request: Request, user: Moderator, db: DB) -> ReportOut:
    """Close a report (hiding the post is a separate moderation call). Notifies the reporter. Audited."""
    raise NotImplementedError
