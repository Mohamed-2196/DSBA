"""Access read from the database: a person's roles and the checks the API makes with them. The rules are in
app/core/access.py.

A database session keeps what it loaded (in Session.info), so a request reads a person's roles once. Every change to
roles or grants calls forget(). Each request has a session of its own, so a change applies from the next request on
(spec, rule 5)."""

from __future__ import annotations

import uuid
from collections.abc import Iterable

from sqlalchemy import delete, func, select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session, object_session

from app.core.access import ADMIN, BOXES, GUEST, Access, Box, RoleRef, build_access, effective_boxes
from app.core.errors import conflict, forbidden
from app.models import AccessRole, RoleBox, RoleGrant, User, UserStatus
from app.services import ratelimit

ACCESS_KEY = "dsba.access"  # Session.info: {user id: Access}

# ── reading ─────────────────────────────────────────────────────────────────────────────────


def _cache(db: Session) -> dict[uuid.UUID, Access]:
    cache: dict[uuid.UUID, Access] = db.info.setdefault(ACCESS_KEY, {})
    return cache


def forget(db: Session) -> None:
    """Drops what this session loaded about roles. Call it after any change to roles or grants."""
    db.info.pop(ACCESS_KEY, None)


def prefetch(db: Session, users: Iterable[User | None]) -> None:
    """Loads the roles of everyone in `users` who isn't loaded yet, in two queries (lists of authors call this)."""
    cache = _cache(db)
    ids = {u.id for u in users if u is not None and u.id not in cache}
    if not ids:
        return
    rows = (
        db.execute(
            select(
                RoleGrant.user_id,
                AccessRole.id,
                AccessRole.slug,
                AccessRole.name,
                AccessRole.badge,
                AccessRole.position,
            )
            .join(AccessRole, AccessRole.id == RoleGrant.role_id)
            .where(RoleGrant.user_id.in_(ids))
        )
        .tuples()
        .all()
    )
    role_ids = {row[1] for row in rows}
    boxes: dict[uuid.UUID, list[str]] = {}
    if role_ids:
        for role_id, box in db.execute(select(RoleBox.role_id, RoleBox.box).where(RoleBox.role_id.in_(role_ids))):
            boxes.setdefault(role_id, []).append(box)
    roles: dict[uuid.UUID, list[RoleRef]] = {user_id: [] for user_id in ids}
    for user_id, role_id, slug, name, badge, position in rows:
        roles[user_id].append(RoleRef(role_id, slug, name, badge, position))
    for user_id, refs in roles.items():
        cache[user_id] = build_access(refs, boxes)


def access_of(user: User | None, db: Session | None = None) -> Access:
    """The person's roles and the boxes they give, before the account's status is applied. A guest's for None."""
    if user is None:
        return GUEST
    session = db or object_session(user)
    if session is None:  # an object no session loaded: it holds nothing
        return GUEST
    cache = _cache(session)
    if user.id not in cache:
        prefetch(session, [user])
    return cache[user.id]


def is_active(user: User | None) -> bool:
    return user is not None and user.status == UserStatus.active


def boxes_of(user: User | None) -> frozenset[Box]:
    """What the person may do now: none for a guest or a suspended account."""
    return effective_boxes(access_of(user), active=is_active(user))


def can(user: User | None, box: Box) -> bool:
    return box in boxes_of(user)


def require(user: User | None, box: Box) -> None:
    """403 with the box's message unless the person holds `box` (for checks that depend on the request body)."""
    if not can(user, box):
        raise forbidden(BOXES[box].refusal)


def is_admin(user: User | None) -> bool:
    """Holds Admin with an active account: the admin-only powers (roles, switches, account recovery, reporters)."""
    return is_active(user) and access_of(user).admin


def role_names(user: User) -> list[str]:
    """The person's roles by name, in role order: how the audit log records them."""
    return [r.name for r in access_of(user).roles]


# ── changing ────────────────────────────────────────────────────────────────────────────────


def role_by_slug(db: Session, slug: str) -> AccessRole | None:
    return db.scalar(select(AccessRole).where(AccessRole.slug == slug))


def give(db: Session, user: User, *slugs: str, by: User | None = None) -> None:
    """Gives the person these roles. Roles they hold already stay as they are. No audit: callers record it."""
    for slug in slugs:
        role = role_by_slug(db, slug)
        if role is None:
            raise LookupError(f"no role {slug!r}")
        db.execute(
            pg_insert(RoleGrant)
            .values(user_id=user.id, role_id=role.id, given_by=by.id if by else None)
            .on_conflict_do_nothing()
        )
    forget(db)


def set_roles(db: Session, user: User, roles: Iterable[AccessRole], *, by: User | None = None) -> None:
    """The person now holds exactly these roles. No audit: callers record it."""
    wanted = {r.id for r in roles}
    db.execute(delete(RoleGrant).where(RoleGrant.user_id == user.id, RoleGrant.role_id.not_in(wanted)))
    for role_id in wanted:
        db.execute(
            pg_insert(RoleGrant)
            .values(user_id=user.id, role_id=role_id, given_by=by.id if by else None)
            .on_conflict_do_nothing()
        )
    forget(db)


def ensure_admins_remain(db: Session, losing: User) -> None:
    """409 last_admin when `losing`, about to lose Admin or be suspended, is the only active admin. It takes a lock
    first, so two admins demoting each other at the same moment can't both succeed."""
    ratelimit.lock(db, "access:admins")
    others = db.scalar(
        select(func.count())
        .select_from(RoleGrant)
        .join(AccessRole, AccessRole.id == RoleGrant.role_id)
        .join(User, User.id == RoleGrant.user_id)
        .where(AccessRole.slug == ADMIN, User.status == UserStatus.active, User.id != losing.id)
    )
    if not others:
        raise conflict("last_admin", "The hub needs at least one active admin. Make someone else an admin first.")
