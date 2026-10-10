"""Reference content: the module catalogue (with its lessons), the academic calendar and editable documents."""

from __future__ import annotations

import datetime as dt
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, CheckConstraint, Date, ForeignKey, Index, Integer, SmallInteger, String, Text, func
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_ts


class Module(Base):
    """A module of the programme. Lessons live in `chapters` (JSON): their order is what lesson keys refer to
    ('<module id>:<chapter index>:<video index>'), so chapters and videos are only ever appended or edited in place."""

    __tablename__ = "modules"
    __table_args__ = (CheckConstraint("year BETWEEN 1 AND 3", name="year_range"),)

    id: Mapped[str] = mapped_column(String(64), primary_key=True)  # 'advanced-stats-distribution'
    unit_code: Mapped[str | None] = mapped_column(String(16))  # 'ST2133'
    name: Mapped[str] = mapped_column(String(120))
    short_name: Mapped[str] = mapped_column(String(60))
    year: Mapped[int] = mapped_column(SmallInteger)
    description: Mapped[str] = mapped_column(Text, default="")
    icon: Mapped[str | None] = mapped_column(String(40))  # a Phosphor icon name
    resources: Mapped[dict[str, Any]] = mapped_column(default=dict)  # materials, exercises, vle, olderExams, ...
    chapters: Mapped[list[Any]] = mapped_column(
        default=list
    )  # [{title, audioUrl?, videos: [{kind, id?, url?, title?}]}]
    position: Mapped[int] = mapped_column(Integer, default=0)
    updated_at: Mapped[datetime | None] = mapped_column(onupdate=func.now())


class CalendarEvent(Base):
    __tablename__ = "calendar_events"
    __table_args__ = (
        Index("ix_calendar_events_date", "date"),
        CheckConstraint("year IS NULL OR year BETWEEN 1 AND 3", name="year_range"),
        CheckConstraint("end_date IS NULL OR end_date >= date", name="end_after_start"),
    )

    id: Mapped[str] = mapped_column(String(120), primary_key=True)  # '2025-04-30-economics-exam'
    date: Mapped[dt.date] = mapped_column(Date)
    end_date: Mapped[dt.date | None] = mapped_column(Date)
    time: Mapped[str | None] = mapped_column(String(40))  # free text, as the organiser published it
    place: Mapped[str | None] = mapped_column(String(120))
    title: Mapped[str] = mapped_column(String(160))
    type: Mapped[str] = mapped_column(String(16))  # exam | mock | revision | deadline | event | break | term
    year: Mapped[int | None] = mapped_column(SmallInteger)  # None = everyone
    module_id: Mapped[str | None] = mapped_column(ForeignKey("modules.id", ondelete="SET NULL"))
    unit_code: Mapped[str | None] = mapped_column(String(16))
    sample: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")  # a placeholder date
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = created_ts()
    updated_at: Mapped[datetime | None] = mapped_column(onupdate=func.now())


class ContentDoc(Base):
    """A JSON document edited as a whole by admins (the Career Navigator's employers, certificates, roles, ...)."""

    __tablename__ = "content_docs"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)  # 'career'
    data: Mapped[dict[str, Any]] = mapped_column(default=dict)
    updated_at: Mapped[datetime] = created_ts()
    updated_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
