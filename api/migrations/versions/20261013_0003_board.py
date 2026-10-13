"""the study board: board_cards, and the board's switch, off

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-13 18:00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "board_cards",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("lane", sa.String(length=12), nullable=False),
        sa.Column("position", sa.Double(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column("due_date", sa.Date(), nullable=True),
        sa.Column("link_type", sa.String(length=16), nullable=True),
        sa.Column("link_id", sa.String(length=96), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("done_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("lane IN ('todo', 'doing', 'done')", name=op.f("ck_board_cards_lane")),
        sa.CheckConstraint(
            "link_type IN ('event', 'lesson', 'module', 'library_item')", name=op.f("ck_board_cards_link_type")
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_board_cards_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_board_cards")),
    )
    op.create_index("ix_board_cards_user_lane_position", "board_cards", ["user_id", "lane", "position"], unique=False)
    op.create_index(
        "uq_board_cards_user_link",
        "board_cards",
        ["user_id", "link_type", "link_id"],
        unique=True,
        postgresql_where=sa.text("link_type IS NOT NULL"),
    )
    op.execute("INSERT INTO feature_switches (feature, mode) VALUES ('board', 'off')")


def downgrade() -> None:
    op.execute("DELETE FROM feature_switches WHERE feature = 'board'")
    op.drop_index(
        "uq_board_cards_user_link", table_name="board_cards", postgresql_where=sa.text("link_type IS NOT NULL")
    )
    op.drop_index("ix_board_cards_user_lane_position", table_name="board_cards")
    op.drop_table("board_cards")
