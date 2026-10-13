"""notes: each student's private notes, and the notes switch (off)

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-13 18:00:00

Notes arrive switched off: admins turn them on from the Access screen.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "notes",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(length=200), server_default="", nullable=False),
        sa.Column("body", sa.Text(), server_default="", nullable=False),
        sa.Column("module_id", sa.String(length=64), nullable=True),
        sa.Column("chapter", sa.SmallInteger(), nullable=True),
        sa.Column("video", sa.SmallInteger(), nullable=True),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("saves_since", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("saves", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("(chapter IS NULL) = (video IS NULL)", name=op.f("ck_notes_lesson_pair")),
        sa.ForeignKeyConstraint(
            ["module_id"], ["modules.id"], name=op.f("fk_notes_module_id_modules"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_notes_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_notes")),
    )
    op.create_index("ix_notes_module", "notes", ["module_id"], unique=False)
    op.create_index("ix_notes_user_module", "notes", ["user_id", "module_id", "chapter", "video"], unique=False)
    op.create_index("ix_notes_user_updated", "notes", ["user_id", "updated_at"], unique=False)
    op.execute("INSERT INTO feature_switches (feature, mode) VALUES ('notes', 'off')")


def downgrade() -> None:
    op.execute("DELETE FROM feature_switches WHERE feature = 'notes'")
    op.drop_index("ix_notes_user_updated", table_name="notes")
    op.drop_index("ix_notes_user_module", table_name="notes")
    op.drop_index("ix_notes_module", table_name="notes")
    op.drop_table("notes")
