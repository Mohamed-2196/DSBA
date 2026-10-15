"""Daily puzzles: daily_plays and daily_profiles, and the Daily switch (off)

Revision ID: 0025
Revises: 0024
Create Date: 2026-10-15 09:00:00

A set of short puzzles a day, the same for everyone. Each signed-in person's plays are kept with their moves, so
the server checks every move and scores the play; showing your name on the leaderboard is opt-in. It arrives
switched off: an admin switches it on from the Access screen.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0025"
down_revision: str | None = "0024"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FEATURE = "daily"


def upgrade() -> None:
    op.create_table(
        "daily_plays",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("game", sa.String(length=16), nullable=False),
        sa.Column("variant", sa.String(length=12), server_default="", nullable=False),
        sa.Column("moves", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("status", sa.String(length=8), nullable=False),
        sa.Column("scored", sa.Boolean(), nullable=False),
        sa.Column("points", sa.SmallInteger(), nullable=False),
        sa.Column("mistakes", sa.SmallInteger(), nullable=False),
        sa.Column("hints", sa.SmallInteger(), nullable=False),
        sa.Column("too_fast", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "game IN ('word', 'groups', 'search', 'quiz', 'nearest', 'sudoku')", name=op.f("ck_daily_plays_game")
        ),
        sa.CheckConstraint("status IN ('new', 'playing', 'won', 'lost')", name=op.f("ck_daily_plays_status")),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_daily_plays_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_daily_plays")),
        sa.UniqueConstraint("user_id", "day", "game", "variant", name="uq_daily_plays_user_day_game_variant"),
    )
    op.create_index(
        "uq_daily_plays_scored",
        "daily_plays",
        ["user_id", "day", "game"],
        unique=True,
        postgresql_where=sa.text("scored"),
    )
    op.create_index("ix_daily_plays_day_scored", "daily_plays", ["day"], postgresql_where=sa.text("scored"))
    op.create_table(
        "daily_profiles",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("show_on_board", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_daily_profiles_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_daily_profiles")),
    )
    op.get_bind().execute(sa.text("INSERT INTO feature_switches (feature, mode) VALUES (:f, 'off')"), {"f": FEATURE})


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM feature_switch_roles WHERE feature = :f"), {"f": FEATURE})
    conn.execute(sa.text("DELETE FROM feature_switches WHERE feature = :f"), {"f": FEATURE})
    op.drop_table("daily_profiles")
    op.drop_index("ix_daily_plays_day_scored", table_name="daily_plays", postgresql_where=sa.text("scored"))
    op.drop_index("uq_daily_plays_scored", table_name="daily_plays", postgresql_where=sa.text("scored"))
    op.drop_table("daily_plays")
