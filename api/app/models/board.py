"""Each student's private boards: columns of cards, labels, comments to self, revision plans that add study cards.
Files on cards are uploads (`Upload.card_id`)."""

from __future__ import annotations

import datetime as dt
import uuid
from datetime import datetime
from typing import TYPE_CHECKING, Any, get_args

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    Double,
    ForeignKey,
    Index,
    SmallInteger,
    String,
    Text,
    Time,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, check_in, created_ts, uuid_pk
from app.schemas.board import BoardColor, BoardLinkType, BoardTemplate, Priority

if TYPE_CHECKING:
    from app.models.content import Module


class Board(Base):
    """A board. Active boards are ordered by `position`; an archived one keeps its cards but leaves the agenda."""

    __tablename__ = "boards"
    __table_args__ = (
        Index("ix_boards_user_position", "user_id", "position"),
        check_in("color", get_args(BoardColor)),
        check_in("template", get_args(BoardTemplate)),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(60))
    emoji: Mapped[str | None] = mapped_column(String(16))
    color: Mapped[str] = mapped_column(String(12))
    template: Mapped[str] = mapped_column(String(12))
    position: Mapped[float] = mapped_column(Double)
    archived_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = created_ts()
    updated_at: Mapped[datetime] = created_ts()


class BoardColumn(Base):
    """A column (a status) of a board, in `position` order. Cards in a `done` column count as done."""

    __tablename__ = "board_columns"
    __table_args__ = (Index("ix_board_columns_board_position", "board_id", "position"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    board_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("boards.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(40))
    done: Mapped[bool] = mapped_column(Boolean, default=False)
    position: Mapped[float] = mapped_column(Double)
    created_at: Mapped[datetime] = created_ts()


class BoardLabel(Base):
    """A label the student puts on cards, on any of their boards."""

    __tablename__ = "board_labels"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_board_labels_user_name"),
        check_in("color", get_args(BoardColor)),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    name: Mapped[str] = mapped_column(String(30))
    color: Mapped[str] = mapped_column(String(12))
    created_at: Mapped[datetime] = created_ts()


class BoardPlan(Base):
    """A revision plan for one module, up to its exam, on one board: its cards (`BoardCard.plan_id`) are spread over
    the days left whenever the board is read, so falling behind spreads the rest again."""

    __tablename__ = "board_plans"
    __table_args__ = (
        UniqueConstraint("user_id", "module_id", name="uq_board_plans_user_module"),
        Index("ix_board_plans_module", "module_id"),  # removing a module (CASCADE)
        Index("ix_board_plans_board", "board_id"),  # removing a board (CASCADE)
        CheckConstraint("paper_every BETWEEN 1 AND 14", name="paper_every_range"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    board_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("boards.id", ondelete="CASCADE"))
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
    the others are `link_id`. A card a revision plan added has `plan_id`. `remindAt` is when its reminder is due,
    cleared once it is sent."""

    __tablename__ = "board_cards"
    __table_args__ = (
        Index("ix_board_cards_column_position", "column_id", "position"),
        Index("ix_board_cards_board", "board_id"),
        Index("ix_board_cards_user", "user_id"),
        Index(
            "uq_board_cards_board_link",
            "board_id",
            "link_type",
            "link_id",
            unique=True,
            postgresql_where=text("link_type IS NOT NULL"),
        ),
        Index(
            "uq_board_cards_board_lesson",
            "board_id",
            "lesson_id",
            unique=True,
            postgresql_where=text("lesson_id IS NOT NULL"),
        ),
        Index("ix_board_cards_lesson", "lesson_id"),  # removing a lesson (RESTRICT)
        Index("ix_board_cards_plan", "plan_id"),  # removing a plan (SET NULL)
        Index("ix_board_cards_remind_at", "remind_at", postgresql_where=text("remind_at IS NOT NULL")),
        CheckConstraint(
            "CASE WHEN link_type = 'lesson' THEN lesson_id IS NOT NULL AND link_id IS NULL ELSE lesson_id IS NULL END",
            name="lesson_link",
        ),
        check_in("link_type", get_args(BoardLinkType)),
        check_in("priority", get_args(Priority)),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    board_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("boards.id", ondelete="CASCADE"))
    column_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("board_columns.id", ondelete="CASCADE"))
    position: Mapped[float] = mapped_column(Double)
    title: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    due_date: Mapped[dt.date | None] = mapped_column(Date)
    due_time: Mapped[dt.time | None] = mapped_column(Time)
    remind_before: Mapped[int | None] = mapped_column(SmallInteger)  # minutes
    remind_at: Mapped[datetime | None]
    priority: Mapped[str] = mapped_column(String(8), default="none")
    checklist: Mapped[list[Any]] = mapped_column(default=list, server_default=text("'[]'::jsonb"))
    cover_id: Mapped[uuid.UUID | None]  # one of its picture uploads (checked when read)
    link_type: Mapped[str | None] = mapped_column(String(16))
    link_id: Mapped[str | None] = mapped_column(String(96))
    lesson_id: Mapped[str | None] = mapped_column(ForeignKey("lessons.id", ondelete="RESTRICT"))
    plan_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("board_plans.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = created_ts()
    updated_at: Mapped[datetime] = created_ts()
    done_at: Mapped[datetime | None]


class BoardCardLabel(Base):
    __tablename__ = "board_card_labels"
    __table_args__ = (Index("ix_board_card_labels_label", "label_id"),)

    card_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("board_cards.id", ondelete="CASCADE"), primary_key=True)
    label_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("board_labels.id", ondelete="CASCADE"), primary_key=True)


class BoardComment(Base):
    """A comment the student left on their own card."""

    __tablename__ = "board_comments"
    __table_args__ = (Index("ix_board_comments_card", "card_id", "created_at"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    card_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("board_cards.id", ondelete="CASCADE"))
    body: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = created_ts()
