"""Per-user activity: notifications and lesson progress. Moderation: reports and the audit log."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Any, get_args

from sqlalchemy import BigInteger, ForeignKey, Index, SmallInteger, String, Text, text
from sqlalchemy.dialects.postgresql import INET
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, check_in, created_ts, str_enum, uuid_pk
from app.schemas.moderation import ReportReason, ReportTarget
from app.schemas.notifications import NotificationKind

NOTIFICATION_KINDS: tuple[str, ...] = get_args(NotificationKind)


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (
        Index("ix_notifications_user_created", "user_id", "created_at"),
        Index("ix_notifications_user_unread", "user_id", postgresql_where=text("read_at IS NULL")),
        Index("ix_notifications_actor", "actor_id"),  # account deletion (SET NULL)
        # only the kinds the contract lists (code quality review CQ-10: notify() takes nothing else)
        check_in("kind", NOTIFICATION_KINDS),
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
        Index("ix_reports_target", "target_type", "target_id"),  # the reports about a post or a file
        Index("ix_reports_resolved_by", "resolved_by"),  # account deletion (SET NULL)
        Index(
            "uq_reports_open_per_reporter",
            "reporter_id",
            "target_type",
            "target_id",
            unique=True,
            postgresql_where=text("status = 'open'"),
        ),
        Index("ix_reports_reporter_created", "reporter_id", "created_at"),  # reports per hour, export, deletion
        # only what the contract lists (code quality review CQ-15)
        check_in("target_type", get_args(ReportTarget)),
        check_in("reason", get_args(ReportReason)),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    reporter_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    target_type: Mapped[str] = mapped_column(String(20))  # app/schemas/moderation.py ReportTarget
    target_id: Mapped[uuid.UUID]
    reason: Mapped[str] = mapped_column(String(20))  # app/schemas/moderation.py ReportReason
    note: Mapped[str | None] = mapped_column(Text)
    status: Mapped[ReportStatus] = mapped_column(
        str_enum(ReportStatus, 10), default=ReportStatus.open, server_default=ReportStatus.open.value
    )
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    resolved_at: Mapped[datetime | None]
    resolution_note: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = created_ts()


class AuditEntry(Base):
    """Who did what, for actions that change other people's things (moderation, roles, content edits)."""

    __tablename__ = "audit_log"
    __table_args__ = (
        Index("ix_audit_log_created", "created_at"),
        Index("ix_audit_log_actor", "actor_id"),  # account deletion (SET NULL)
    )

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True, autoincrement=True)
    actor_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    action: Mapped[str] = mapped_column(String(64))  # 'library.publish', 'user.roles', 'forum.hide', ...
    target_type: Mapped[str | None] = mapped_column(String(32))
    target_id: Mapped[str | None] = mapped_column(String(64))
    data: Mapped[dict[str, Any]] = mapped_column(default=dict, server_default=text("'{}'::jsonb"))
    ip: Mapped[str | None] = mapped_column(INET)
    created_at: Mapped[datetime] = created_ts()
