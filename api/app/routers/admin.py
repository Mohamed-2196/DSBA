"""People, roles and the audit log. Owner: accounts agent."""

from __future__ import annotations

from uuid import UUID

from fastapi import Request

from app.core.pagination import Limit, Offset
from app.core.security import DB, Admin, Moderator
from app.routers._base import router_for
from app.schemas.common import Role
from app.schemas.moderation import AdminStats, AdminUser, AdminUserPage, AdminUserUpdate, AuditPage

router = router_for("admin")


@router.get("/admin/stats", response_model=AdminStats)
def stats(user: Moderator, db: DB) -> AdminStats:
    raise NotImplementedError


@router.get("/admin/users", response_model=AdminUserPage)
def list_users(
    user: Admin, db: DB, q: str | None = None, role: Role | None = None, limit: Limit = 20, offset: Offset = 0
) -> AdminUserPage:
    """Search by name, email or phone number."""
    raise NotImplementedError


@router.patch("/admin/users/{user_id}", response_model=AdminUser)
def update_user(user_id: UUID, body: AdminUserUpdate, request: Request, user: Admin, db: DB) -> AdminUser:
    """Change a role or suspend an account (audited; an admin cannot demote or suspend themselves)."""
    raise NotImplementedError


@router.get("/admin/audit", response_model=AuditPage)
def audit_log(user: Admin, db: DB, limit: Limit = 50, offset: Offset = 0) -> AuditPage:
    raise NotImplementedError
