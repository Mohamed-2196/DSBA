"""What admins change on the Access screen: roles, people's roles and the feature switches. Each change is audited,
limited to 60 per admin per 10 minutes, and told to the people it touches. The routes also ask for a recent step-up
(security review AD-1)."""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from datetime import timedelta
from typing import Any, cast

from sqlalchemy import CursorResult, delete, func, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.access import ADMIN, BOXES, FEATURES, REP, STUDENT, STUDENT_BOXES, Box, Feature, known_boxes
from app.core.errors import conflict, invalid, not_found
from app.core.text import unique_slug
from app.core.time import utcnow
from app.models import AccessRole, AuditEntry, RoleBox, RoleGrant, User
from app.schemas.access import BoxOut, FeatureOut, RoleCatalogue, RoleCreate, RoleOut, RoleUpdate, SwitchUpdate
from app.services import access, ratelimit
from app.services.accounts import characters_problem, looks, plain_text, reads_as_staff
from app.services.audit import record
from app.services.notify import notify

ACTIONS = ("role.create", "role.update", "role.delete", "user.roles", "feature.switch")
CHANGES_LIMIT = 60
CHANGES_WINDOW = timedelta(minutes=10)
UNKNOWN_ROLE = "One of these roles doesn't exist. Reload the page and try again."
STAFF_ROLES = (ADMIN, REP)  # the roles whose badges may use staff words


def limit_changes(db: Session, admin: User) -> None:
    """429 after 60 changes to roles, people's roles and switches by this admin in 10 minutes."""
    ratelimit.enforce(
        db,
        f"access-admin:{admin.id}",
        AuditEntry.created_at,
        [AuditEntry.actor_id == admin.id, AuditEntry.action.in_(ACTIONS)],
        limit=CHANGES_LIMIT,
        window=CHANGES_WINDOW,
        message="That's a lot of changes at once. Try again in {}.",
    )


# ── roles ───────────────────────────────────────────────────────────────────────────────────


def _stored_boxes(db: Session, role_ids: Sequence[uuid.UUID]) -> dict[uuid.UUID, list[str]]:
    found: dict[uuid.UUID, list[str]] = {}
    for role_id, box in db.execute(select(RoleBox.role_id, RoleBox.box).where(RoleBox.role_id.in_(role_ids))):
        found.setdefault(role_id, []).append(box)
    return found


def _boxes(role: AccessRole, stored: Sequence[str]) -> list[Box]:
    """The boxes a role gives: every box for Admin; otherwise the stored ones the code knows, in BOXES order."""
    held = frozenset(Box) if role.slug == ADMIN else known_boxes(stored)
    return [b for b in BOXES if b in held]


def _out(role: AccessRole, stored: Sequence[str], holders: int) -> RoleOut:
    return RoleOut(
        id=role.id,
        slug=role.slug,
        name=role.name,
        badge=role.badge,
        position=role.position,
        built_in=role.built_in,
        locked=role.locked,
        version=role.version,
        boxes=[b.value for b in _boxes(role, stored)],
        holders=holders,
    )


def _ordered(db: Session) -> list[AccessRole]:
    """Admin, Rep, then the others by position and name."""
    roles = db.scalars(select(AccessRole)).all()
    first = {ADMIN: 0, REP: 1}
    return sorted(roles, key=lambda r: (first.get(r.slug, 2), r.position, r.name.casefold()))


def catalogue(db: Session) -> RoleCatalogue:
    roles = _ordered(db)
    stored = _stored_boxes(db, [r.id for r in roles])
    holders = dict(db.execute(select(RoleGrant.role_id, func.count()).group_by(RoleGrant.role_id)).tuples().all())
    return RoleCatalogue(
        roles=[_out(r, stored.get(r.id, []), holders.get(r.id, 0)) for r in roles],
        boxes=[BoxOut(key=b.value, area=info.area, label=info.label) for b, info in BOXES.items()],
    )


def role_out(db: Session, role: AccessRole) -> RoleOut:
    holders = db.scalar(select(func.count()).select_from(RoleGrant).where(RoleGrant.role_id == role.id)) or 0
    return _out(role, _stored_boxes(db, [role.id]).get(role.id, []), holders)


def _check_name(db: Session, name: str, *, other_than: uuid.UUID | None = None) -> None:
    taken = select(AccessRole.id).where(func.lower(AccessRole.name) == name.lower())
    if other_than is not None:
        taken = taken.where(AccessRole.id != other_than)
    if db.scalar(taken) is not None:
        raise invalid("name", "Another role already has this name.")


def _clean_badge(db: Session, badge: str | None, role: AccessRole | None = None) -> str | None:
    """The badge as it is kept (plain_text()), or 422 on `badge` (security review AD-4):
    - only the characters a name may hold, so nothing invisible hides a staff word;
    - nothing that reads as a staff word, except on Admin and Rep;
    - never what another role's badge looks like."""
    if badge is None:
        return None
    plain = plain_text(badge)
    if (problem := characters_problem(plain)) is not None:
        raise invalid("badge", problem)
    if (role is None or role.slug not in STAFF_ROLES) and reads_as_staff(plain):
        raise invalid("badge", "This badge is kept for the Hub's staff. Choose another one.")
    others = db.execute(select(AccessRole.id, AccessRole.badge).where(AccessRole.badge.is_not(None))).tuples()
    seen = looks(plain)
    if any(looks(shown) == seen for role_id, shown in others if shown and (role is None or role_id != role.id)):
        raise invalid("badge", "Another role already shows this badge.")
    return plain


def _check_boxes(role: AccessRole, boxes: Sequence[str]) -> None:
    """Student, which every new account gets, holds student-level boxes only (security review AD-3)."""
    if role.slug == STUDENT and not known_boxes(boxes) <= STUDENT_BOXES:
        raise invalid("boxes", "Every new account gets this role, so it can hold only the student-level boxes.")


def _snapshot(db: Session, role: AccessRole) -> dict[str, Any]:
    stored = _stored_boxes(db, [role.id]).get(role.id, [])
    return {"name": role.name, "badge": role.badge, "position": role.position, "boxes": sorted(stored)}


def create_role(db: Session, admin: User, body: RoleCreate, ip: str | None) -> AccessRole:
    """A new role, last in the order. Its slug comes from its name."""
    limit_changes(db, admin)
    _check_name(db, body.name)
    badge = _clean_badge(db, body.badge)
    position = (db.scalar(select(func.max(AccessRole.position))) or 0) + 1
    role = AccessRole(
        slug=unique_slug(db, AccessRole.slug, body.name, fallback="role"),
        name=body.name,
        badge=badge,
        position=position,
    )
    try:
        with db.begin_nested():
            db.add(role)
            db.flush()
    except IntegrityError:  # the same name or slug, taken a moment ago
        raise invalid("name", "Another role already has this name.") from None
    boxes = sorted(set(body.boxes))
    db.add_all(RoleBox(role_id=role.id, box=box) for box in boxes)
    db.flush()
    record(db, admin, "role.create", "role", role.id, {"name": role.name, "badge": role.badge, "boxes": boxes}, ip)
    access.forget(db)
    return role


def update_role(db: Session, admin: User, role_id: uuid.UUID, body: RoleUpdate, ip: str | None) -> AccessRole:
    """Changes a role, if nobody changed it since the admin loaded `body.version`: one conditional UPDATE bumps the
    version, so of two saves of the same version, the second gets 409 role_changed."""
    limit_changes(db, admin)
    role = db.get(AccessRole, role_id)
    if role is None:
        raise not_found("This role doesn't exist.")
    if role.locked:
        raise conflict("role_locked", "The Admin role holds every power, and can't be changed.")
    sent = body.model_fields_set
    before = _snapshot(db, role)
    changes: dict[str, Any] = {}
    if "name" in sent and body.name is not None and body.name != role.name:
        _check_name(db, body.name, other_than=role.id)
        changes["name"] = body.name
    badge = _clean_badge(db, body.badge, role) if "badge" in sent else role.badge
    if badge != role.badge:
        changes["badge"] = badge
    if "position" in sent and body.position is not None and body.position != role.position:
        changes["position"] = body.position
    boxes = sorted(set(body.boxes)) if "boxes" in sent and body.boxes is not None else None
    if boxes is not None:
        _check_boxes(role, boxes)
    if not changes and (boxes is None or boxes == before["boxes"]):
        return role
    bumped = cast(
        CursorResult[Any],
        db.execute(
            update(AccessRole)
            .where(AccessRole.id == role.id, AccessRole.version == body.version)
            .values(version=AccessRole.version + 1, updated_at=utcnow(), **changes)
            .execution_options(synchronize_session=False)
        ),
    )
    if bumped.rowcount == 0:
        raise conflict("role_changed", "Someone else changed this role while you were editing. Load it again.")
    if boxes is not None:
        db.execute(delete(RoleBox).where(RoleBox.role_id == role.id))
        db.add_all(RoleBox(role_id=role.id, box=box) for box in boxes)
    db.flush()
    db.refresh(role)
    record(db, admin, "role.update", "role", role.id, {"before": before, "after": _snapshot(db, role)}, ip)
    access.forget(db)
    return role


def delete_role(db: Session, admin: User, role_id: uuid.UUID, ip: str | None) -> None:
    """Deletes a role that isn't built in. Its holders lose it and are told; the log keeps what it gave."""
    limit_changes(db, admin)
    role = db.get(AccessRole, role_id)
    if role is None:
        raise not_found("This role doesn't exist.")
    if role.built_in:
        raise conflict("role_locked", "Built-in roles can't be deleted. Take their boxes away instead.")
    used_by = [FEATURES[f].label for f, state in access.switches(db).items() if role.id in state.role_ids]
    if used_by:
        names, switches = ", ".join(sorted(used_by)), "its switch" if len(used_by) == 1 else "their switches"
        raise conflict(
            "role_in_use", f"Switched on for this role: {names}. Change {switches} first, then delete the role."
        )
    holders = db.scalars(select(RoleGrant.user_id).where(RoleGrant.role_id == role.id)).all()
    record(db, admin, "role.delete", "role", role.id, {**_snapshot(db, role), "holders": len(holders)}, ip)
    for user_id in holders:
        body = f"The {role.name} role was removed from the hub."
        notify(db, user_id, "system", "Your roles changed", body=body, actor=admin)
    db.delete(role)
    db.flush()
    access.forget(db)


def set_user_roles(db: Session, admin: User, target: User, role_ids: Sequence[uuid.UUID], ip: str | None) -> None:
    """The person holds exactly these roles afterwards. Nobody changes their own, and the last active admin keeps
    Admin."""
    limit_changes(db, admin)
    if target.id == admin.id:
        raise conflict("cannot_change_self", "You can't change your own roles. Ask another admin.")
    wanted = set(role_ids)
    roles = db.scalars(select(AccessRole).where(AccessRole.id.in_(wanted))).all() if wanted else []
    if len(roles) != len(wanted):
        raise invalid("roleIds", UNKNOWN_ROLE)
    before = access.role_names(target)
    if access.access_of(target, db).admin and all(r.slug != ADMIN for r in roles):
        access.ensure_admins_remain(db, target)
    access.set_roles(db, target, roles, by=admin)
    after = access.role_names(target)
    if after == before:
        return
    record(db, admin, "user.roles", "user", target.id, {"from": before, "to": after}, ip)
    held = ", ".join(after) if after else "no roles"
    notify(db, target.id, "system", "Your roles changed", body=f"You now hold: {held}.", actor=admin)


# ── switches ────────────────────────────────────────────────────────────────────────────────


def _switch_out(db: Session, feature: Feature) -> FeatureOut:
    state = access.switches(db).get(feature)
    return FeatureOut(
        feature=feature.value,
        label=FEATURES[feature].label,
        hides=FEATURES[feature].hides,
        mode=state.mode if state else "off",
        role_ids=sorted(state.role_ids) if state else [],
    )


def switch_list(db: Session) -> list[FeatureOut]:
    return [_switch_out(db, f) for f in FEATURES]


def set_switch(db: Session, admin: User, feature: Feature, body: SwitchUpdate, ip: str | None) -> FeatureOut:
    limit_changes(db, admin)
    wanted = set(body.role_ids) if body.mode == "roles" else set()
    if body.mode == "roles" and not wanted:
        raise invalid("roleIds", "Choose at least one role.")
    roles = db.scalars(select(AccessRole).where(AccessRole.id.in_(wanted))).all() if wanted else []
    if len(roles) != len(wanted):
        raise invalid("roleIds", UNKNOWN_ROLE)
    state = access.switches(db).get(feature)
    access.store_switch(db, feature, body.mode, wanted, by=admin)
    change = {
        "feature": feature.value,
        "from": state.mode if state else "off",
        "to": body.mode,
        "roles": sorted(r.name for r in roles),
    }
    record(db, admin, "feature.switch", "feature", feature.value, change, ip)
    return _switch_out(db, feature)
