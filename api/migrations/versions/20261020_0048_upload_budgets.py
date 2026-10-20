"""the hub's and each account's daily upload budgets

Revision ID: 0048
Revises: 0047
Create Date: 2026-10-20 19:00:00

- `upload_limits`: the one row of the upload budgets admins set in Manage → Numbers: megabytes the whole hub (20 GB to
  start) and each account (1 GB) may upload in 24 hours (security review SEC-14).
- `ix_uploads_created`: the hub's bytes in the last 24 hours, counted at every upload.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0048"
down_revision: str | None = "0047"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "upload_limits",
        sa.Column("id", sa.SmallInteger(), nullable=False),
        sa.Column("hub_mb_per_day", sa.Integer(), server_default="20480", nullable=False),
        sa.Column("account_mb_per_day", sa.Integer(), server_default="1024", nullable=False),
        sa.Column("updated_by", sa.UUID(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("id = 1", name=op.f("ck_upload_limits_single_row")),
        sa.ForeignKeyConstraint(
            ["updated_by"], ["users.id"], name=op.f("fk_upload_limits_updated_by_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_upload_limits")),
    )
    op.create_index("ix_uploads_created", "uploads", ["created_at"], unique=False)
    op.bulk_insert(sa.table("upload_limits", sa.column("id", sa.SmallInteger())), [{"id": 1}])


def downgrade() -> None:
    op.drop_index("ix_uploads_created", table_name="uploads")
    op.drop_table("upload_limits")
