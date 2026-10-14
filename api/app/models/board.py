"""Each student's private study board (R-4): cards in three fixed columns, and revision plans that add cards."""

from __future__ import annotations

import datetime as dt
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, get_args

from sqlalchemy import (
    CheckConstraint,
    Date,
    Double,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, check_in, created_ts, uuid_pk
from app.schemas.board import BoardColumn, BoardLinkType

if TYPE_CHECKING:
    from app.models.content import Module


class BoardPlan(Base):
    """A revision plan for one module, up to its exam: its cards (`BoardCard.plan_id`) are spread over the days
    left whenever the board is read, so falling behind spreads the rest again."""

    __tablename__ = "board_plans"
    __table_args__ = (
        UniqueConstraint("user_id", "module_id", name="uq_board_plans_user_module"),
        Index("ix_board_plans_module", "module_id"),  # removing a module (CASCADE)
        CheckConstraint("paper_every BETWEEN 1 AND 14", name="paper_every_range"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    module_id: Mapped[str] = mapped_column(ForeignKey("modules.id", ondelete="CASCADE"))
    exam_date: Mapped[dt.date] = mapped_column(Date)
    paper_every: Mapped[int] = mapped_column(SmallInteger)  # a past paper every this many days
    created_at: Mapped[datetime] = created_ts()
    updated_at: Mapped[datetime] = created_ts()

    module: Mapped[Module] = relationship(lazy="joined")


class BoardCard(Base):
    """One card. Its place in a column is `position`, a number between its neighbours', so a move is one write.
    A card may point at one thing in the hub: a calendar event, a lesson, a module or a library item, and holds that
    thing at most once per board. A lesson is `lesson_id` (a real reference: a lesson with cards can't be removed);
    the others are `link_id`. A card a revision plan added has `plan_id`."""

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
        Index(
            "uq_board_cards_user_lesson",
            "user_id",
            "lesson_id",
            unique=True,
            postgresql_where=text("lesson_id IS NOT NULL"),
        ),
        Index("ix_board_cards_lesson", "lesson_id"),  # removing a lesson (RESTRICT)
        Index("ix_board_cards_plan", "plan_id"),  # removing a plan (SET NULL)
        CheckConstraint(
            "CASE WHEN link_type = 'lesson' THEN lesson_id IS NOT NULL AND link_id IS NULL ELSE lesson_id IS NULL END",
            name="lesson_link",
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
    lesson_id: Mapped[str | None] = mapped_column(ForeignKey("lessons.id", ondelete="RESTRICT"))
    plan_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("board_plans.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = created_ts()
    updated_at: Mapped[datetime] = created_ts()
    done_at: Mapped[datetime | None]
