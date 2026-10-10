"""The audit log: one row per action that changes someone else's things."""

from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

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
    """Adds the entry to the session; the caller commits it with the change it describes."""
    db.add(
        AuditEntry(
            actor_id=actor.id if actor else None,
            action=action,
            target_type=target_type,
            target_id=str(target_id) if target_id is not None else None,
            data=data or {},
            ip=ip,
        )
    )
