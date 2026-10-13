"""A student's private notes (R-5): Markdown, optionally about a module or one of its lessons."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_ts, uuid_pk


class Note(Base):
    __tablename__ = "notes"
    __table_args__ = (
        Index("ix_notes_user_updated", "user_id", "updated_at"),  # the Notes page: newest first
        Index("ix_notes_user_module", "user_id", "module_id", "lesson_id"),  # a module's or a lesson's notes
        Index("ix_notes_module", "module_id"),  # a module deleted (SET NULL)
        Index("ix_notes_lesson", "lesson_id"),  # removing a lesson (RESTRICT)
        # a lesson's note is about its module too
        CheckConstraint("lesson_id IS NULL OR module_id IS NOT NULL", name="lesson_module"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200), default="", server_default="")
    body: Mapped[str] = mapped_column(Text, default="", server_default="")
    # The module the note is about, and its lesson when it's about one. A lesson with notes can't be removed.
    module_id: Mapped[str | None] = mapped_column(ForeignKey("modules.id", ondelete="SET NULL"))
    lesson_id: Mapped[str | None] = mapped_column(ForeignKey("lessons.id", ondelete="RESTRICT"))
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")  # one more on every save
    # Saves in the current minute, for the rate limit on saving (services/notes.py).
    saves_since: Mapped[datetime] = created_ts()
    saves: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = created_ts()
    updated_at: Mapped[datetime] = created_ts()
