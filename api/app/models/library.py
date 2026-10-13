"""The library: files (stored in S3: uploaded by students, or imported from the v1 Google Drive folders) and links
(the v1 Drive folders themselves), plus stars."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, Computed, ForeignKey, Index, Integer, SmallInteger, String, Text, func
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import SLUG, Base, created_ts, str_enum, uuid_pk


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
        Index("ix_library_items_status_published", "status", "published_at"),
        Index("ix_library_items_module", "module_id"),
        Index("ix_library_items_uploaded_by", "uploaded_by"),  # "Your uploads", account deletion
        Index("ix_library_items_reviewed_by", "reviewed_by"),  # account deletion (SET NULL)
        Index("ix_library_items_search", "search_vector", postgresql_using="gin"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    slug: Mapped[str] = mapped_column(SLUG, unique=True)
    source: Mapped[ItemSource] = mapped_column(str_enum(ItemSource, 8))
    kind: Mapped[str] = mapped_column(String(32))  # see app/schemas/library.py LibraryKind
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
    zone: Mapped[str | None] = mapped_column(String(8))  # 'A' | 'B'
    author_name: Mapped[str | None] = mapped_column(String(120))  # credited author, as typed by the uploader
    # Where a file the server imported came from: 'drive/<module>/<Drive file id>' (python -m app.cli import-drive).
    # A rerun of the import skips it whatever became of the item since: edited, moved, removed, its file swept (the
    # sweep clears storage_key, so the key can't be what remembers). None for uploads and links.
    import_key: Mapped[str | None] = mapped_column(String(200), unique=True)
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


class LibraryStar(Base):
    __tablename__ = "library_stars"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    item_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("library_items.id", ondelete="CASCADE"), primary_key=True)
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
