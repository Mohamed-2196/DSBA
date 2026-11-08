"""Web push: the browsers that asked for notifications, and the pushes waiting to go to them (app/services/push.py).

A subscription belongs to the signed-in session that made it: when that session ends (signed out, signed out from
another device, expired), its browser gets nothing more, and the row goes with the session. Pushes wait in
push_outbox, one row per browser, and the mail worker sends them as it sends emails."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import ForeignKey, Index, SmallInteger, String, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_ts, str_enum, uuid_pk
from app.models.outbox import OutboxStatus

ENDPOINT_MAX = 1000  # Chrome's and Apple's are about 200 characters, Windows' about 400


class PushSubscription(Base):
    """One browser on one device that asked for notifications: where its push service takes messages for it
    (`endpoint`) and the keys they are encrypted for (RFC 8291)."""

    __tablename__ = "push_subscriptions"
    __table_args__ = (
        Index("ix_push_subscriptions_user", "user_id"),
        Index("ix_push_subscriptions_session", "session_id"),  # the session's end (CASCADE)
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    session_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user_sessions.id", ondelete="CASCADE"))
    endpoint: Mapped[str] = mapped_column(String(ENDPOINT_MAX), unique=True)  # a browser has one per site
    p256dh: Mapped[str] = mapped_column(String(100))  # the browser's public key, base64url
    auth: Mapped[str] = mapped_column(String(40))  # its auth secret, base64url
    created_at: Mapped[datetime] = created_ts()
    last_success_at: Mapped[datetime | None]  # the last push its push service took


class PushOutbox(Base):
    """A push waiting to go to one browser, drained by the mail worker with retries (as EmailOutbox)."""

    __tablename__ = "push_outbox"
    __table_args__ = (
        Index("ix_push_outbox_due", "next_attempt_at", postgresql_where=text("status = 'pending'")),
        Index("ix_push_outbox_user", "user_id"),
        Index("ix_push_outbox_subscription", "subscription_id"),
        Index("ix_push_outbox_notification", "notification_id"),
        Index("ix_push_outbox_created", "created_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    # SET NULL: a browser that went away leaves the rows that were for it, cancelled when their turn comes
    subscription_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("push_subscriptions.id", ondelete="SET NULL"))
    notification_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("notifications.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(40))  # the notification's kind
    payload: Mapped[dict[str, Any]] = mapped_column()  # what the service worker shows: title, body, url, tag
    status: Mapped[OutboxStatus] = mapped_column(str_enum(OutboxStatus, 10), default=OutboxStatus.pending)
    attempts: Mapped[int] = mapped_column(SmallInteger, default=0, server_default="0")
    next_attempt_at: Mapped[datetime] = created_ts()
    last_error: Mapped[str | None] = mapped_column(String(200))  # the push service's status, never the endpoint
    created_at: Mapped[datetime] = created_ts()
    sent_at: Mapped[datetime | None]
