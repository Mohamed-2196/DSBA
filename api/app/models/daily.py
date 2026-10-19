"""Daily puzzles: each signed-in person's plays, and whether they show on the leaderboard."""

from __future__ import annotations

import datetime as dt
import uuid
from datetime import datetime
from typing import Any, get_args

from sqlalchemy import Boolean, Date, ForeignKey, Index, SmallInteger, String, UniqueConstraint, text
from sqlalchemy.dialects.postgresql import INET
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, check_in, created_ts, uuid_pk
from app.schemas.daily import GameId, PlayStatus


class DailyPlay(Base):
    """One person's play of one game (and variant: Sudoku's difficulty) on one day. `moves` is the whole play; the
    server replays it to check each new move, and the columns beside it are what it adds up to, for the hub, streaks
    and the leaderboard. A play is `scored` when it was the person's first of that game on its own day.

    `revision` is the version of the day's puzzle the play is on (daily_sets.revision). A fix to today's puzzle
    leaves finished plays on the version they finished, and starts the others again on the fixed one: those partway
    through are `restarted`, so the player is told why."""

    __tablename__ = "daily_plays"
    __table_args__ = (
        UniqueConstraint("user_id", "day", "game", "variant", name="uq_daily_plays_user_day_game_variant"),
        Index(
            "uq_daily_plays_scored", "user_id", "day", "game", unique=True, postgresql_where=text("scored")
        ),  # one scored play per game per day
        Index("ix_daily_plays_day_scored", "day", postgresql_where=text("scored")),  # leaderboards
        Index("ix_daily_plays_kept", "kept_at", postgresql_where=text("kept_at IS NOT NULL")),  # keeps' rate limits
        check_in("game", get_args(GameId)),
        check_in("status", get_args(PlayStatus)),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    day: Mapped[dt.date] = mapped_column(Date)
    game: Mapped[str] = mapped_column(String(16))
    variant: Mapped[str] = mapped_column(String(12), default="", server_default="")
    moves: Mapped[list[Any]] = mapped_column(default=list)
    status: Mapped[str] = mapped_column(String(8), default="playing")
    scored: Mapped[bool] = mapped_column(Boolean, default=False)
    points: Mapped[int] = mapped_column(SmallInteger, default=0)
    mistakes: Mapped[int] = mapped_column(SmallInteger, default=0)
    hints: Mapped[int] = mapped_column(SmallInteger, default=0)
    revision: Mapped[int] = mapped_column(SmallInteger, default=0, server_default="0")
    restarted: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    started_at: Mapped[datetime] = created_ts()  # the clock: today's puzzle first opened (Sudoku: the first move)
    updated_at: Mapped[datetime] = created_ts()  # the last move
    finished_at: Mapped[datetime | None]
    # A guest's play kept on the account at sign-in: when, and from which address (for the keeps' rate limits).
    kept_at: Mapped[datetime | None]
    kept_ip: Mapped[str | None] = mapped_column(INET)


class DailyProfile(Base):
    """A person's Daily settings. Without a row, they're off the leaderboard: showing your name is opt-in."""

    __tablename__ = "daily_profiles"

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    show_on_board: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    updated_at: Mapped[datetime] = created_ts()
