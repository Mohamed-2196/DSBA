"""a guest's Daily plays kept on the account at sign-in

Revision ID: 0041
Revises: 0040
Create Date: 2026-10-19 19:00:00

- `daily_plays.kept_at` and `kept_ip`: when a guest's play was kept on the account they signed in to, and from which
  address, for the keeps' rate limits per account and per address.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0041"
down_revision: str | None = "0040"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("daily_plays", sa.Column("kept_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("daily_plays", sa.Column("kept_ip", postgresql.INET(), nullable=True))
    op.create_index("ix_daily_plays_kept", "daily_plays", ["kept_at"], postgresql_where=sa.text("kept_at IS NOT NULL"))


def downgrade() -> None:
    op.drop_index("ix_daily_plays_kept", table_name="daily_plays", postgresql_where=sa.text("kept_at IS NOT NULL"))
    op.drop_column("daily_plays", "kept_ip")
    op.drop_column("daily_plays", "kept_at")
