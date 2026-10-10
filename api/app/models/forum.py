"""The forum: threads, one level of replies, upvotes, accepted answers."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import ARRAY, Boolean, Computed, ForeignKey, Index, Integer, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import SLUG, Base, created_ts, str_enum, uuid_pk


class PostStatus(enum.StrEnum):
    visible = "visible"
    hidden = "hidden"  # by a moderator: kept for the record, shown to moderators only
    deleted = "deleted"  # by its author: the thread keeps its place, the text is gone


class ForumThread(Base):
    __tablename__ = "forum_threads"
    __table_args__ = (
        Index("ix_forum_threads_status_activity", "status", "last_activity_at"),
        Index("ix_forum_threads_category", "category"),
        Index("ix_forum_threads_module", "module_id"),
        Index("ix_forum_threads_author", "author_id"),
        Index("ix_forum_threads_search", "search_vector", postgresql_using="gin"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    slug: Mapped[str] = mapped_column(SLUG, unique=True)
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(Text)  # markdown (the client's renderer: no raw HTML)
    category: Mapped[str] = mapped_column(String(32))  # year-1 | year-2 | year-3 | study-groups | general
    module_id: Mapped[str | None] = mapped_column(ForeignKey("modules.id", ondelete="SET NULL"))
    tags: Mapped[list[str]] = mapped_column(ARRAY(String(32)), default=list, server_default="{}")
    author_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    author_year: Mapped[int | None] = mapped_column(SmallInteger)  # the author's cohort when they posted
    pinned: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    locked: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    status: Mapped[PostStatus] = mapped_column(str_enum(PostStatus, 10), default=PostStatus.visible)
    accepted_reply_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("forum_replies.id", ondelete="SET NULL", use_alter=True)
    )
    vote_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    reply_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")  # visible replies
    created_at: Mapped[datetime] = created_ts()
    edited_at: Mapped[datetime | None]
    last_activity_at: Mapped[datetime] = created_ts()
    search_vector: Mapped[str] = mapped_column(
        TSVECTOR,
        Computed(
            "setweight(to_tsvector('simple', coalesce(title, '')), 'A') || "
            "setweight(to_tsvector('simple', coalesce(body, '')), 'B')",
            persisted=True,
        ),
    )


class ForumReply(Base):
    __tablename__ = "forum_replies"
    __table_args__ = (
        Index("ix_forum_replies_thread_created", "thread_id", "created_at"),
        Index("ix_forum_replies_author", "author_id"),
        Index("ix_forum_replies_search", "search_vector", postgresql_using="gin"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    thread_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("forum_threads.id", ondelete="CASCADE"))
    parent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("forum_replies.id", ondelete="CASCADE"))
    author_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    author_year: Mapped[int | None] = mapped_column(SmallInteger)
    body: Mapped[str] = mapped_column(Text)
    status: Mapped[PostStatus] = mapped_column(str_enum(PostStatus, 10), default=PostStatus.visible)
    vote_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    created_at: Mapped[datetime] = created_ts()
    edited_at: Mapped[datetime | None]
    search_vector: Mapped[str] = mapped_column(
        TSVECTOR, Computed("to_tsvector('simple', coalesce(body, ''))", persisted=True)
    )


class ThreadVote(Base):
    __tablename__ = "forum_thread_votes"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    thread_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("forum_threads.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = created_ts()


class ReplyVote(Base):
    __tablename__ = "forum_reply_votes"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    reply_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("forum_replies.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = created_ts()
