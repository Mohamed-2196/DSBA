"""The audit log: one row per action that changes someone else's things."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.core.security import valid_ip
from app.models import AuditEntry, User


def record(
    db: Session,
    actor: User | None,
    action: str,
    target_type: str | None = None,
    target_id: object | None = None,
    data: dict[str, Any] | None = None,
    ip: str | None = None,
) -> None:
    """Adds the entry to the session; the caller commits it with the change it describes.

    `data` keeps a snapshot of names, since ids go NULL when an account is deleted and titles change afterwards
    (security review, finding 21): `actorName`, the actor's display name, and for actions on an account
    (target_type 'user') `targetName`. Values the caller passes win. An `ip` that isn't an IP address is stored
    as none."""
    snapshot = dict(data or {})
    if actor is not None:
        snapshot.setdefault("actorName", actor.display_name)
    if target_type == "user" and "targetName" not in snapshot:
        target = _user(db, target_id)
        snapshot["targetName"] = target.display_name if target is not None else None
    db.add(
        AuditEntry(
            actor_id=actor.id if actor else None,
            action=action,
            target_type=target_type,
            target_id=str(target_id) if target_id is not None else None,
            data=snapshot,
            ip=valid_ip(ip),
        )
    )


def _user(db: Session, user_id: object | None) -> User | None:
    try:
        key = user_id if isinstance(user_id, uuid.UUID) else uuid.UUID(str(user_id))
    except ValueError:
        return None
    return db.get(User, key)
