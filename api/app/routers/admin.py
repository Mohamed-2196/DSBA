"""People, roles and the audit log. Owner: accounts agent."""

from __future__ import annotations

import re
from uuid import UUID

from fastapi import Request
from sqlalchemy import ColumnElement, Select, func, or_, select
from sqlalchemy.orm import aliased

from app.core.errors import conflict, not_found
from app.core.pagination import Limit, Offset
from app.core.security import DB, Admin, Moderator
from app.models import (
    AuditEntry,
    ForumReply,
    ForumThread,
    ItemStatus,
    LibraryItem,
    PostStatus,
    Report,
    ReportStatus,
    User,
    UserStatus,
)
from app.models import Role as UserRole
from app.routers._base import router_for
from app.schemas.common import Role
from app.schemas.moderation import AdminStats, AdminUser, AdminUserPage, AdminUserUpdate, AuditOut, AuditPage
from app.services.accounts import public_user
from app.services.audit import record
from app.services.notify import notify
from app.services.ratelimit import request_ip

router = router_for("admin")

SEARCH_MAX = 100
PHONE_LIKE = re.compile(r"[\d\s()+.-]+")
ROLE_NOTICES: dict[UserRole, tuple[str, str | None]] = {
    UserRole.student: ("Your role is now student", None),
    UserRole.moderator: (
        "You're now a student rep",
        "You can moderate the forum and the library, and edit the calendar and the newsletter.",
    ),
    UserRole.admin: ("You're now an admin", "You can manage people and roles, and moderate everything."),
}
STATUS_NOTICES: dict[UserStatus, tuple[str, str | None]] = {
    UserStatus.active: ("Your account is active again", "You can post, upload and react again."),
    UserStatus.suspended: (
        "Your account is suspended",
        "You can still sign in and read, but you can't post, upload or react. Contact a student rep.",
    ),
}


def _count(db: DB, q: Select[tuple[int]]) -> int:
    return db.scalar(q) or 0


def admin_user(u: User) -> AdminUser:
    return AdminUser.model_validate(
        {
            "id": u.id,
            "display_name": u.display_name,
            "email": u.email,
            "phone": u.phone,
            "role": u.role.value,
            "status": u.status.value,
            "year": u.year,
            "created_at": u.created_at,
            "last_seen_at": u.last_seen_at,
        }
    )


def _like(text: str) -> str:
    escaped = text.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")
    return f"%{escaped}%"


@router.get("/admin/stats", response_model=AdminStats)
def stats(user: Moderator, db: DB) -> AdminStats:
    """Counts for the moderation dashboard: visible threads and replies, published library items, uploads waiting
    for review and open reports."""
    n = func.count()
    return AdminStats(
        users=_count(db, select(n).select_from(User)),
        threads=_count(db, select(n).select_from(ForumThread).where(ForumThread.status == PostStatus.visible)),
        replies=_count(db, select(n).select_from(ForumReply).where(ForumReply.status == PostStatus.visible)),
        library_items=_count(db, select(n).select_from(LibraryItem).where(LibraryItem.status == ItemStatus.published)),
        pending_uploads=_count(db, select(n).select_from(LibraryItem).where(LibraryItem.status == ItemStatus.pending)),
        open_reports=_count(db, select(n).select_from(Report).where(Report.status == ReportStatus.open)),
    )


@router.get("/admin/users", response_model=AdminUserPage)
def list_users(
    user: Admin, db: DB, q: str | None = None, role: Role | None = None, limit: Limit = 20, offset: Offset = 0
) -> AdminUserPage:
    """Search by name, email or phone number (case-insensitive, any part; a phone number may be typed with spaces),
    newest accounts first."""
    where: list[ColumnElement[bool]] = []
    text = (q or "").strip()[:SEARCH_MAX]
    if text:
        pattern = _like(text)
        matches = [
            User.display_name.ilike(pattern, escape="\\"),
            User.email.ilike(pattern, escape="\\"),
            User.phone.ilike(pattern, escape="\\"),
        ]
        digits = re.sub(r"\D", "", text)
        if len(digits) >= 3 and PHONE_LIKE.fullmatch(text):
            matches.append(User.phone.like(f"%{digits}%"))
        where.append(or_(*matches))
    if role is not None:
        where.append(User.role == UserRole(role))
    total = _count(db, select(func.count()).select_from(User).where(*where))
    users = db.scalars(select(User).where(*where).order_by(User.created_at.desc(), User.id).limit(limit).offset(offset))
    return AdminUserPage(items=[admin_user(u) for u in users], total=total, limit=limit, offset=offset)


@router.patch("/admin/users/{user_id}", response_model=AdminUser)
def update_user(user_id: UUID, body: AdminUserUpdate, request: Request, user: Admin, db: DB) -> AdminUser:
    """Change a role or suspend an account (audited; an admin cannot change their own role or status: 409
    cannot_change_self). The person gets a notification."""
    target = db.get(User, user_id)
    if target is None:
        raise not_found("This account doesn't exist.")
    new_role = UserRole(body.role) if body.role is not None else None
    new_status = UserStatus(body.status) if body.status is not None else None
    if new_role is None and new_status is None:
        return admin_user(target)
    if target.id == user.id:
        raise conflict("cannot_change_self", "You can't change your own role or status. Ask another admin.")
    ip = request_ip(request)
    # names as they were: the ids go NULL when an account is deleted (security review finding 21)
    names = {"actorName": user.display_name, "targetName": target.display_name}
    if new_role is not None and new_role != target.role:
        record(db, user, "user.role", "user", target.id, {"from": target.role.value, "to": new_role.value, **names}, ip)
        target.role = new_role
        title, body_text = ROLE_NOTICES[new_role]
        notify(db, target.id, "system", title, body=body_text, actor=user)
    if new_status is not None and new_status != target.status:
        change = {"from": target.status.value, "to": new_status.value, **names}
        record(db, user, "user.status", "user", target.id, change, ip)
        target.status = new_status
        title, body_text = STATUS_NOTICES[new_status]
        notify(db, target.id, "system", title, body=body_text, actor=user)
    db.commit()
    return admin_user(target)


@router.get("/admin/audit", response_model=AuditPage)
def audit_log(user: Admin, db: DB, limit: Limit = 50, offset: Offset = 0) -> AuditPage:
    """Who did what, newest first."""
    actor = aliased(User)
    total = _count(db, select(func.count()).select_from(AuditEntry))
    rows = db.execute(
        select(AuditEntry, actor)
        .outerjoin(actor, actor.id == AuditEntry.actor_id)
        .order_by(AuditEntry.created_at.desc(), AuditEntry.id.desc())
        .limit(limit)
        .offset(offset)
    ).tuples()
    items = [
        AuditOut.model_validate(
            {
                "id": e.id,
                "actor": public_user(a),
                "action": e.action,
                "target_type": e.target_type,
                "target_id": e.target_id,
                "data": e.data or {},
                "created_at": e.created_at,
            }
        )
        for e, a in rows
    ]
    return AuditPage(items=items, total=total, limit=limit, offset=offset)
