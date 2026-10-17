"""Bug reports: anyone, guests included, tells the admins what went wrong on a page of the hub."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import INET
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_ts, str_enum, uuid_pk


class BugStatus(enum.StrEnum):
    open = "open"
    fixed = "fixed"
    wont_fix = "wont_fix"


class BugReport(Base):
    """What happened, what the person expected, and where: the page, the app's version and the browser. A
    signed-in reporter may attach a screenshot (an upload with `bug_report_id`); their reports go with their
    account. `ip` counts a guest's reports for the rate limit; the daily sweep clears it once it no longer counts."""

    __tablename__ = "bug_reports"
    __table_args__ = (
        Index("ix_bug_reports_status_created", "status", "created_at"),  # Manage's queue
        Index("ix_bug_reports_user_created", "user_id", "created_at"),  # the per-person limit, account deletion
        Index("ix_bug_reports_resolved_by", "resolved_by"),  # account deletion (SET NULL)
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))  # None: a guest
    ip: Mapped[str | None] = mapped_column(INET)
    what_happened: Mapped[str] = mapped_column(Text)
    expected: Mapped[str] = mapped_column(Text, default="", server_default="")
    page_url: Mapped[str] = mapped_column(String(500))  # a path inside the web app: '/library/abc?x=1'
    app_version: Mapped[str] = mapped_column(String(40))
    browser: Mapped[str] = mapped_column(String(300), default="", server_default="")
    status: Mapped[BugStatus] = mapped_column(
        str_enum(BugStatus, 10), default=BugStatus.open, server_default=BugStatus.open.value
    )
    created_at: Mapped[datetime] = created_ts()
    resolved_at: Mapped[datetime | None]
    resolved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
