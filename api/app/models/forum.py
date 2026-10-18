"""The forum: threads, one level of replies, upvotes, accepted answers and the people following a thread."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime

from sqlalchemy import ARRAY, Boolean, Computed, ForeignKey, Index, Integer, SmallInteger, String, Text
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import SLUG, Base, check_in, created_ts, str_enum, uuid_pk, year_range


class PostStatus(enum.StrEnum):
    visible = "visible"
    hidden = "hidden"  # by a moderator: kept for the record, shown to moderators only
    deleted = "deleted"  # by its author: the thread keeps its place, the text is gone


class ForumCategory(Base):
    """Where a thread lives (exactly one each). Moderators edit the list in Manage → Forum. A category threads use is
    retired rather than deleted: it stops being offered, and its threads keep it."""

    __tablename__ = "forum_categories"
    __table_args__ = (year_range(),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True)  # 'year-1': in links, never changed
    label: Mapped[str] = mapped_column(String(40))  # 'Year 1'
    short: Mapped[str] = mapped_column(String(20))  # on a thread's row: 'Study group'
    year: Mapped[int | None] = mapped_column(SmallInteger)  # its cohort; None: every year sees it
    blurb: Mapped[str] = mapped_column(String(120))  # under the label in the forum's sidebar
    icon: Mapped[str | None] = mapped_column(String(20))  # beside a category for every year: 'people'
    position: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    retired: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")


class ForumTag(Base):
    """A tag a thread may carry. Retired like a category when threads carry it."""

    __tablename__ = "forum_tags"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)  # 'exam-prep'
    label: Mapped[str] = mapped_column(String(40))
    position: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    retired: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")


class ForumThread(Base):
    __tablename__ = "forum_threads"
    __table_args__ = (
        Index("ix_forum_threads_category", "category"),
        Index("ix_forum_threads_module", "module_id"),
        Index("ix_forum_threads_author", "author_id"),
        Index("ix_forum_threads_search", "search_vector", postgresql_using="gin"),
        year_range("author_year"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    slug: Mapped[str] = mapped_column(SLUG, unique=True)
    title: Mapped[str] = mapped_column(String(160))
    body: Mapped[str] = mapped_column(Text)  # markdown (the client's renderer: no raw HTML)
    # A category in use can't be deleted: it is retired instead.
    category: Mapped[str] = mapped_column(ForeignKey("forum_categories.id", ondelete="RESTRICT"))
    module_id: Mapped[str | None] = mapped_column(ForeignKey("modules.id", ondelete="SET NULL"))
    tags: Mapped[list[str]] = mapped_column(ARRAY(String(32)), default=list, server_default="{}")
    author_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    author_year: Mapped[int | None] = mapped_column(SmallInteger)  # the author's cohort when they posted
    # Posted without the author's name: students see "A Year 1 student"; the author and moderators see who it is.
    anonymous: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
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
    # When its text was deleted (by its author or a rep). Set while it is hidden, unhiding it gives a deleted thread
    # (security review SEC-15); the row itself says so, not the audit log (code quality review CQ-14).
    deleted_at: Mapped[datetime | None]
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
        Index("ix_forum_replies_parent", "parent_id"),  # the replies to a reply (ON DELETE CASCADE)
        Index("ix_forum_replies_author", "author_id"),
        Index("ix_forum_replies_search", "search_vector", postgresql_using="gin"),
        year_range("author_year"),
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
    deleted_at: Mapped[datetime | None]  # as ForumThread.deleted_at
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


class FollowLevel(enum.StrEnum):
    answers = "answers"  # an accepted answer
    replies = "replies"  # every reply, and an accepted answer
    off = "off"  # switched off by hand: voting or replying again doesn't switch it back on


class ThreadFollow(Base):
    """Someone following a thread. Voting or replying starts one at `answers`, unless the person switched it off."""

    __tablename__ = "forum_follows"
    __table_args__ = (
        Index("ix_forum_follows_thread", "thread_id"),
        check_in("level", [level.value for level in FollowLevel]),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    thread_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("forum_threads.id", ondelete="CASCADE"), primary_key=True)
    level: Mapped[str] = mapped_column(String(10))
    created_at: Mapped[datetime] = created_ts()
