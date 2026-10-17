"""Daily puzzles' content, edited in Manage: the weekly themes and their schedule, each game's puzzle items, the word
game's guess list and Nearest neighbour's vocabulary. Each day's set is stored the first time it is asked for, with
the items it took and the puzzle as it was made, so editing the content later never changes a day that is out."""

from __future__ import annotations

import datetime as dt
import uuid
from datetime import datetime
from typing import Any, get_args

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    Integer,
    String,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, check_in, created_ts, uuid_pk
from app.schemas.daily_content import ContentGame

CONTENT_GAMES = get_args(ContentGame)
# The games whose items are unique across every theme (an answer word, a question, a secret word belong to one
# theme); a group's label and a search word are unique within their theme.
UNIQUE_IN_GAME = ("word", "quiz", "nearest")
UNIQUE_IN_THEME = ("groups", "search")


def _listed(values: tuple[str, ...]) -> str:
    return ", ".join(f"'{v}'" for v in values)


class DailyTheme(Base):
    """A week's theme. Themes `in_rotation` take turns, a week each, in `position` order; a theme out of the rotation
    runs only on weeks the schedule names it for."""

    __tablename__ = "daily_themes"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)  # 'stats': in the puzzles' seeds, never changes
    title: Mapped[str] = mapped_column(String(60))
    blurb: Mapped[str] = mapped_column(String(200), default="", server_default="")
    position: Mapped[int] = mapped_column(Integer, default=0)
    in_rotation: Mapped[bool] = mapped_column(Boolean, default=False)
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    created_at: Mapped[datetime] = created_ts()
    updated_at: Mapped[datetime] = created_ts()


class DailyThemeWeek(Base):
    """A week whose theme is fixed: chosen by an editor for a week to come, or kept as it ran once the week started
    (a week out of the schedule follows the rotation)."""

    __tablename__ = "daily_theme_weeks"
    __table_args__ = (CheckConstraint("extract(dow from week_start) = 0", name="sunday"),)

    week_start: Mapped[dt.date] = mapped_column(Date, primary_key=True)  # a Sunday
    theme_id: Mapped[str] = mapped_column(ForeignKey("daily_themes.id", ondelete="RESTRICT"), index=True)
    created_at: Mapped[datetime] = created_ts()


class DailyItem(Base):
    """One puzzle item of a game, in a theme: an answer word, a group of words, a word to hide in the word search, a
    quiz question or a secret word for Nearest neighbour. `data` holds the game's fields (schemas/daily_content.py)
    and `key` the text that must be unique (the word, the group's label, the question). A retired item is kept for
    the days it was used on, and never chosen again."""

    __tablename__ = "daily_items"
    __table_args__ = (
        check_in("game", CONTENT_GAMES),
        Index(
            "uq_daily_items_game_key",
            "game",
            "key",
            unique=True,
            postgresql_where=text(f"game IN ({_listed(UNIQUE_IN_GAME)})"),
        ),
        Index(
            "uq_daily_items_game_theme_key",
            "game",
            "theme_id",
            "key",
            unique=True,
            postgresql_where=text(f"game IN ({_listed(UNIQUE_IN_THEME)})"),
        ),
        Index("ix_daily_items_game_theme", "game", "theme_id"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    game: Mapped[str] = mapped_column(String(16))
    theme_id: Mapped[str] = mapped_column(ForeignKey("daily_themes.id", ondelete="RESTRICT"))
    data: Mapped[dict[str, Any]] = mapped_column(default=dict)
    key: Mapped[str] = mapped_column(String(240))
    retired: Mapped[bool] = mapped_column(Boolean, default=False, server_default="false")
    # Nearest neighbour's secret words: the vocabulary from closest to farthest, worked out whenever the vocabulary
    # or the word changes. None for the other games.
    ranking: Mapped[list[Any] | None]
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    created_at: Mapped[datetime] = created_ts()
    updated_at: Mapped[datetime] = created_ts()


class DailySet(Base):
    """A game's puzzle for one day, made the first time anyone asked for it and never changed after: `puzzle` is what
    plays are checked against, whatever happens to the content afterwards."""

    __tablename__ = "daily_sets"
    __table_args__ = (check_in("game", CONTENT_GAMES),)

    day: Mapped[dt.date] = mapped_column(Date, primary_key=True)
    game: Mapped[str] = mapped_column(String(16), primary_key=True)
    theme_id: Mapped[str] = mapped_column(ForeignKey("daily_themes.id", ondelete="RESTRICT"), index=True)
    puzzle: Mapped[dict[str, Any]] = mapped_column(default=dict)
    created_at: Mapped[datetime] = created_ts()


class DailySetItem(Base):
    """The items a day's puzzle took: how often and how lately each item ran, for the choices to come and the editor."""

    __tablename__ = "daily_set_items"
    __table_args__ = (
        ForeignKeyConstraint(
            ["day", "game"], ["daily_sets.day", "daily_sets.game"], name="fk_daily_set_items_set", ondelete="CASCADE"
        ),
    )

    day: Mapped[dt.date] = mapped_column(Date, primary_key=True)
    game: Mapped[str] = mapped_column(String(16), primary_key=True)
    item_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("daily_items.id", ondelete="RESTRICT"), primary_key=True, index=True
    )


class DailyGuessWord(Base):
    """The word game's guess list: every five-letter word a guess may be. Every answer word is in it."""

    __tablename__ = "daily_guess_words"
    __table_args__ = (CheckConstraint("word ~ '^[A-Z]{5}$'", name="word"),)

    word: Mapped[str] = mapped_column(String(5), primary_key=True)


class DailyNearestWord(Base):
    """A word Nearest neighbour knows. Closeness comes from shared `tags`, plus a bonus for the `near` words (both
    ways); every guess must be one of these words."""

    __tablename__ = "daily_nearest_words"
    __table_args__ = (CheckConstraint("word ~ '^[a-z]+$'", name="word"),)

    word: Mapped[str] = mapped_column(String(24), primary_key=True)
    tags: Mapped[list[Any]] = mapped_column(default=list)
    near: Mapped[list[Any]] = mapped_column(default=list)
    version: Mapped[int] = mapped_column(Integer, default=1, server_default="1")
    updated_at: Mapped[datetime] = created_ts()
