"""The signed-in user's notifications. Owner: accounts agent (creating them: app/services/notify.py)."""

from __future__ import annotations

import logging
from typing import get_args
from uuid import UUID

from fastapi import Response, status
from sqlalchemy import func, select, update
from sqlalchemy.orm import aliased

from app.core.errors import not_found
from app.core.pagination import Limit, Offset
from app.core.security import DB, CurrentUser
from app.core.time import utcnow
from app.models import Notification, User
from app.routers._base import router_for
from app.schemas.notifications import NotificationKind, NotificationOut, NotificationPage
from app.services.accounts import public_user

router = router_for("notifications")
log = logging.getLogger("dsba.notifications")
KINDS = frozenset(get_args(NotificationKind))


def _out(n: Notification, actor: User | None) -> NotificationOut:
    kind = n.kind
    if kind not in KINDS:  # a kind the contract doesn't list yet: shown as a system notice, not a 500
        log.warning("notification %s has an unknown kind %r", n.id, kind)
        kind = "system"
    return NotificationOut.model_validate(
        {
            "id": n.id,
            "kind": kind,
            "title": n.title,
            "body": n.body,
            "url": n.url,
            "actor": public_user(actor),
            "created_at": n.created_at,
            "read_at": n.read_at,
        }
    )


@router.get("/notifications", response_model=NotificationPage)
def list_notifications(
    user: CurrentUser, db: DB, unread: bool = False, limit: Limit = 20, offset: Offset = 0
) -> NotificationPage:
    """Newest first, with the unread count."""
    mine = Notification.user_id == user.id
    shown = [mine, Notification.read_at.is_(None)] if unread else [mine]
    total = db.scalar(select(func.count()).select_from(Notification).where(*shown)) or 0
    unread_count = db.scalar(select(func.count()).select_from(Notification).where(mine, Notification.read_at.is_(None)))
    actor = aliased(User)
    rows = db.execute(
        select(Notification, actor)
        .outerjoin(actor, actor.id == Notification.actor_id)
        .where(*shown)
        .order_by(Notification.created_at.desc(), Notification.id.desc())
        .limit(limit)
        .offset(offset)
    ).tuples()
    return NotificationPage(
        items=[_out(n, a) for n, a in rows],
        total=total,
        limit=limit,
        offset=offset,
        unread_count=unread_count or 0,
    )


@router.post("/notifications/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(notification_id: UUID, user: CurrentUser, db: DB) -> Response:
    n = db.get(Notification, notification_id)
    if n is None or n.user_id != user.id:
        raise not_found("This notification doesn't exist.")
    if n.read_at is None:
        n.read_at = utcnow()
        db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/notifications/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_read(user: CurrentUser, db: DB) -> Response:
    db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        .values(read_at=utcnow())
    )
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
