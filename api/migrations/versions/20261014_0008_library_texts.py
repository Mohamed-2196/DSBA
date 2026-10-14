"""The words of published PDF and Word files, for search inside papers

Revision ID: 0008
Revises: 0006
Create Date: 2026-10-14 18:00:00

A text worker (python -m app.cli text-worker) reads each published file once and keeps its pages here;
`python -m app.cli extract-texts` reads the files already in the library.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0008"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "library_texts",
        sa.Column("item_id", sa.UUID(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "working",
                "done",
                "empty",
                "failed",
                name="textstatus",
                native_enum=False,
                create_constraint=True,
                length=8,
            ),
            nullable=False,
        ),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("pages", sa.Integer(), nullable=True),
        sa.Column("error", sa.String(length=200), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "search_vector",
            postgresql.TSVECTOR(),
            sa.Computed("to_tsvector('simple', coalesce(body, ''))", persisted=True),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["item_id"], ["library_items.id"], name=op.f("fk_library_texts_item_id_library_items"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("item_id", name=op.f("pk_library_texts")),
    )
    op.create_index("ix_library_texts_search", "library_texts", ["search_vector"], unique=False, postgresql_using="gin")


def downgrade() -> None:
    op.drop_index("ix_library_texts_search", table_name="library_texts", postgresql_using="gin")
    op.drop_table("library_texts")
