"""People, roles and the audit log. Owner: accounts agent."""

from __future__ import annotations

import re
from uuid import UUID

from fastapi import Request
from sqlalchemy import ColumnElement, Select, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import aliased

from app.core.errors import conflict, invalid, not_found
from app.core.pagination import Limit, Offset
from app.core.security import DB, Admin, Moderator, client_ip
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
from app.schemas.common import ErrorResponse, Role
from app.schemas.moderation import AdminStats, AdminUser, AdminUserPage, AdminUserUpdate, AuditOut, AuditPage
from app.services import accounts, sessions
from app.services.accounts import public_user
from app.services.audit import record
from app.services.identifiers import Kind, destination_hint, normalize_identifier
from app.services.notify import notify
from app.services.otp import send_text_notice

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


@router.patch(
    "/admin/users/{user_id}",
    response_model=AdminUser,
    responses={409: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
def update_user(user_id: UUID, body: AdminUserUpdate, request: Request, user: Admin, db: DB) -> AdminUser:
    """Change a role, suspend an account, or recover one (security review SEC-9): replace or remove its email
    address or phone number. Only the fields sent change; everything is audited and the person gets a notification.
    Recovery also ends every session of the account and sends a notice to the address that was replaced or removed.

    Errors: cannot_change_self (409: an admin can't change their own account here; ask another admin),
    identifier_taken (409), last_identifier (409), invalid_identifier (422)."""
    target = db.get(User, user_id)
    if target is None:
        raise not_found("This account doesn't exist.")
    new_role = UserRole(body.role) if body.role is not None else None
    new_status = UserStatus(body.status) if body.status is not None else None
    recovery: dict[Kind, str | None] = {}
    if "email" in body.model_fields_set:
        recovery["email"] = body.email
    if "phone" in body.model_fields_set:
        recovery["phone"] = body.phone
    if new_role is None and new_status is None and not recovery:
        return admin_user(target)
    if target.id == user.id:
        raise conflict("cannot_change_self", "You can't change your own account here. Ask another admin.")
    ip = client_ip(request)
    if new_role is not None and new_role != target.role:
        record(db, user, "user.role", "user", target.id, {"from": target.role.value, "to": new_role.value}, ip)
        target.role = new_role
        title, body_text = ROLE_NOTICES[new_role]
        notify(db, target.id, "system", title, body=body_text, actor=user)
    if new_status is not None and new_status != target.status:
        record(db, user, "user.status", "user", target.id, {"from": target.status.value, "to": new_status.value}, ip)
        target.status = new_status
        title, body_text = STATUS_NOTICES[new_status]
        notify(db, target.id, "system", title, body=body_text, actor=user)
    notices = [n for kind, raw in recovery.items() if (n := _recover(db, user, target, kind, raw, ip)) is not None]
    db.commit()
    for to, message in notices:
        send_text_notice(to, message)
    return admin_user(target)


def _recover(db: DB, admin: User, target: User, kind: Kind, raw: str | None, ip: str | None) -> tuple[str, str] | None:
    """Puts `raw` (None: removes) as the target's email address or phone number. -> a text notice to send after
    the commit, if any."""
    label = accounts.LABELS[kind]
    current, other = (target.email, target.phone) if kind == "email" else (target.phone, target.email)
    value: str | None = None
    if raw is not None:
        found, value = normalize_identifier(raw)
        if found != kind:
            raise invalid(
                kind,
                f"Enter a {'valid email address' if kind == 'email' else 'phone number'}.",
                code="invalid_identifier",
            )
        if value == current:
            return None
        owner = accounts.find_user(db, kind, value)
        if owner is not None and owner.id != target.id:
            raise conflict("identifier_taken", f"Another account already uses this {label}.")
    elif current is None:
        return None
    elif other is None:
        raise conflict("last_identifier", "The account needs at least one way to sign in.")
    change = accounts.set_identifier(target, kind, value)
    try:
        with db.begin_nested():
            db.flush()
    except IntegrityError:  # taken a moment ago
        raise conflict("identifier_taken", f"Another account already uses this {label}.") from None
    record(
        db,
        admin,
        "user.identifier",
        "user",
        target.id,
        {
            "kind": kind,
            "from": destination_hint(kind, change.before) if change.before else None,
            "to": destination_hint(kind, value) if value else None,
        },
        ip,
    )
    sessions.revoke_others(db, target.id, keep=None)
    notify(
        db,
        target.id,
        "system",
        f"An admin changed the {label} on your account",
        body="Your account was signed out everywhere. Sign in with your current email address or phone number.",
        actor=admin,
    )
    return accounts.queue_identifier_notice(db, target, change)


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
