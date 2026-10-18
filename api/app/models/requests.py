"""Requests from students, and who said "me too" to each."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import get_args

from sqlalchemy import Computed, ForeignKey, Index, Integer, SmallInteger, String, Text, text
from sqlalchemy.dialects.postgresql import TSVECTOR
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, check_in, created_ts, in_range, str_enum, uuid_pk
from app.schemas.library import EXAM_YEAR_MAX, EXAM_YEAR_MIN, ZONES, LibraryKind, Zone
from app.schemas.requests import RequestKind


class RequestStatus(enum.StrEnum):
    open = "open"
    planned = "planned"
    done = "done"
    declined = "declined"


class StudentRequest(Base):
    """Something a student asked the reps for. A removed request is gone for everyone (the audit log keeps its
    title).

    A request that names what it wants can close itself (app/services/requests.py): a paper request with a
    module and a library kind (and maybe an exam year and zone) is matched with a file when one is published, and a
    date request (`event_id`) closes when a rep confirms the date."""

    __tablename__ = "requests"
    __table_args__ = (
        Index("ix_requests_author_created", "author_id", "created_at"),  # requests per day, export, deletion
        Index("ix_requests_answered_by", "answered_by"),  # account deletion (SET NULL)
        Index("ix_requests_removed_by", "removed_by"),  # account deletion (SET NULL)
        Index("ix_requests_module", "module_id"),  # module deletion (SET NULL)
        Index("ix_requests_event", "event_id"),  # a confirmed date closes its requests; event deletion (SET NULL)
        Index("ix_requests_found_item", "found_item_id"),
        Index("ix_requests_queue", "me_too_count", "created_at", postgresql_where=text("removed_at IS NULL")),
        # "You asked, we did": the requests done lately, newest answer first (services/requests.py done)
        Index("ix_requests_done", "answered_at", postgresql_where=text("status = 'done' AND removed_at IS NULL")),
        Index("ix_requests_search", "search_vector", postgresql_using="gin"),
        check_in("kind", get_args(RequestKind)),
        check_in("wanted_kind", get_args(LibraryKind)),
        in_range("exam_year", EXAM_YEAR_MIN, EXAM_YEAR_MAX),
        check_in("zone", ZONES),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    author_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(16))  # app/schemas/requests.py RequestKind
    title: Mapped[str] = mapped_column(String(140))
    details: Mapped[str] = mapped_column(Text, default="", server_default="")
    module_id: Mapped[str | None] = mapped_column(ForeignKey("modules.id", ondelete="SET NULL"))
    # What a paper request wants, so a published file can match it.
    wanted_kind: Mapped[str | None] = mapped_column(String(32))  # app/schemas/library.py LibraryKind
    exam_year: Mapped[int | None] = mapped_column(SmallInteger)
    zone: Mapped[Zone | None] = mapped_column(String(8))
    # The unconfirmed date a date request asks about.
    event_id: Mapped[str | None] = mapped_column(ForeignKey("calendar_events.id", ondelete="SET NULL"))
    # A published file that may be what was asked for, until the requester or a rep says yes or no.
    found_item_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("library_items.id", ondelete="SET NULL"))
    found_at: Mapped[datetime | None]
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
