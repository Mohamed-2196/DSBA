from __future__ import annotations

from datetime import datetime
from typing import Annotated, Any, Literal
from uuid import UUID

from pydantic import StringConstraints

from app.schemas.access import RoleSummary
from app.schemas.common import ApiModel, Page, UserPublic, UserStatus, Year

ReportTarget = Literal["thread", "reply", "library_item", "request"]
ReportReason = Literal["spam", "harassment", "inappropriate", "copyright", "other"]
# What the reported thing is now: a forum post's status, a library item's, or a request's.
TargetStatus = Literal[
    "visible", "hidden", "deleted", "pending", "published", "rejected", "removed", "open", "planned", "done", "declined"
]
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
    target_title: str | None  # a reply's thread title for replies; None when the target no longer exists
    target_url: str | None  # a path in the web app: /forum/<slug>(#reply-<id>), /library/<slug>, /requests/<id>
    target_excerpt: str | None = None  # the reported text as plain text (about 200 characters)
    target_status: TargetStatus | None = None  # None when the target no longer exists
    target_author: UserPublic | None = None  # who wrote or uploaded it
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
    roles: list[RoleSummary]
    status: UserStatus
    year: Year | None
    created_at: datetime
    last_seen_at: datetime | None


class AdminUserPage(Page[AdminUser]):
    pass


class AdminUserUpdate(ApiModel):
    """Only the fields sent change. `status` needs people.suspend; only admins suspend or restore an admin. `email`
    and `phone` are the account-recovery action (security review SEC-9), for admins only: they replace the account's
    address (`null` removes it; one must stay), end every session of the account, send a notice to the address that
    was replaced or removed, and are audited (`user.identifier`)."""

    status: UserStatus | None = None
    email: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=254)] | None = None
    phone: Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=254)] | None = None


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
    """A feature's counts are None while it is switched off for the viewer."""

    users: int
    threads: int | None  # the forum's
    replies: int | None
    library_items: int | None  # the library's
    pending_uploads: int | None
    open_reports: int
    open_requests: int | None  # waiting for an answer; None without requests.manage or while requests are off
    pending_suggestions: int | None  # suggested videos to review; None without content.edit or while they are off
