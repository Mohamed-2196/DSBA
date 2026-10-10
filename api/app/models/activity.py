"""Per-user activity: notifications and lesson progress. Moderation: reports and the audit log."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import BigInteger, ForeignKey, Index, SmallInteger, String, Text, text
from sqlalchemy.dialects.postgresql import INET
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_ts, str_enum, uuid_pk


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_user_created", "user_id", "created_at"),
        Index("ix_notifications_user_unread", "user_id", postgresql_where=text("read_at IS NULL")),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    kind: Mapped[str] = mapped_column(String(40))  # see app/schemas/notifications.py NotificationKind
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str | None] = mapped_column(Text)
    url: Mapped[str | None] = mapped_column(String(300))  # a path inside the web app, e.g. /forum/<slug>
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    data: Mapped[dict[str, Any]] = mapped_column(default=dict, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = created_ts()
    read_at: Mapped[datetime | None]


class LessonView(Base):
    """A lesson (one video of a chapter) a student marked as watched. lesson_key = '<module>:<chapter>:<video>'."""

    __tablename__ = "lesson_views"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    lesson_key: Mapped[str] = mapped_column(String(96), primary_key=True)
    module_id: Mapped[str] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"))
    watched_at: Mapped[datetime] = created_ts()


class LessonResume(Base):
    """The lesson a student opened last in a module ("pick up where you left off")."""

    __tablename__ = "lesson_resume"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    module_id: Mapped[str] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"), primary_key=True)
    chapter: Mapped[int] = mapped_column(SmallInteger)
    video: Mapped[int] = mapped_column(SmallInteger)
    opened_at: Mapped[datetime] = created_ts()


class ReportStatus(enum.StrEnum):
    open = "open"
    resolved = "resolved"  # a moderator acted on it
    dismissed = "dismissed"


class Report(Base):
    __tablename__ = "reports"
    __table_args__ = (
        Index("ix_reports_status_created", "status", "created_at"),
        Index(
            "uq_reports_open_per_reporter",
            "reporter_id",
            "target_type",
            "target_id",
            unique=True,
            postgresql_where=text("status = 'open'"),
        ),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    reporter_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    target_type: Mapped[str] = mapped_column(String(20))  # thread | reply | library_item
    target_id: Mapped[uuid.UUID]
    reason: Mapped[str] = mapped_column(String(20))  # spam | harassment | inappropriate | copyright | other
    note: Mapped[str | None] = mapped_column(Text)
    status: Mapped[ReportStatus] = mapped_column(str_enum(ReportStatus, 10), default=ReportStatus.open)
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    resolved_at: Mapped[datetime | None]
    resolution_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_ts()


class AuditEntry(Base):
    """Who did what, for actions that change other people's things (moderation, roles, content edits)."""

    __tablename__ = "audit_log"
    __table_args__ = (Index("ix_audit_log_created", "created_at"),)

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(64))  # 'library.publish', 'user.role', 'forum.hide', ...
    target_type: Mapped[str | None] = mapped_column(String(32))
    target_id: Mapped[str | None] = mapped_column(String(64))
    data: Mapped[dict[str, Any]] = mapped_column(default=dict, server_default=text("'{}'::jsonb"))
    ip: Mapped[str | None] = mapped_column(INET)
    created_at: Mapped[datetime] = created_ts()
