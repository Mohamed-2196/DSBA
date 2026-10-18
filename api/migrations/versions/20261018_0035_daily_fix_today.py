"""a fix to today's Daily puzzle: versions of a day's puzzle, and plays that start again; every win counts

Revision ID: 0035
Revises: 0033
Create Date: 2026-10-18 11:15:00

An editor can correct today's puzzle in Manage → Daily puzzles. The day's puzzle (daily_sets) counts its fixes in
`revision`, and the puzzle a fix replaces is kept in daily_set_revisions, because the plays finished on it keep their
results and are shown against it. A play records the version it is on (daily_plays.revision); the plays a fix starts
again on the corrected puzzle are marked `restarted` so the player is told why. Every day stored so far is version 0,
and so is every play.

A win scores however fast it came (Mohamed's call), so daily_plays.too_fast goes. The points a play earned stay.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0035"
down_revision: str | None = "0033"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("daily_sets", sa.Column("revision", sa.SmallInteger(), server_default="0", nullable=False))
    op.create_table(
        "daily_set_revisions",
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("game", sa.String(length=16), nullable=False),
        sa.Column("variant", sa.String(length=12), server_default="", nullable=False),
        sa.Column("revision", sa.SmallInteger(), nullable=False),
        sa.Column("puzzle", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["day", "game", "variant"],
            ["daily_sets.day", "daily_sets.game", "daily_sets.variant"],
            name="fk_daily_set_revisions_set",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("day", "game", "variant", "revision", name=op.f("pk_daily_set_revisions")),
    )
    op.add_column("daily_plays", sa.Column("revision", sa.SmallInteger(), server_default="0", nullable=False))
    op.add_column("daily_plays", sa.Column("restarted", sa.Boolean(), server_default="false", nullable=False))
    op.drop_column("daily_plays", "too_fast")


def downgrade() -> None:
    op.add_column("daily_plays", sa.Column("too_fast", sa.Boolean(), server_default="false", nullable=False))
    op.drop_column("daily_plays", "restarted")
    op.drop_column("daily_plays", "revision")
    op.drop_table("daily_set_revisions")
    op.drop_column("daily_sets", "revision")
