"""Creating notifications. Every feature that tells someone about something calls notify()."""

from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models import Notification, User


def notify(
    db: Session,
    user_id: uuid.UUID,
    kind: str,
    title: str,
    *,
    body: str | None = None,
    url: str | None = None,
    actor: User | None = None,
    data: dict[str, Any] | None = None,
) -> Notification | None:
    """Adds a notification for `user_id` to the session (the caller commits). Nobody is notified about their own
    action: returns None when the actor is the recipient. Kinds: app/schemas/notifications.py NotificationKind."""
    if actor is not None and actor.id == user_id:
        return None
    n = Notification(
        user_id=user_id,
        kind=kind,
        title=title[:200],
        body=body,
        url=url,
        actor_id=actor.id if actor else None,
        data=data or {},
    )
    db.add(n)
    return n
