"""a student's repeating event can lose one of its days

Revision ID: 0030
Revises: 0029
Create Date: 2026-10-17 21:30:00

"Delete only this one" and "change only this one" take a day off a repeat: personal_events.skipped lists those
days, and the web app, the private feed (EXDATE) and the reminders leave them out.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0030"
down_revision: str | None = "0029"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "personal_events",
        sa.Column("skipped", postgresql.ARRAY(sa.Date()), server_default="{}", nullable=False),
    )


def downgrade() -> None:
    op.drop_column("personal_events", "skipped")
