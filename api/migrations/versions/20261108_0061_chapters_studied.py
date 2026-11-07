"""Chapters ticked as studied

Revision ID: 0061
Revises: 0060
Create Date: 2026-11-08 19:00:00

A student ticks a chapter as studied, however they studied it: one row per student and chapter, kept apart from the
lessons they watched.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0061"
down_revision: str | None = "0060"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "chapters_studied",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("chapter_id", sa.String(16), nullable=False),
        sa.Column("studied_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("user_id", "chapter_id", name="pk_chapters_studied"),
        sa.ForeignKeyConstraint(
            ["chapter_id"], ["chapters.id"], name="fk_chapters_studied_chapter_id_chapters", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_chapters_studied_user_id_users", ondelete="CASCADE"
        ),
    )
    op.create_index("ix_chapters_studied_chapter", "chapters_studied", ["chapter_id"])


def downgrade() -> None:
    op.drop_index("ix_chapters_studied_chapter", table_name="chapters_studied")
    op.drop_table("chapters_studied")
