"""revision plans on the study board: board_plans, and board_cards.plan_id

Revision ID: 0009
Revises: 0008
Create Date: 2026-10-14 18:00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0009"
down_revision: str | None = "0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "board_plans",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("module_id", sa.String(length=64), nullable=False),
        sa.Column("exam_date", sa.Date(), nullable=False),
        sa.Column("paper_every", sa.SmallInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("paper_every BETWEEN 1 AND 14", name=op.f("ck_board_plans_paper_every_range")),
        sa.ForeignKeyConstraint(
            ["module_id"], ["modules.id"], name=op.f("fk_board_plans_module_id_modules"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_board_plans_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_board_plans")),
        sa.UniqueConstraint("user_id", "module_id", name="uq_board_plans_user_module"),
    )
    op.create_index("ix_board_plans_module", "board_plans", ["module_id"], unique=False)
    op.add_column("board_cards", sa.Column("plan_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        op.f("fk_board_cards_plan_id_board_plans"),
        "board_cards",
        "board_plans",
        ["plan_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_board_cards_plan", "board_cards", ["plan_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_board_cards_plan", table_name="board_cards")
    op.drop_constraint(op.f("fk_board_cards_plan_id_board_plans"), "board_cards", type_="foreignkey")
    op.drop_column("board_cards", "plan_id")
    op.drop_index("ix_board_plans_module", table_name="board_plans")
    op.drop_table("board_plans")
