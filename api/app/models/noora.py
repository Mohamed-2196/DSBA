"""Mini Noora's AI answers: the limits admins set, and how much each student used each day. No question or answer
is stored: only counts."""

from __future__ import annotations

import datetime as dt
import uuid
from datetime import datetime

from sqlalchemy import BigInteger, CheckConstraint, Date, ForeignKey, Index, Integer, SmallInteger
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, uuid_pk

DEFAULT_DAILY_QUESTIONS = 30
DEFAULT_MONTHLY_BUDGET_CENTS = 1000  # US$10


class NooraLimits(Base):
    """The one row of limits: questions per student per day, and the hub's monthly budget in US cents (estimated
    from the tokens each answer uses)."""

    __tablename__ = "noora_limits"
    __table_args__ = (CheckConstraint("id = 1", name="single_row"),)

    id: Mapped[int] = mapped_column(SmallInteger, primary_key=True, default=1)
    daily_questions: Mapped[int] = mapped_column(
        Integer, default=DEFAULT_DAILY_QUESTIONS, server_default=str(DEFAULT_DAILY_QUESTIONS)
    )
    monthly_budget_cents: Mapped[int] = mapped_column(
        Integer, default=DEFAULT_MONTHLY_BUDGET_CENTS, server_default=str(DEFAULT_MONTHLY_BUDGET_CENTS)
    )
    updated_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    updated_at: Mapped[datetime | None]


class NooraUsage(Base):
    """One student's AI questions on one day (in Bahrain), and the tokens and estimated cost of the answers. Kept
    when the account is deleted (without the person), so the month's spending stays right."""

    __tablename__ = "noora_usage"
    __table_args__ = (
        Index("ix_noora_usage_user_day", "user_id", "day", unique=True),
        Index("ix_noora_usage_day", "day"),  # the month's totals
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    day: Mapped[dt.date] = mapped_column(Date)
    questions: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    input_tokens: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    output_tokens: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    cache_read_tokens: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    cache_write_tokens: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")
    cost_microusd: Mapped[int] = mapped_column(BigInteger, default=0, server_default="0")  # millionths of a dollar
    last_asked_at: Mapped[datetime | None]
    answering_since: Mapped[datetime | None]  # an answer is streaming to the student (cleared when it ends)
