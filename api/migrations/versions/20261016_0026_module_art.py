"""Module art URL

Revision ID: 0026
Revises: 0025
Create Date: 2026-10-16 14:00:00
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0026"
down_revision: str | None = "0025"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("modules", sa.Column("art_url", sa.String(length=500), nullable=True))


def downgrade() -> None:
    op.drop_column("modules", "art_url")
