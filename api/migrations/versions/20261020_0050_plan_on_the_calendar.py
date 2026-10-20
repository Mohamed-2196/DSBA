"""a student's plan on their calendar

Revision ID: 0050
Revises: 0046
Create Date: 2026-10-20 18:00:00

- `calendar_prefs.show_plan`: the dated cards of the student's boards show on their calendar and in their private
  feed (off until they switch it on).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0050"
down_revision: str | None = "0046"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("calendar_prefs", sa.Column("show_plan", sa.Boolean(), server_default="false", nullable=False))


def downgrade() -> None:
    op.drop_column("calendar_prefs", "show_plan")
