"""Mini Noora's AI answers: the limits admins set, each student's usage per day, and the feature's switch

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-14 12:00:00

The feature arrives switched off: an admin switches it on from the Access screen once the API holds a key.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "noora_limits",
        sa.Column("id", sa.SmallInteger(), nullable=False),
        sa.Column("daily_questions", sa.Integer(), server_default="30", nullable=False),
        sa.Column("monthly_budget_cents", sa.Integer(), server_default="2500", nullable=False),
        sa.Column("updated_by", sa.UUID(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("id = 1", name=op.f("ck_noora_limits_single_row")),
        sa.ForeignKeyConstraint(
            ["updated_by"], ["users.id"], name=op.f("fk_noora_limits_updated_by_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_noora_limits")),
    )
    op.create_table(
        "noora_usage",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("questions", sa.Integer(), server_default="0", nullable=False),
        sa.Column("input_tokens", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("output_tokens", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("cache_read_tokens", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("cache_write_tokens", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("cost_microusd", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("last_asked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("answering_since", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_noora_usage_user_id_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_noora_usage")),
    )
    op.create_index("ix_noora_usage_day", "noora_usage", ["day"], unique=False)
    op.create_index("ix_noora_usage_user_day", "noora_usage", ["user_id", "day"], unique=True)
    op.execute("INSERT INTO noora_limits (id) VALUES (1)")
    op.execute("INSERT INTO feature_switches (feature, mode) VALUES ('noora.ai', 'off')")


def downgrade() -> None:
    op.execute("DELETE FROM feature_switch_roles WHERE feature = 'noora.ai'")
    op.execute("DELETE FROM feature_switches WHERE feature = 'noora.ai'")
    op.drop_index("ix_noora_usage_user_day", table_name="noora_usage")
    op.drop_index("ix_noora_usage_day", table_name="noora_usage")
    op.drop_table("noora_usage")
    op.drop_table("noora_limits")
