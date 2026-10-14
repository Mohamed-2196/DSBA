"""Emails waiting to go out (notifications and account notices), drained by `python -m app.cli mail-worker`.

A request only adds a row, so a slow or broken mail server never slows it down; the worker sends each row with
retries and backoff, and several workers can run side by side (each claims rows with FOR UPDATE SKIP LOCKED).
Sign-in codes are not queued: they are sent while the person waits for them."""

from __future__ import annotations

import datetime as dt
import enum
import uuid
from datetime import datetime

from sqlalchemy import Date, ForeignKey, Index, SmallInteger, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_ts, str_enum, uuid_pk


class OutboxStatus(enum.StrEnum):
    pending = "pending"  # waiting for its turn (next_attempt_at)
    sent = "sent"
    failed = "failed"  # gave up after the last retry
    cancelled = "cancelled"  # no longer wanted when its turn came (switch turned off, address changed)


class EmailOutbox(Base):
    __tablename__ = "email_outbox"
    __table_args__ = (
        # what the worker asks for: pending rows whose time has come, oldest first
        Index("ix_email_outbox_due", "next_attempt_at", postgresql_where=text("status = 'pending'")),
        Index("ix_email_outbox_user", "user_id"),
        Index("ix_email_outbox_notification", "notification_id"),  # a notification taken back cancels its email
        Index("ix_email_outbox_created", "created_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    # The account it is for (its pending emails go when the account is deleted). An account notice may go to an
    # address the account no longer has (the one just replaced or removed).
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    notification_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("notifications.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(40))  # a notification kind, or 'account_notice'
    to_address: Mapped[str] = mapped_column(String(254))
    subject: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(Text)  # plain text
    status: Mapped[OutboxStatus] = mapped_column(str_enum(OutboxStatus, 10), default=OutboxStatus.pending)
    attempts: Mapped[int] = mapped_column(SmallInteger, default=0, server_default="0")
    next_attempt_at: Mapped[datetime] = created_ts()
    last_error: Mapped[str | None] = mapped_column(String(200))  # the kind of failure, never an address
    created_at: Mapped[datetime] = created_ts()
    sent_at: Mapped[datetime | None]


class WeeklySummarySent(Base):
    """A Sunday summary queued for one person for one week: at most one per person per week, however often the job
    runs or however many workers run it."""

    __tablename__ = "weekly_summaries"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    week_of: Mapped[dt.date] = mapped_column(Date, primary_key=True)  # the week's Sunday, in Bahrain
    created_at: Mapped[datetime] = created_ts()
