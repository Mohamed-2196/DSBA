"""The library: files (stored in S3: uploaded by students, or imported from the programme's Google Drive folders) and
links to resources kept elsewhere, plus stars; and the Drive folders the import reads, which nobody is sent to."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import get_args

from sqlalchemy import (
    BigInteger,
    CheckConstraint,
    Computed,
    ForeignKey,
    Index,
    Integer,
    SmallInteger,
    String,
    Text,
    func,
)
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import SLUG, Base, check_in, created_ts, str_enum, uuid_pk, year_range
from app.schemas.library import ZONES, ExamSession, LibraryKind


class ItemSource(enum.StrEnum):
    file = "file"
    link = "link"


class ItemStatus(enum.StrEnum):
    pending = "pending"  # uploaded by a student, waiting for a moderator
    published = "published"
    rejected = "rejected"
    removed = "removed"


class LibraryItem(Base):
    __tablename__ = "library_items"
    __table_args__ = (
        Index("ix_library_items_module", "module_id"),
        Index("ix_library_items_uploaded_by", "uploaded_by"),  # "Your uploads", account deletion
        Index("ix_library_items_reviewed_by", "reviewed_by"),  # account deletion (SET NULL)
        Index("ix_library_items_search", "search_vector", postgresql_using="gin"),
        Index("ix_library_items_content_hash", "content_hash"),  # the same file twice (services/library.py duplicate)
        Index("ix_library_items_drive_folder", "drive_folder_id"),  # a module's shelves; folder deletion
        check_in("kind", get_args(LibraryKind)),  # code quality review CQ-15
        check_in("exam_session", get_args(ExamSession)),
        check_in("zone", ZONES),
        year_range(),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    slug: Mapped[str] = mapped_column(SLUG, unique=True)
    source: Mapped[ItemSource] = mapped_column(str_enum(ItemSource, 8))
    kind: Mapped[LibraryKind] = mapped_column(String(32))
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    module_id: Mapped[str | None] = mapped_column(ForeignKey("modules.id", ondelete="SET NULL"))
    year: Mapped[int | None] = mapped_column(SmallInteger)
    url: Mapped[str | None] = mapped_column(Text)  # links only
    storage_key: Mapped[str | None] = mapped_column(Text)  # files only
    file_name: Mapped[str | None] = mapped_column(String(255))
    content_type: Mapped[str | None] = mapped_column(String(127))
    size_bytes: Mapped[int | None] = mapped_column(BigInteger)
    exam_year: Mapped[int | None] = mapped_column(SmallInteger)  # past papers and examiners' reports
    zone: Mapped[str | None] = mapped_column(String(8))  # schemas/library.py Zone
    exam_session: Mapped[str | None] = mapped_column(String(8))  # 'may' | 'october' (schemas/library.py ExamSession)
    author_name: Mapped[str | None] = mapped_column(String(120))  # credited author, as typed by the uploader
    # Where a file the server imported came from: 'drive/<module>/<Drive file id>' (python -m app.cli import-drive).
    # A rerun of the import skips it whatever became of the item since: edited, moved, removed, its file swept (the
    # sweep clears storage_key, so the key can't be what remembers). None for uploads and links.
    import_key: Mapped[str | None] = mapped_column(String(200), unique=True)
    drive_folder_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("drive_folders.id", ondelete="SET NULL"))
    # SHA-256 of the file's bytes, hex: set by the Drive import and the text worker. Of two published files with the
    # same bytes, the lists and search show the first only.
    content_hash: Mapped[str | None] = mapped_column(String(64))
    uploaded_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    status: Mapped[ItemStatus] = mapped_column(str_enum(ItemStatus, 12), default=ItemStatus.pending)
    review_note: Mapped[str | None] = mapped_column(Text)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    reviewed_at: Mapped[datetime | None]
    download_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = created_ts()
    updated_at: Mapped[datetime | None] = mapped_column(onupdate=func.now())
    published_at: Mapped[datetime | None]
    search_vector: Mapped[str] = mapped_column(
        TSVECTOR,
        Computed(
            "setweight(to_tsvector('simple', coalesce(title, '')), 'A') || "
            "setweight(to_tsvector('simple', coalesce(description, '')), 'B') || "
            "setweight(to_tsvector('simple', coalesce(author_name, '') || ' ' || coalesce(file_name, '')), 'C')",
            persisted=True,
        ),
    )


# The lists: a status (published, or a moderator's queue), newest first by coalesce(published_at, created_at)
# (services/library.py list_items). An index on the expression, so the sort is read from it (code quality review
# CQ-15).
Index(
    "ix_library_items_status_newest",
    LibraryItem.status,
    func.coalesce(LibraryItem.published_at, LibraryItem.created_at),
)


class DriveFolder(Base):
    """A Google Drive folder (or a single Drive or Docs file) that the Drive import copies into the library
    (services/drive_import.py): its files take its module, kind and author. Seeded from app/seed/data/modules.json.
    The Hub never shows or links to it: students get the files the import brought in, served from the bucket."""

    __tablename__ = "drive_folders"
    __table_args__ = (
        Index("ix_drive_folders_module_url", "module_id", "url", unique=True),
        check_in("kind", get_args(LibraryKind)),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    module_id: Mapped[str] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"))
    kind: Mapped[LibraryKind] = mapped_column(String(32))
    title: Mapped[str] = mapped_column(String(200))  # 'Course materials', "Mahdi's notes"
    url: Mapped[str] = mapped_column(Text)
    author_name: Mapped[str | None] = mapped_column(String(120))  # students' notes: who shared them
    created_at: Mapped[datetime] = created_ts()


class TextStatus(enum.StrEnum):
    working = "working"  # a text worker is reading the file
    done = "done"  # its text is in `body`
    empty = "empty"  # read, but it has no text (a scan): found by its title only
    failed = "failed"  # too big, too slow or unreadable


class LibraryText(Base):
    """The words of a published PDF or Word file, for search (app/services/paper_text.py), and its cover: the first
    page as a small WebP picture in the bucket. `body` holds its pages in order, separated by form feeds, so a match
    knows its page. A row is made when a text worker takes the file, and stays: a file is read once."""

    __tablename__ = "library_texts"
    __table_args__ = (Index("ix_library_texts_search", "search_vector", postgresql_using="gin"),)

    item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("library_items.id", ondelete="CASCADE"), primary_key=True)
    status: Mapped[TextStatus] = mapped_column(str_enum(TextStatus, 8))
    body: Mapped[str | None] = mapped_column(Text)
    pages: Mapped[int | None] = mapped_column(Integer)  # PDFs only
    error: Mapped[str | None] = mapped_column(String(200))  # why it failed, for the logs and the CLI
    cover_key: Mapped[str | None] = mapped_column(Text)  # covers/<item id>.webp; None: no cover could be made
    started_at: Mapped[datetime] = created_ts()
    finished_at: Mapped[datetime | None]
    search_vector: Mapped[str] = mapped_column(
        TSVECTOR, Computed("to_tsvector('simple', coalesce(body, ''))", persisted=True)
    )


class LibraryStar(Base):
    __tablename__ = "library_stars"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("library_items.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = created_ts()


class PaperQuestion(Base):
    """A question of a past paper, tagged by a student with one of its module's chapters ("Q3: Elasticity"), so
    the chapter lists it. `tagged_by` is kept for moderation only; any student may flag a wrong tag, and people who
    manage the library remove it."""

    __tablename__ = "paper_questions"
    __table_args__ = (
        Index("ix_paper_questions_item_question_chapter", "item_id", "question", "chapter_id", unique=True),
        Index("ix_paper_questions_chapter", "chapter_id"),
        Index("ix_paper_questions_tagged_by", "tagged_by"),  # tags per hour, export, account deletion (SET NULL)
        CheckConstraint("question BETWEEN 1 AND 40", name="question_range"),
        CheckConstraint("page IS NULL OR page BETWEEN 1 AND 999", name="page_range"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("library_items.id", ondelete="CASCADE"))
    chapter_id: Mapped[str] = mapped_column(ForeignKey("chapters.id", ondelete="CASCADE"))
    question: Mapped[int] = mapped_column(SmallInteger)
    page: Mapped[int | None] = mapped_column(SmallInteger)  # where the question starts in the PDF
    tagged_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    flag_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = created_ts()


class PaperQuestionFlag(Base):
    """A student who says a tag is wrong."""

    __tablename__ = "paper_question_flags"
    __table_args__ = (Index("ix_paper_question_flags_user", "user_id"),)  # export, account deletion (CASCADE)

    question_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("paper_questions.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = created_ts()


class UploadPurpose(enum.StrEnum):
    library = "library"
    forum_image = "forum_image"


class UploadStatus(enum.StrEnum):
    pending = "pending"  # a presigned upload was handed out; the object may not exist yet
    uploaded = "uploaded"  # the object exists and matched what was declared
    attached = "attached"  # in use by a library item or a forum post


class Upload(Base):
    """An object a browser uploads straight to S3 with a presigned POST.

    A forum image belongs to the post that shows it, set when the post is saved: `thread_id` for a thread's body,
    `reply_id` for a reply's. /media serves it only while that post is visible (security review, finding 8).
    Uploads that are never attached to anything are swept after a day."""

    __tablename__ = "uploads"
    __table_args__ = (
        Index("ix_uploads_status_created", "status", "created_at"),
        Index("ix_uploads_user_created", "user_id", "created_at"),  # uploads per user per hour; account deletion
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    purpose: Mapped[UploadPurpose] = mapped_column(str_enum(UploadPurpose))
    storage_key: Mapped[str] = mapped_column(Text, unique=True)
    file_name: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(127))
    size_bytes: Mapped[int] = mapped_column(BigInteger)  # declared, then the real size once uploaded
    status: Mapped[UploadStatus] = mapped_column(str_enum(UploadStatus, 12), default=UploadStatus.pending)
    created_at: Mapped[datetime] = created_ts()
    completed_at: Mapped[datetime | None]
    thread_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("forum_threads.id", ondelete="SET NULL"))
    reply_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("forum_replies.id", ondelete="SET NULL"))
