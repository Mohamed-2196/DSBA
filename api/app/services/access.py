"""Access read from the database: a person's roles, the feature switches, and the checks the API makes with them. The
rules are in app/core/access.py.

A database session keeps what it loaded (in Session.info), so a request reads a person's roles and the switches once.
Every change to roles, grants or switches calls forget(). Each request has a session of its own, so a change applies
from the next request on (spec, rule 5)."""

from __future__ import annotations

import uuid
from collections.abc import Iterable

from sqlalchemy import ColumnElement, and_, delete, or_, select, true
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.orm import Session, object_session

from app.core.access import (
    ADMIN,
    BOXES,
    FEATURES,
    GUEST,
    SWITCH_MODES,
    Access,
    Box,
    Feature,
    RoleRef,
    SwitchMode,
    SwitchState,
    build_access,
    effective_boxes,
    known_feature,
)
from app.core.access import feature_on as switch_allows
from app.core.errors import conflict, feature_off, forbidden
from app.core.time import utcnow
from app.models import AccessRole, FeatureSwitch, FeatureSwitchRole, RoleBox, RoleGrant, User, UserStatus
from app.services import ratelimit

ACCESS_KEY = "dsba.access"  # Session.info: {user id: Access}
SWITCHES_KEY = "dsba.switches"  # Session.info: {Feature: SwitchState}
MODES: dict[str, SwitchMode] = {m: m for m in SWITCH_MODES}

# ── reading ─────────────────────────────────────────────────────────────────────────────────


def _cache(db: Session) -> dict[uuid.UUID, Access]:
    cache: dict[uuid.UUID, Access] = db.info.setdefault(ACCESS_KEY, {})
    return cache


def forget(db: Session) -> None:
    """Drops what this session loaded about roles and switches. Call it after any change to them."""
    db.info.pop(ACCESS_KEY, None)
    db.info.pop(SWITCHES_KEY, None)


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


def switches(db: Session) -> dict[Feature, SwitchState]:
    """Every switch the code knows. A stored key it doesn't know is ignored, and a missing feature counts as off."""
    cached: dict[Feature, SwitchState] | None = db.info.get(SWITCHES_KEY)
    if cached is not None:
        return cached
    on_for: dict[str, set[uuid.UUID]] = {}
    for key, role_id in db.execute(select(FeatureSwitchRole.feature, FeatureSwitchRole.role_id)):
        on_for.setdefault(key, set()).add(role_id)
    states: dict[Feature, SwitchState] = {}
    for key, stored in db.execute(select(FeatureSwitch.feature, FeatureSwitch.mode)):
        feature, mode = known_feature(key), MODES.get(stored)
        if feature is not None and mode is not None:
            states[feature] = SwitchState(mode, frozenset(on_for.get(key, ())))
    db.info[SWITCHES_KEY] = states
    return states


def feature_on(db: Session, user: User | None, feature: Feature) -> bool:
    return switch_allows(switches(db).get(feature), access_of(user, db), active=is_active(user))


def features_on(db: Session, user: User | None) -> list[Feature]:
    """The features that exist for this person, in the order FEATURES lists them."""
    return [f for f in FEATURES if feature_on(db, user, f)]


def on_for_everyone(db: Session, feature: Feature) -> bool:
    """Whether the switch shows `feature` to everyone, guests included: only then may a shared cache keep its pages."""
    state = switches(db).get(feature)
    return state is not None and state.mode == "everyone"


def audience(db: Session, feature: Feature) -> ColumnElement[bool] | None:
    """A condition on User for the accounts `feature` is on for, or None when it is off for everyone but admins
    (who are told nothing about a switched-off feature)."""
    state = switches(db).get(feature)
    if state is None or state.mode == "off":
        return None
    if state.mode == "everyone":
        return true()
    holders = (
        select(RoleGrant.user_id)
        .join(AccessRole, AccessRole.id == RoleGrant.role_id)
        .where(or_(RoleGrant.role_id.in_(state.role_ids), AccessRole.slug == ADMIN))
    )
    return and_(User.status == UserStatus.active, User.id.in_(holders))


def require_feature(db: Session, user: User | None, feature: Feature) -> None:
    """404 feature_off unless `feature` is on for the person (admins see every feature)."""
    if not feature_on(db, user, feature):
        raise feature_off()


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
    """409 last_admin when `losing`, about to lose Admin, be suspended or be deleted, is the only active admin.

    Every such change waits here for the others (security review AD-7): the advisory lock comes first, so the count
    reads what the change before committed, and the admins' grants stay locked until the transaction ends. Two
    admins demoting each other, or deleting their accounts, at the same moment can't both succeed."""
    ratelimit.lock(db, "access:admins")
    admins = db.scalars(
        select(RoleGrant.user_id)
        .join(AccessRole, AccessRole.id == RoleGrant.role_id)
        .join(User, User.id == RoleGrant.user_id)
        .where(AccessRole.slug == ADMIN, User.status == UserStatus.active)
        .with_for_update(of=RoleGrant)
    ).all()
    if not any(user_id != losing.id for user_id in admins):
        raise conflict("last_admin", "The hub needs at least one active admin. Make someone else an admin first.")


def store_switch(
    db: Session, feature: Feature, mode: SwitchMode, role_ids: Iterable[uuid.UUID], *, by: User | None
) -> None:
    """Sets a feature's switch. The roles count only for "roles". No audit: callers record it."""
    now, by_id = utcnow(), by.id if by else None
    db.execute(
        pg_insert(FeatureSwitch)
        .values(feature=feature.value, mode=mode, updated_by=by_id, updated_at=now)
        .on_conflict_do_update(index_elements=["feature"], set_={"mode": mode, "updated_by": by_id, "updated_at": now})
    )
    db.execute(delete(FeatureSwitchRole).where(FeatureSwitchRole.feature == feature.value))
    if mode == "roles":
        db.add_all(FeatureSwitchRole(feature=feature.value, role_id=role_id) for role_id in set(role_ids))
        db.flush()
    forget(db)
