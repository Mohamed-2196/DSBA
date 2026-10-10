"""Creating notifications. Every feature that tells someone about something calls notify()."""

from __future__ import annotations

import re
import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models import Notification, User

URL_MAX = 300  # Notification.url
# A page of the Hub: '/forum/<slug>', never '//host' or '/\host' (both lead off-site), a scheme, spaces or control
# characters (browsers drop tabs and newlines from URLs, so '/\t/host' would become '//host').
_HUB_PATH = re.compile(r"/(?![/\\])[^\x00-\x20\x7f\\]*")


def hub_path(url: str | None) -> str | None:
    """`url` when it is a path inside the Hub, else None (security review, finding 18)."""
    if url is None or len(url) > URL_MAX or not _HUB_PATH.fullmatch(url):
        return None
    return url


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
    action: returns None when the actor is the recipient. `url` is kept only when it is a page of the Hub
    ('/forum/<slug>'); anything else is dropped. Kinds: app/schemas/notifications.py NotificationKind."""
    if actor is not None and actor.id == user_id:
        return None
    n = Notification(
        user_id=user_id,
        kind=kind,
        title=title[:200],
        body=body,
        url=hub_path(url),
        actor_id=actor.id if actor else None,
        data=data or {},
    )
    db.add(n)
    return n
