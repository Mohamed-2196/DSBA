"""Reference content: the module catalogue (with its lessons), the academic calendar and editable documents."""

from __future__ import annotations

import datetime as dt
import enum
import uuid
from datetime import datetime
from typing import Any, get_args

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, check_in, created_ts, str_enum, uuid_pk, year_range
from app.schemas.calendar import EventType


class Module(Base):
    """A module of the programme. Content managers edit it in the app; app/seed/data/modules.json is only the
    starting content. Its lessons are rows of `lessons`, grouped in `chapters`, each with an id of its own that never
    changes: progress, notes and study-board cards point at lessons by id, so editors reorder freely. `version` grows
    with every save: a stale one gets 409."""

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
    position: Mapped[int] = mapped_column(Integer, default=0)
    hidden: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")  # left out of students' views
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    updated_at: Mapped[datetime | None] = mapped_column(onupdate=func.now())

    chapters: Mapped[list[Chapter]] = relationship(
        back_populates="module", order_by="Chapter.position", cascade="all, delete-orphan", lazy="selectin"
    )


class Chapter(Base):
    """A chapter of a module: its lessons in order. Hidden ones (and their lessons) are left out of students'
    views."""

    __tablename__ = "chapters"
    __table_args__ = (Index("ix_chapters_module_position", "module_id", "position"),)

    id: Mapped[str] = mapped_column(String(16), primary_key=True)  # app/services/modules.py new_id()
    module_id: Mapped[str] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer, default=0)
    title: Mapped[str] = mapped_column(String(160))
    audio_url: Mapped[str | None] = mapped_column(String(500))
    hidden: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    module: Mapped[Module] = relationship(back_populates="chapters")
    lessons: Mapped[list[Lesson]] = relationship(
        back_populates="chapter", order_by="Lesson.position", cascade="all, delete-orphan", lazy="selectin"
    )


class Lesson(Base):
    """One video of a chapter: a YouTube video or playlist (`video_id`), or a class recording (`url`). Its `id` is
    its address (/modules/<module>/lessons/<id>) for good. Watched lessons and resume points go with it; a lesson with
    students' notes or study-board cards can't be removed, only hidden."""

    __tablename__ = "lessons"
    __table_args__ = (
        Index("ix_lessons_chapter_position", "chapter_id", "position"),
        Index("ix_lessons_module", "module_id"),
        check_in("kind", ("youtube", "youtube-playlist", "bbb")),
    )

    id: Mapped[str] = mapped_column(String(16), primary_key=True)  # app/services/modules.py new_id()
    module_id: Mapped[str] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"))
    chapter_id: Mapped[str] = mapped_column(ForeignKey("chapters.id", ondelete="CASCADE"))
    position: Mapped[int] = mapped_column(Integer, default=0)
    kind: Mapped[str] = mapped_column(String(20))
    video_id: Mapped[str | None] = mapped_column(String(64))  # the YouTube video or playlist id
    url: Mapped[str | None] = mapped_column(String(500))  # a class recording on vc.bibf.com
    title: Mapped[str | None] = mapped_column(String(200))
    channel: Mapped[str | None] = mapped_column(String(120))  # the YouTube channel
    unavailable: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")  # removed from YouTube
    hidden: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")

    chapter: Mapped[Chapter] = relationship(back_populates="lessons")


class SuggestionStatus(enum.StrEnum):
    pending = "pending"
    accepted = "accepted"
    declined = "declined"


class VideoSuggestion(Base):
    """A video a student suggests for a module's chapter. It waits in Manage → Suggested videos until a
    content manager accepts it (it becomes a lesson: `lesson_id`) or declines it with a reason. `chapter_id` is None
    when the student left the chapter to the editor (a module with no chapters yet)."""

    __tablename__ = "video_suggestions"
    __table_args__ = (
        Index("ix_video_suggestions_author_created", "author_id", "created_at"),  # the daily limit, export, deletion
        Index("ix_video_suggestions_module", "module_id"),
        Index("ix_video_suggestions_chapter", "chapter_id"),  # chapter deletion (SET NULL)
        Index("ix_video_suggestions_lesson", "lesson_id"),  # lesson deletion (SET NULL)
        Index("ix_video_suggestions_decided_by", "decided_by"),  # account deletion (SET NULL)
        Index("ix_video_suggestions_queue", "created_at", postgresql_where=text("status = 'pending'")),
        check_in("kind", ("youtube", "youtube-playlist", "bbb")),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    author_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    module_id: Mapped[str] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"))
    chapter_id: Mapped[str | None] = mapped_column(ForeignKey("chapters.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(20))  # as Lesson.kind
    video_id: Mapped[str | None] = mapped_column(String(64))
    url: Mapped[str | None] = mapped_column(String(500))
    title: Mapped[str] = mapped_column(String(200))
    reason: Mapped[str] = mapped_column(Text, default="", server_default="")  # the student's line on why
    status: Mapped[SuggestionStatus] = mapped_column(
        str_enum(SuggestionStatus, 10), default=SuggestionStatus.pending, server_default=SuggestionStatus.pending.value
    )
    reply: Mapped[str | None] = mapped_column(Text)  # why it was declined
    lesson_id: Mapped[str | None] = mapped_column(ForeignKey("lessons.id", ondelete="SET NULL"))
    decided_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    decided_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = created_ts()


class CalendarEvent(Base):
    __tablename__ = "calendar_events"
    __table_args__ = (
        Index("ix_calendar_events_date", "date"),
        Index("ix_calendar_events_created_by", "created_by"),  # account deletion (SET NULL)
        year_range(),
        CheckConstraint("end_date IS NULL OR end_date >= date", name="end_after_start"),
        check_in("type", get_args(EventType)),
    )

    id: Mapped[str] = mapped_column(String(120), primary_key=True)  # '2025-04-30-economics-exam'
    date: Mapped[dt.date] = mapped_column(Date)
    end_date: Mapped[dt.date | None] = mapped_column(Date)
    time: Mapped[str | None] = mapped_column(String(40))  # free text, as the organiser published it
    place: Mapped[str | None] = mapped_column(String(120))
    title: Mapped[str] = mapped_column(String(160))
    type: Mapped[str] = mapped_column(String(16))  # app/schemas/calendar.py EventType
    year: Mapped[int | None] = mapped_column(SmallInteger)  # None = everyone
    module_id: Mapped[str | None] = mapped_column(ForeignKey("modules.id", ondelete="SET NULL"))
    unit_code: Mapped[str | None] = mapped_column(String(16))
    duration: Mapped[str | None] = mapped_column(String(40))  # an exam's length, as published: '3 hours'
    rules: Mapped[str | None] = mapped_column(String(300))  # what to bring, calculators, ...
    source: Mapped[str | None] = mapped_column(String(300))  # where the date comes from: a name or a link
    checked_on: Mapped[dt.date | None] = mapped_column(Date)  # when someone last checked it against the source
    employer_id: Mapped[str | None] = mapped_column(String(64))  # a careers date: the Career Navigator employer
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
