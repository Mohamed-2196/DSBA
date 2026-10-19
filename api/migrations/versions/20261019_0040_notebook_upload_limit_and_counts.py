"""notebook upload limit and counts

Revision ID: 0040
Revises: 0038
Create Date: 2026-10-19 18:13:38

- `notebook_limits`: the one row of the notebook's limits admins set in Manage: the pictures, files and PDFs a student
  may upload to their notes in an hour (60 to start).
- `notebook_upload_days`: each student's notebook uploads per day (in Bahrain), their bytes, and the ones refused at
  the hourly limit: only counts, for Manage's numbers. In the student's export, gone with the account.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0040"
down_revision: str | None = "0038"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "notebook_limits",
        sa.Column("id", sa.SmallInteger(), nullable=False),
        sa.Column("uploads_per_hour", sa.Integer(), server_default="60", nullable=False),
        sa.Column("updated_by", sa.UUID(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("id = 1", name=op.f("ck_notebook_limits_single_row")),
        sa.ForeignKeyConstraint(
            ["updated_by"], ["users.id"], name=op.f("fk_notebook_limits_updated_by_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_notebook_limits")),
    )
    op.create_table(
        "notebook_upload_days",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("uploads", sa.Integer(), server_default="0", nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("capped", sa.Integer(), server_default="0", nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_notebook_upload_days_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_notebook_upload_days")),
    )
    op.create_index("ix_notebook_upload_days_day", "notebook_upload_days", ["day"], unique=False)
    op.create_index("ix_notebook_upload_days_user_day", "notebook_upload_days", ["user_id", "day"], unique=True)
    op.bulk_insert(sa.table("notebook_limits", sa.column("id", sa.SmallInteger())), [{"id": 1}])


def downgrade() -> None:
    op.drop_index("ix_notebook_upload_days_user_day", table_name="notebook_upload_days")
    op.drop_index("ix_notebook_upload_days_day", table_name="notebook_upload_days")
    op.drop_table("notebook_upload_days")
    op.drop_table("notebook_limits")
