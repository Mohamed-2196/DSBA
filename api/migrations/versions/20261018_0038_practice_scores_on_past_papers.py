"""practice scores on past papers

Revision ID: 0038
Revises: 0039
Create Date: 2026-10-18 13:35:56

- `paper_scores`: each student's practice score on a past paper, out of 100, which the board asks for when a paper is
  marked done. Kept in the account (private to the student, in their export, gone with the account or the paper)
  instead of in one browser. Nothing is carried over from browsers: nothing is released yet.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0038"
down_revision: str | None = "0039"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "paper_scores",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("item_id", sa.UUID(), nullable=False),
        sa.Column("score", sa.Double(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("score BETWEEN 0 AND 100", name=op.f("ck_paper_scores_score_range")),
        sa.ForeignKeyConstraint(
            ["item_id"], ["library_items.id"], name=op.f("fk_paper_scores_item_id_library_items"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_paper_scores_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id", "item_id", name=op.f("pk_paper_scores")),
    )
    op.create_index("ix_paper_scores_item", "paper_scores", ["item_id"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_paper_scores_item", table_name="paper_scores")
    op.drop_table("paper_scores")
