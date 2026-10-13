"""Requests from students, and who said "me too" to each."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import get_args

from sqlalchemy import Computed, ForeignKey, Index, Integer, String, Text, text
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, check_in, created_ts, str_enum, uuid_pk
from app.schemas.requests import RequestKind


class RequestStatus(enum.StrEnum):
    open = "open"
    planned = "planned"
    done = "done"
    declined = "declined"


class StudentRequest(Base):
    """Something a student asked the reps for. A removed request is gone for everyone (the audit log keeps its
    title)."""

    __tablename__ = "requests"
    __table_args__ = (
        Index("ix_requests_author_created", "author_id", "created_at"),  # requests per day, export, deletion
        Index("ix_requests_answered_by", "answered_by"),  # account deletion (SET NULL)
        Index("ix_requests_removed_by", "removed_by"),  # account deletion (SET NULL)
        Index("ix_requests_module", "module_id"),  # module deletion (SET NULL)
        Index("ix_requests_queue", "me_too_count", "created_at", postgresql_where=text("removed_at IS NULL")),
        Index("ix_requests_search", "search_vector", postgresql_using="gin"),
        check_in("kind", get_args(RequestKind)),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    author_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(16))  # app/schemas/requests.py RequestKind
    title: Mapped[str] = mapped_column(String(140))
    details: Mapped[str] = mapped_column(Text, default="", server_default="")
    module_id: Mapped[str | None] = mapped_column(ForeignKey("modules.id", ondelete="SET NULL"))
    status: Mapped[RequestStatus] = mapped_column(
        str_enum(RequestStatus, 10), default=RequestStatus.open, server_default=RequestStatus.open.value
    )
    me_too_count: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    reply: Mapped[str | None] = mapped_column(Text)  # the reps' public answer
    answered_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    answered_at: Mapped[datetime | None]
    removed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    removed_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = created_ts()
    search_vector: Mapped[str] = mapped_column(
        TSVECTOR,
        Computed(
            "setweight(to_tsvector('simple', coalesce(title, '')), 'A') || "
            "setweight(to_tsvector('simple', coalesce(details, '')), 'B')",
            persisted=True,
        ),
    )


class RequestMeToo(Base):
    """A student who wants the same thing."""

    __tablename__ = "request_me_toos"
    __table_args__ = (Index("ix_request_me_toos_user", "user_id"),)  # account deletion (CASCADE)

    request_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("requests.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    created_at: Mapped[datetime] = created_ts()
