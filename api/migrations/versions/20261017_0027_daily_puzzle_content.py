"""Daily puzzles' content in the database: themes and their schedule, puzzle items, the guess list, Nearest
neighbour's vocabulary, and each day's stored set

Revision ID: 0027
Revises: 0026
Create Date: 2026-10-17 21:20:00

The puzzles' content was in JSON files in the code. It moves into tables that content editors change in Manage, and
each day's puzzle is stored the first time it is asked for, so editing the content never changes a day that is out.
The tables start empty: `python -m app.cli seed` loads the starting content once (app/seed/data/daily).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0027"
down_revision: str | None = "0026"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

GAMES = "game IN ('word', 'groups', 'search', 'quiz', 'nearest')"
UNIQUE_IN_GAME = "game IN ('word', 'quiz', 'nearest')"
UNIQUE_IN_THEME = "game IN ('groups', 'search')"


def upgrade() -> None:
    op.create_table(
        "daily_guess_words",
        sa.Column("word", sa.String(length=5), nullable=False),
        sa.CheckConstraint("word ~ '^[A-Z]{5}$'", name=op.f("ck_daily_guess_words_word")),
        sa.PrimaryKeyConstraint("word", name=op.f("pk_daily_guess_words")),
    )
    op.create_table(
        "daily_nearest_words",
        sa.Column("word", sa.String(length=24), nullable=False),
        sa.Column("tags", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("near", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("word ~ '^[a-z]+$'", name=op.f("ck_daily_nearest_words_word")),
        sa.PrimaryKeyConstraint("word", name=op.f("pk_daily_nearest_words")),
    )
    op.create_table(
        "daily_themes",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=60), nullable=False),
        sa.Column("blurb", sa.String(length=200), server_default="", nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("in_rotation", sa.Boolean(), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_daily_themes")),
    )
    op.create_table(
        "daily_items",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("game", sa.String(length=16), nullable=False),
        sa.Column("theme_id", sa.String(length=32), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("key", sa.String(length=240), nullable=False),
        sa.Column("retired", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("ranking", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(GAMES, name=op.f("ck_daily_items_game")),
        sa.ForeignKeyConstraint(
            ["theme_id"], ["daily_themes.id"], name=op.f("fk_daily_items_theme_id_daily_themes"), ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_daily_items")),
    )
    op.create_index("ix_daily_items_game_theme", "daily_items", ["game", "theme_id"], unique=False)
    op.create_index(
        "uq_daily_items_game_key",
        "daily_items",
        ["game", "key"],
        unique=True,
        postgresql_where=sa.text(UNIQUE_IN_GAME),
    )
    op.create_index(
        "uq_daily_items_game_theme_key",
        "daily_items",
        ["game", "theme_id", "key"],
        unique=True,
        postgresql_where=sa.text(UNIQUE_IN_THEME),
    )
    op.create_table(
        "daily_sets",
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("game", sa.String(length=16), nullable=False),
        sa.Column("theme_id", sa.String(length=32), nullable=False),
        sa.Column("puzzle", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(GAMES, name=op.f("ck_daily_sets_game")),
        sa.ForeignKeyConstraint(
            ["theme_id"], ["daily_themes.id"], name=op.f("fk_daily_sets_theme_id_daily_themes"), ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("day", "game", name=op.f("pk_daily_sets")),
    )
    op.create_index(op.f("ix_daily_sets_theme_id"), "daily_sets", ["theme_id"], unique=False)
    op.create_table(
        "daily_theme_weeks",
        sa.Column("week_start", sa.Date(), nullable=False),
        sa.Column("theme_id", sa.String(length=32), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("extract(dow from week_start) = 0", name=op.f("ck_daily_theme_weeks_sunday")),
        sa.ForeignKeyConstraint(
            ["theme_id"],
            ["daily_themes.id"],
            name=op.f("fk_daily_theme_weeks_theme_id_daily_themes"),
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("week_start", name=op.f("pk_daily_theme_weeks")),
    )
    op.create_index(op.f("ix_daily_theme_weeks_theme_id"), "daily_theme_weeks", ["theme_id"], unique=False)
    op.create_table(
        "daily_set_items",
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("game", sa.String(length=16), nullable=False),
        sa.Column("item_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["day", "game"], ["daily_sets.day", "daily_sets.game"], name="fk_daily_set_items_set", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["item_id"], ["daily_items.id"], name=op.f("fk_daily_set_items_item_id_daily_items"), ondelete="RESTRICT"
        ),
        sa.PrimaryKeyConstraint("day", "game", "item_id", name=op.f("pk_daily_set_items")),
    )
    op.create_index(op.f("ix_daily_set_items_item_id"), "daily_set_items", ["item_id"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_daily_set_items_item_id"), table_name="daily_set_items")
    op.drop_table("daily_set_items")
    op.drop_index(op.f("ix_daily_theme_weeks_theme_id"), table_name="daily_theme_weeks")
    op.drop_table("daily_theme_weeks")
    op.drop_index(op.f("ix_daily_sets_theme_id"), table_name="daily_sets")
    op.drop_table("daily_sets")
    op.drop_index("uq_daily_items_game_theme_key", table_name="daily_items", postgresql_where=sa.text(UNIQUE_IN_THEME))
    op.drop_index("uq_daily_items_game_key", table_name="daily_items", postgresql_where=sa.text(UNIQUE_IN_GAME))
    op.drop_index("ix_daily_items_game_theme", table_name="daily_items")
    op.drop_table("daily_items")
    op.drop_table("daily_themes")
    op.drop_table("daily_nearest_words")
    op.drop_table("daily_guess_words")
