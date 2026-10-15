"""A student's private notebook: notebooks (one per module by default), the notes in them, and each note's ink.

A note mixes typed rich text (`doc`, a ProseMirror document; `text` is its plain text for search), handwriting
(`NoteInk`, vector strokes per sheet), pictures and files (uploads with `note_id`), and optionally a PDF it is
written over: a library file (`library_item_id`) or one the student imported (`pdf_upload_id`)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, check_in, created_ts, uuid_pk

PAPERS = ("blank", "lined", "grid", "dotted")


class Notebook(Base):
    __tablename__ = "notebooks"
    __table_args__ = (
        Index("ix_notebooks_user_created", "user_id", "created_at"),
        # one notebook per module per student: a module's notes go to it
        Index(
            "ix_notebooks_user_module",
            "user_id",
            "module_id",
            unique=True,
            postgresql_where=text("module_id IS NOT NULL"),
        ),
        Index("ix_notebooks_module", "module_id"),  # a module deleted (SET NULL)
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(120))
    module_id: Mapped[str | None] = mapped_column(ForeignKey("modules.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = created_ts()
    updated_at: Mapped[datetime] = created_ts()


class Note(Base):
    __tablename__ = "notes"
    __table_args__ = (
        Index("ix_notes_user_updated", "user_id", "updated_at"),  # the student's notes: newest first
        Index("ix_notes_notebook_updated", "notebook_id", "updated_at"),  # a notebook's notes
        Index("ix_notes_user_lesson", "user_id", "lesson_id"),  # a lesson's notes
        Index("ix_notes_lesson", "lesson_id"),  # removing a lesson (RESTRICT)
        # one note per library file per student: "Annotate in my notebook" reopens it
        Index(
            "ix_notes_user_library_item",
            "user_id",
            "library_item_id",
            unique=True,
            postgresql_where=text("library_item_id IS NOT NULL"),
        ),
        Index("ix_notes_library_item", "library_item_id"),  # a library item deleted (SET NULL)
        Index("ix_notes_pdf_upload", "pdf_upload_id"),  # an upload deleted (SET NULL)
        check_in("paper", PAPERS),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    notebook_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("notebooks.id", ondelete="CASCADE"))
    title: Mapped[str] = mapped_column(String(200), default="", server_default="")
    doc: Mapped[dict[str, Any]] = mapped_column(default=dict, server_default=text("'{}'::jsonb"))
    text: Mapped[str] = mapped_column(Text, default="", server_default="")  # doc as plain text, for search
    paper: Mapped[str] = mapped_column(String(8), default="lined", server_default="lined")
    sheets: Mapped[int] = mapped_column(Integer, default=1, server_default="1")  # paper sheets after any PDF pages
    # The lesson the note is about (in the notebook's module). A lesson with notes can't be removed.
    lesson_id: Mapped[str | None] = mapped_column(ForeignKey("lessons.id", ondelete="RESTRICT"))
    library_item_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("library_items.id", ondelete="SET NULL"))
    pdf_upload_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("uploads.id", ondelete="SET NULL"))
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")  # one more on every text save
    # Saves in the current minute (text and ink), for the rate limit on saving (services/notes.py).
    saves_since: Mapped[datetime] = created_ts()
    saves: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = created_ts()
    updated_at: Mapped[datetime] = created_ts()


class NoteInk(Base):
    """The handwriting on one sheet of a note: strokes in the sheet's own units (schemas/notes.py SHEET_WIDTH)."""

    __tablename__ = "note_ink"

    note_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("notes.id", ondelete="CASCADE"), primary_key=True)
    # 0-999: the PDF's pages (0 its first); 1000 and up: the paper sheets after them (1000 the first)
    sheet: Mapped[int] = mapped_column(Integer, primary_key=True)
    strokes: Mapped[list[Any]] = mapped_column(default=list, server_default=text("'[]'::jsonb"))
    size_bytes: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    updated_at: Mapped[datetime] = created_ts()
