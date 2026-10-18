"""People, the hub's numbers and the audit log. Owner: accounts agent."""

from __future__ import annotations

import re
from typing import Annotated
from uuid import UUID

from fastapi import Request
from sqlalchemy import ColumnElement, Select, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import aliased

from app.core.access import Box, Feature
from app.core.errors import conflict, forbidden, invalid, not_found
from app.core.pagination import Limit, Offset
from app.core.security import DB, ActiveUser, CurrentSession, client_ip, requires
from app.models import (
    AuditEntry,
    ForumReply,
    ForumThread,
    ItemStatus,
    LibraryItem,
    PostStatus,
    RoleGrant,
    User,
    UserStatus,
)
from app.routers._base import SteppedUpAdmin, router_for
from app.schemas.access import UserRolesUpdate
from app.schemas.common import ErrorResponse
from app.schemas.gaps import Gaps
from app.schemas.moderation import AdminStats, AdminUser, AdminUserPage, AdminUserUpdate, AuditOut, AuditPage
from app.services import access, accounts, bugs, documents, gaps, reports, requests, roles, sessions, suggestions
from app.services.accounts import public_user
from app.services.audit import record
from app.services.identifiers import Kind, destination_hint, normalize_identifier
from app.services.notify import notify
from app.services.otp import send_text_notice

router = router_for("admin")

SEARCH_MAX = 100
PHONE_LIKE = re.compile(r"[\d\s()+.-]+")
STATUS_NOTICES: dict[UserStatus, tuple[str, str | None]] = {
    UserStatus.active: ("Your account is active again", "You can post, upload and react again."),
    UserStatus.suspended: (
        "Your account is suspended",
        "You can still sign in and read, but you can't post, upload or react. Contact a student rep.",
    ),
}


def _count(db: DB, q: Select[tuple[int]]) -> int:
    return db.scalar(q) or 0


def admin_user(u: User, *, contacts: bool) -> AdminUser:
    """A person for the people list. `contacts`: their email address and phone number (admins only)."""
    return AdminUser.model_validate(
        {
            "id": u.id,
            "display_name": u.display_name,
            "email": u.email if contacts else None,
            "phone": u.phone if contacts else None,
            "roles": accounts.role_summaries(u),
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
def stats(user: Annotated[User, requires(Box.stats_view)], db: DB) -> AdminStats:
    """Counts for the moderation dashboard: visible threads and replies, published library items, uploads waiting
    for review, the open reports in the viewer's queue and the requests waiting for an answer (for people who handle
    them), the suggested videos waiting for review (for people who edit modules), and the open bug reports (for
    admins). A feature switched off for the viewer counts None."""
    n = func.count()
    forum, library = (access.feature_on(db, user, f) for f in (Feature.forum, Feature.library))
    threads = select(n).select_from(ForumThread).where(ForumThread.status == PostStatus.visible)
    replies = select(n).select_from(ForumReply).where(ForumReply.status == PostStatus.visible)
    published = select(n).select_from(LibraryItem).where(LibraryItem.status == ItemStatus.published)
    pending = select(n).select_from(LibraryItem).where(LibraryItem.status == ItemStatus.pending)
    return AdminStats(
        users=_count(db, select(n).select_from(User)),
        threads=_count(db, threads) if forum else None,
        replies=_count(db, replies) if forum else None,
        library_items=_count(db, published) if library else None,
        pending_uploads=_count(db, pending) if library else None,
        open_reports=reports.open_count(db, user),
        open_requests=requests.open_count(db)
        if access.can(user, Box.requests_manage) and access.feature_on(db, user, Feature.requests)
        else None,
        pending_suggestions=suggestions.pending_count(db)
        if access.can(user, Box.content_edit) and access.feature_on(db, user, Feature.video_suggestions)
        else None,
        open_bug_reports=bugs.open_count(db) if access.is_admin(user) else None,
    )


@router.get("/admin/gaps", response_model=Gaps)
def what_is_missing(user: ActiveUser, db: DB) -> Gaps:
    """What's missing, for the people who fill it: the library's (library.manage), the lessons' (content.edit), the
    calendar's (calendar.manage) and the most wanted open requests (requests.manage). A part whose box the viewer
    doesn't hold, or whose feature is off for them, is None. Errors: forbidden (403: none of these boxes)."""
    return gaps.gaps(db, user)


@router.get("/admin/users", response_model=AdminUserPage)
def list_users(
    user: Annotated[User, requires(Box.people_suspend)],
    db: DB,
    q: str | None = None,
    role: str | None = None,
    limit: Limit = 20,
    offset: Offset = 0,
) -> AdminUserPage:
    """Search by name (case-insensitive, any part), newest accounts first. `role`: a role's slug. Only admins search
    and see email addresses and phone numbers (a phone number may be typed with spaces).

    Errors: invalid (422: no role with this slug)."""
    contacts = access.is_admin(user)
    where: list[ColumnElement[bool]] = []
    text = (q or "").strip()[:SEARCH_MAX]
    if text:
        pattern = _like(text)
        matches = [User.display_name.ilike(pattern, escape="\\")]
        if contacts:
            matches += [User.email.ilike(pattern, escape="\\"), User.phone.ilike(pattern, escape="\\")]
            digits = re.sub(r"\D", "", text)
            if len(digits) >= 3 and PHONE_LIKE.fullmatch(text):
                matches.append(User.phone.like(f"%{digits}%"))
        where.append(or_(*matches))
    if role is not None:
        held = access.role_by_slug(db, role)
        if held is None:
            raise invalid("role", "There's no role with this name.")
        where.append(User.id.in_(select(RoleGrant.user_id).where(RoleGrant.role_id == held.id)))
    total = _count(db, select(func.count()).select_from(User).where(*where))
    query = select(User).where(*where).order_by(User.created_at.desc(), User.id).limit(limit).offset(offset)
    users = db.scalars(query).all()
    access.prefetch(db, users)
    return AdminUserPage(
        items=[admin_user(u, contacts=contacts) for u in users], total=total, limit=limit, offset=offset
    )


@router.patch(
    "/admin/users/{user_id}",
    response_model=AdminUser,
    responses={409: {"model": ErrorResponse}, 422: {"model": ErrorResponse}},
)
def update_user(
    user_id: UUID,
    body: AdminUserUpdate,
    request: Request,
    user: Annotated[User, requires(Box.people_suspend)],
    sess: CurrentSession,
    db: DB,
) -> AdminUser:
    """Suspend or restore an account, or recover one (security review SEC-9): replace or remove its email
    address or phone number. Only the fields sent change; everything is audited and the person gets a notification.
    Recovery also ends every session of the account and sends a notice to the address that was replaced or removed.
    Recovery, and suspending or restoring an admin, need a recent step-up; recovery never applies to an account holding
    Admin (security review AD-1).

    Errors: cannot_change_self (409), last_admin (409: the only active admin), forbidden (403: recovery is for admins,
    and so is suspending or restoring an admin; nobody recovers an admin's account), step_up_required (403: recovery,
    or suspending or restoring an admin), identifier_taken (409), last_identifier (409), invalid_identifier (422)."""
    target = db.get(User, user_id)
    if target is None:
        raise not_found("This account doesn't exist.")
    new_status = UserStatus(body.status) if body.status is not None else None
    recovery: dict[Kind, str | None] = {}
    if "email" in body.model_fields_set:
        recovery["email"] = body.email
    if "phone" in body.model_fields_set:
        recovery["phone"] = body.phone
    contacts = access.is_admin(user)
    if new_status is None and not recovery:
        return admin_user(target, contacts=contacts)
    if target.id == user.id:
        raise conflict("cannot_change_self", "You can't change your own account here. Ask another admin.")
    if recovery:
        if not contacts:
            raise forbidden("Only admins can do this.")
        if access.access_of(target, db).admin:
            raise forbidden("An admin's email address and phone number can't be changed here. Take Admin away first.")
        sessions.require_step_up(sess)
    ip = client_ip(request)
    if new_status is not None and new_status != target.status:
        if access.access_of(target, db).admin:
            if not contacts:
                suspend = new_status == UserStatus.suspended
                raise forbidden("Only admins can suspend an admin." if suspend else "Only admins can restore an admin.")
            sessions.require_step_up(sess)
            if new_status == UserStatus.suspended:
                access.ensure_admins_remain(db, target)
        record(db, user, "user.status", "user", target.id, {"from": target.status.value, "to": new_status.value}, ip)
        target.status = new_status
        title, body_text = STATUS_NOTICES[new_status]
        notify(db, target.id, "system", title, body=body_text, actor=user)
    notices = [n for kind, raw in recovery.items() if (n := _recover(db, user, target, kind, raw, ip)) is not None]
    db.commit()
    for to, message in notices:
        send_text_notice(to, message)
    return admin_user(target, contacts=contacts)


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


@router.put("/admin/users/{user_id}/roles", response_model=AdminUser)
def set_user_roles(user_id: UUID, body: UserRolesUpdate, request: Request, user: SteppedUpAdmin, db: DB) -> AdminUser:
    """The roles the person holds afterwards, exactly. They're told. Errors: step_up_required (403),
    cannot_change_self (409), last_admin (409: the only active admin keeps Admin), invalid_input (422: a role that
    doesn't exist), rate_limited (429). Audited."""
    target = db.get(User, user_id)
    if target is None:
        raise not_found("This account doesn't exist.")
    roles.set_user_roles(db, user, target, body.role_ids, client_ip(request))
    db.commit()
    return admin_user(target, contacts=True)


@router.get("/admin/audit", response_model=AuditPage)
def audit_log(
    user: Annotated[User, requires(Box.audit_read)], db: DB, limit: Limit = 50, offset: Offset = 0
) -> AuditPage:
    """Who did what, newest first."""
    actor = aliased(User)
    total = _count(db, select(func.count()).select_from(AuditEntry))
    rows = (
        db.execute(
            select(AuditEntry, actor)
            .outerjoin(actor, actor.id == AuditEntry.actor_id)
            .order_by(AuditEntry.created_at.desc(), AuditEntry.id.desc())
            .limit(limit)
            .offset(offset)
        )
        .tuples()
        .all()
    )
    access.prefetch(db, [a for _, a in rows])
    admin = access.is_admin(user)
    items = [
        AuditOut.model_validate(
            {
                "id": e.id,
                "actor": public_user(a),
                "action": e.action,
                "target_type": e.target_type,
                "target_id": e.target_id,
                "data": documents.audit_view(e.data or {}, admin=admin),
                "created_at": e.created_at,
            }
        )
        for e, a in rows
    ]
    return AuditPage(items=items, total=total, limit=limit, offset=offset)
