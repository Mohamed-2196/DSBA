"""The widget feed's address

Revision ID: 0066
Revises: 0065
Create Date: 2026-11-09 10:00:00

A student's widget feed (services/widget.py) has its own private address, kept like the calendar feed's: a salt, and
the address's SHA-256 to find it by.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0066"
down_revision: str | None = "0065"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("calendar_prefs", sa.Column("widget_salt", sa.String(32), nullable=True))
    op.add_column("calendar_prefs", sa.Column("widget_hash", sa.String(64), nullable=True))
    op.create_unique_constraint("uq_calendar_prefs_widget_hash", "calendar_prefs", ["widget_hash"])


def downgrade() -> None:
    op.drop_constraint("uq_calendar_prefs_widget_hash", "calendar_prefs", type_="unique")
    op.drop_column("calendar_prefs", "widget_hash")
    op.drop_column("calendar_prefs", "widget_salt")
