"""The signed-in user's notifications. Owner: accounts agent (creating them: app/services/notify.py)."""

from __future__ import annotations

from uuid import UUID

from fastapi import Response, status

from app.core.pagination import Limit, Offset
from app.core.security import DB, CurrentUser
from app.routers._base import router_for
from app.schemas.notifications import NotificationPage

router = router_for("notifications")


@router.get("/notifications", response_model=NotificationPage)
def list_notifications(
    user: CurrentUser, db: DB, unread: bool = False, limit: Limit = 20, offset: Offset = 0
) -> NotificationPage:
    """Newest first, with the unread count."""
    raise NotImplementedError


@router.post("/notifications/{notification_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_read(notification_id: UUID, user: CurrentUser, db: DB) -> Response:
    raise NotImplementedError


@router.post("/notifications/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_read(user: CurrentUser, db: DB) -> Response:
    raise NotImplementedError
