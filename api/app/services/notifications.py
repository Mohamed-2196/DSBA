"""Reading notifications: the signed-in person's list, and marking them read (creating them: services/notify.py)."""

from __future__ import annotations

from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, aliased

from app.core.errors import not_found
from app.core.time import utcnow
from app.models import Notification, User
from app.schemas.notifications import NotificationOut, NotificationPage
from app.services import access
from app.services.accounts import public_user


def _out(n: Notification, actor: User | None) -> NotificationOut:
    # n.kind is a NotificationKind: notify() takes nothing else and the database checks it
    return NotificationOut.model_validate(
        {
            "id": n.id,
            "kind": n.kind,
            "title": n.title,
            "body": n.body,
            "url": n.url,
            "actor": public_user(actor),
            "created_at": n.created_at,
            "read_at": n.read_at,
        }
    )


def list_page(db: Session, user: User, *, unread: bool, limit: int, offset: int) -> NotificationPage:
    """`user`'s notifications, newest first (only the unread ones when `unread`), with the unread count."""
    mine = Notification.user_id == user.id
    shown = [mine, Notification.read_at.is_(None)] if unread else [mine]
    total = db.scalar(select(func.count()).select_from(Notification).where(*shown)) or 0
    unread_count = db.scalar(select(func.count()).select_from(Notification).where(mine, Notification.read_at.is_(None)))
    actor = aliased(User)
    rows = (
        db.execute(
            select(Notification, actor)
            .outerjoin(actor, actor.id == Notification.actor_id)
            .where(*shown)
            .order_by(Notification.created_at.desc(), Notification.id.desc())
            .limit(limit)
            .offset(offset)
        )
        .tuples()
        .all()
    )
    access.prefetch(db, [a for _, a in rows])
    return NotificationPage(
        items=[_out(n, a) for n, a in rows],
        total=total,
        limit=limit,
        offset=offset,
        unread_count=unread_count or 0,
    )


def mark_read(db: Session, user: User, notification_id: UUID) -> None:
    """Marks one of `user`'s notifications read (the caller commits). 404 for anyone else's."""
    n = db.get(Notification, notification_id)
    if n is None or n.user_id != user.id:
        raise not_found("This notification doesn't exist.")
    if n.read_at is None:
        n.read_at = utcnow()


def mark_all_read(db: Session, user: User) -> None:
    """Marks every unread notification of `user`'s read (the caller commits)."""
    db.execute(
        update(Notification)
        .where(Notification.user_id == user.id, Notification.read_at.is_(None))
        .values(read_at=utcnow())
    )
