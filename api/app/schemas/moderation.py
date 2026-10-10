from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import StringConstraints

from app.schemas.common import ApiModel, Page, Role, UserPublic, UserStatus, Year

ReportTarget = Literal["thread", "reply", "library_item"]
ReportReason = Literal["spam", "harassment", "inappropriate", "copyright", "other"]
Note = Annotated[str, StringConstraints(strip_whitespace=True, max_length=1000)]


class ReportCreate(ApiModel):
    target_type: ReportTarget
    target_id: UUID
    reason: ReportReason
    note: Note | None = None


class ReportOut(ApiModel):
    id: UUID
    target_type: ReportTarget
    target_id: UUID
    target_title: str | None
    target_url: str | None  # a path in the web app
    reason: ReportReason
    note: str | None
    status: Literal["open", "resolved", "dismissed"]
    reporter: UserPublic | None
    created_at: datetime
    resolved_by: UserPublic | None
    resolved_at: datetime | None
    resolution_note: str | None


class ReportPage(Page[ReportOut]):
    pass


class ReportResolve(ApiModel):
    status: Literal["resolved", "dismissed"]
    note: Note | None = None


class AdminUser(ApiModel):
    id: UUID
    display_name: str | None
    email: str | None
    phone: str | None
    role: Role
    status: UserStatus
    year: Year | None
    created_at: datetime
    last_seen_at: datetime | None


class AdminUserPage(Page[AdminUser]):
    pass


class AdminUserUpdate(ApiModel):
    role: Role | None = None
    status: UserStatus | None = None


class AuditOut(ApiModel):
    id: int
    actor: UserPublic | None
    action: str
    target_type: str | None
    target_id: str | None
    data: dict[str, Any]
    created_at: datetime


class AuditPage(Page[AuditOut]):
    pass


class AdminStats(ApiModel):
    users: int
    threads: int
    replies: int
    library_items: int
    pending_uploads: int
    open_reports: int
