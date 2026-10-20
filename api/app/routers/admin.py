"""People, the hub's numbers and the audit log. Owner: accounts agent."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Request
from sqlalchemy import ColumnElement, Select, func, or_, select
from sqlalchemy.orm import Session, aliased

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
from app.schemas.auth import ResetLinkOut
from app.schemas.common import ErrorResponse
from app.schemas.gaps import Gaps
from app.schemas.moderation import AdminStats, AdminUser, AdminUserPage, AdminUserUpdate, AuditOut, AuditPage
from app.services import (
    access,
    accounts,
    bugs,
    documents,
    gaps,
    lesson_topics,
    reports,
    requests,
    roles,
    sessions,
    signin,
    suggestions,
)
from app.services.accounts import public_user
from app.services.audit import record
from app.services.notify import notify

router = router_for("admin")

SEARCH_MAX = 100
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
    """A person for the people list. `contacts`: their email address (admins only)."""
    return AdminUser.model_validate(
        {
            "id": u.id,
            "display_name": u.display_name,
            "email": u.email if contacts else None,
            "email_confirmed": u.email_confirmed_at is not None,
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


def _pending_suggestions(db: Session, user: User) -> int | None:
    """Suggested videos and time stamps waiting for review, for people who edit modules while either is on."""
    if not access.can(user, Box.content_edit):
        return None
    videos = access.feature_on(db, user, Feature.modules_video_suggestions)
    stamps = access.feature_on(db, user, Feature.modules_time_stamps)
    if not videos and not stamps:
        return None
    return (suggestions.pending_count(db) if videos else 0) + (lesson_topics.pending_count(db) if stamps else 0)


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
        pending_suggestions=_pending_suggestions(db, user),
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
    and see email addresses.

    Errors: invalid (422: no role with this slug)."""
    contacts = access.is_admin(user)
    where: list[ColumnElement[bool]] = []
    text = (q or "").strip()[:SEARCH_MAX]
    if text:
        pattern = _like(text)
        matches = [User.display_name.ilike(pattern, escape="\\")]
        if contacts:
            matches.append(User.email.ilike(pattern, escape="\\"))
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
    """Suspend or restore an account. Audited, and the person gets a notification. Suspending or restoring an admin is
    for admins, with a recent step-up (security review AD-1).

    Errors: cannot_change_self (409), last_admin (409: the only active admin), forbidden (403: suspending or restoring
    an admin), step_up_required (403: suspending or restoring an admin)."""
    target = db.get(User, user_id)
    if target is None:
        raise not_found("This account doesn't exist.")
    new_status = UserStatus(body.status) if body.status is not None else None
    contacts = access.is_admin(user)
    if new_status is None:
        return admin_user(target, contacts=contacts)
    if target.id == user.id:
        raise conflict("cannot_change_self", "You can't change your own account here. Ask another admin.")
    ip = client_ip(request)
    if new_status != target.status:
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
    db.commit()
    return admin_user(target, contacts=contacts)


@router.post("/admin/users/{user_id}/reset-link", response_model=ResetLinkOut)
def make_reset_link(user_id: UUID, request: Request, user: SteppedUpAdmin, db: DB) -> ResetLinkOut:
    """A one-time link for someone who forgot their password, for you to pass on (the Hub sends no email). It works
    once, within an hour; a newer link retires older ones. Audited, and the person is told.

    Errors: step_up_required (403), forbidden (403: an account holding Admin), cannot_change_self (409)."""
    target = db.get(User, user_id)
    if target is None:
        raise not_found("This account doesn't exist.")
    link = signin.issue_reset_link(db, user, target, client_ip(request))
    db.commit()
    return link


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
