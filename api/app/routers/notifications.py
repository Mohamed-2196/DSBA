"""The signed-in user's notifications (app/services/notifications.py; creating them: app/services/notify.py)."""

from __future__ import annotations

from uuid import UUID

from fastapi import Response, status

from app.core.pagination import Limit, Offset
from app.core.security import DB, CurrentUser
from app.routers._base import router_for
from app.schemas.notifications import NotificationPage
from app.services import notifications as svc

router = router_for("notifications")


@router.get("/notifications", response_model=NotificationPage)
def list_notifications(
    user: CurrentUser, db: DB, unread: bool = False, limit: Limit = 20, offset: Offset = 0
) -> NotificationPage:
    """Newest first, with the unread count."""
    return svc.list_page(db, user, unread=unread, limit=limit, offset=offset)


@router.post("/notifications/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(notification_id: UUID, user: CurrentUser, db: DB) -> Response:
    svc.mark_read(db, user, notification_id)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/notifications/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_read(user: CurrentUser, db: DB) -> Response:
    svc.mark_all_read(db, user)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
