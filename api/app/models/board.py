"""Each student's private study board (R-4): cards in three fixed columns."""

from __future__ import annotations

import datetime as dt
import uuid
from datetime import datetime
from typing import get_args

from sqlalchemy import Date, Double, ForeignKey, Index, String, Text, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, check_in, created_ts, uuid_pk
from app.schemas.board import BoardColumn, BoardLinkType


class BoardCard(Base):
    """One card. Its place in a column is `position`, a number between its neighbours', so a move is one write.
    A card may point at one thing in the hub: a calendar event, a lesson ('<module>:<chapter>:<video>'), a module or a
    library item, and holds that thing at most once per board."""

    __tablename__ = "board_cards"
    __table_args__ = (
        Index("ix_board_cards_user_lane_position", "user_id", "lane", "position"),
        Index(
            "uq_board_cards_user_link",
            "user_id",
            "link_type",
            "link_id",
            unique=True,
            postgresql_where=text("link_type IS NOT NULL"),
        ),
        check_in("lane", get_args(BoardColumn)),
        check_in("link_type", get_args(BoardLinkType)),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    column: Mapped[str] = mapped_column("lane", String(12))  # "column" is a reserved word in SQL
    position: Mapped[float] = mapped_column(Double)
    title: Mapped[str] = mapped_column(String(200))
    note: Mapped[str | None] = mapped_column(Text)
    due_date: Mapped[dt.date | None] = mapped_column(Date)
    link_type: Mapped[str | None] = mapped_column(String(16))
    link_id: Mapped[str | None] = mapped_column(String(96))
    created_at: Mapped[datetime] = created_ts()
    updated_at: Mapped[datetime] = created_ts()
    done_at: Mapped[datetime | None]
