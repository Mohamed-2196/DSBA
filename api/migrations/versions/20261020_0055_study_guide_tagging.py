"""chapters' study-guide outlines, questions' anchors, and Claude's tagging of each new past paper

Revision ID: 0055
Revises: 0052
Create Date: 2026-10-20 23:50:00

- `chapters.outline`: what the module's study guide says a chapter covers (learning outcomes, topics, key terms),
  from the seed; Claude tags questions by it.
- `paper_questions.anchor`: a question's first words as its PDF's text has them, so the viewer marks where it starts.
- `paper_taggings`: one row a published past paper that Claude tags (queued on publishing, or by an admin), with its
  status, why it was skipped or failed, and what it cost.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0055"
down_revision: str | None = "0052"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("chapters", sa.Column("outline", sa.Text(), nullable=True))
    op.add_column("paper_questions", sa.Column("anchor", sa.String(length=160), nullable=True))
    op.create_table(
        "paper_taggings",
        sa.Column("item_id", sa.UUID(), nullable=False),
        sa.Column("status", sa.String(length=8), nullable=False),
        sa.Column("reason", sa.String(length=200), nullable=True),
        sa.Column("questions", sa.SmallInteger(), nullable=True),
        sa.Column("model", sa.String(length=40), nullable=True),
        sa.Column("attempts", sa.SmallInteger(), server_default="0", nullable=False),
        sa.Column("cost_microusd", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("queued_by", sa.UUID(), nullable=True),
        sa.Column("queued_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "status IN ('queued', 'working', 'done', 'skipped', 'failed')",
            name=op.f("ck_paper_taggings_taggingstatus"),
        ),
        sa.ForeignKeyConstraint(
            ["item_id"],
            ["library_items.id"],
            name=op.f("fk_paper_taggings_item_id_library_items"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["queued_by"], ["users.id"], name=op.f("fk_paper_taggings_queued_by_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("item_id", name=op.f("pk_paper_taggings")),
    )
    op.create_index("ix_paper_taggings_status_queued", "paper_taggings", ["status", "queued_at"], unique=False)
    op.create_index("ix_paper_taggings_queued_by", "paper_taggings", ["queued_by"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_paper_taggings_queued_by", table_name="paper_taggings")
    op.drop_index("ix_paper_taggings_status_queued", table_name="paper_taggings")
    op.drop_table("paper_taggings")
    op.drop_column("paper_questions", "anchor")
    op.drop_column("chapters", "outline")
