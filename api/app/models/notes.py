"""A student's private notes (R-5): Markdown, optionally about a module or one of its lessons."""

from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import CheckConstraint, ForeignKey, Index, Integer, SmallInteger, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, created_ts, uuid_pk


class Note(Base):
    __tablename__ = "notes"
    __table_args__ = (
        Index("ix_notes_user_updated", "user_id", "updated_at"),  # the Notes page: newest first
        Index("ix_notes_user_module", "user_id", "module_id", "chapter", "video"),  # a module's or a lesson's notes
        Index("ix_notes_module", "module_id"),  # a module deleted (SET NULL)
        # a lesson is a chapter and a video, both or neither
        CheckConstraint("(chapter IS NULL) = (video IS NULL)", name="lesson_pair"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200), default="", server_default="")
    body: Mapped[str] = mapped_column(Text, default="", server_default="")
    # The module the note is about. Its lesson, when it's about one: chapter and video, as in a lesson key.
    module_id: Mapped[str | None] = mapped_column(ForeignKey("modules.id", ondelete="SET NULL"))
    chapter: Mapped[int | None] = mapped_column(SmallInteger)
    video: Mapped[int | None] = mapped_column(SmallInteger)
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")  # one more on every save
    # Saves in the current minute, for the rate limit on saving (services/notes.py).
    saves_since: Mapped[datetime] = created_ts()
    saves: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = created_ts()
    updated_at: Mapped[datetime] = created_ts()
