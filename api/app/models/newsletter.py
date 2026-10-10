"""The DSBA Newsletter: issues (sections are JSON blocks, rendered by the web app) and reactions."""

from __future__ import annotations

import datetime as dt
import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Computed, Date, ForeignKey, Index, Integer, String, Text, func
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import SLUG, Base, created_ts, str_enum, uuid_pk


class IssueStatus(enum.StrEnum):
    draft = "draft"
    published = "published"


class NewsletterIssue(Base):
    __tablename__ = "newsletter_issues"
    __table_args__ = (Index("ix_newsletter_issues_search", "search_vector", postgresql_using="gin"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    slug: Mapped[str] = mapped_column(SLUG, unique=True)
    number: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(160))
    date: Mapped[dt.date] = mapped_column(Date)
    cover: Mapped[dict[str, Any]] = mapped_column(default=dict)
    dek: Mapped[str] = mapped_column(Text, default="")
    summary: Mapped[str] = mapped_column(Text, default="")
    editors: Mapped[list[Any]] = mapped_column(default=list)  # names as printed in the issue
    sections: Mapped[list[Any]] = mapped_column(default=list)
    status: Mapped[IssueStatus] = mapped_column(str_enum(IssueStatus, 10), default=IssueStatus.draft)
    published_at: Mapped[datetime | None]
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = created_ts()
    updated_at: Mapped[datetime | None] = mapped_column(onupdate=func.now())
    search_vector: Mapped[str] = mapped_column(
        TSVECTOR,
        Computed(
            "setweight(to_tsvector('simple', coalesce(title, '')), 'A') || "
            "setweight(to_tsvector('simple', coalesce(dek, '') || ' ' || coalesce(summary, '')), 'B') || "
            "setweight(jsonb_to_tsvector('simple', sections, '[\"string\"]'), 'C')",
            persisted=True,
        ),
    )


class NewsletterReaction(Base):
    __tablename__ = "newsletter_reactions"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    issue_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("newsletter_issues.id", ondelete="CASCADE"), primary_key=True
    )
    section_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    reaction: Mapped[str] = mapped_column(String(16), primary_key=True)  # useful | love | laugh
    created_at: Mapped[datetime] = created_ts()
