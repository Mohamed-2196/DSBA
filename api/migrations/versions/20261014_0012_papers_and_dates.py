"""papers and dates: a student's papers, an exam's length, rules and source, and careers dates

Revision ID: 0012
Revises: 0007
Create Date: 2026-10-14 21:00:00

`users.papers` and `users.zone` hold the papers a student sits and their zone (IDEA-10). Calendar events gain an exam's length and rules, where a
date comes from and when it was checked (IDEA-11), and a Careers type linked to a Career Navigator employer
(IDEA-18), so the type CHECK widens.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0012"
down_revision: str | None = "0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

EVENT_TYPES = ("exam", "mock", "revision", "deadline", "event", "break", "term")


def _types(types: Sequence[str]) -> None:
    op.drop_constraint(op.f("ck_calendar_events_type"), "calendar_events", type_="check")
    op.create_check_constraint(
        op.f("ck_calendar_events_type"), "calendar_events", f"type IN ({', '.join(repr(t) for t in types)})"
    )


def upgrade() -> None:
    op.add_column(
        "users",
        sa.Column("papers", postgresql.ARRAY(sa.String(length=64)), server_default="{}", nullable=False),
    )
    op.add_column("users", sa.Column("zone", sa.String(length=8), nullable=True))
    op.add_column("calendar_events", sa.Column("duration", sa.String(length=40), nullable=True))
    op.add_column("calendar_events", sa.Column("rules", sa.String(length=300), nullable=True))
    op.add_column("calendar_events", sa.Column("source", sa.String(length=300), nullable=True))
    op.add_column("calendar_events", sa.Column("checked_on", sa.Date(), nullable=True))
    op.add_column("calendar_events", sa.Column("employer_id", sa.String(length=64), nullable=True))
    _types((*EVENT_TYPES[:4], "careers", *EVENT_TYPES[4:]))


def downgrade() -> None:
    op.execute("DELETE FROM calendar_events WHERE type = 'careers'")
    _types(EVENT_TYPES)
    op.drop_column("calendar_events", "employer_id")
    op.drop_column("calendar_events", "checked_on")
    op.drop_column("calendar_events", "source")
    op.drop_column("calendar_events", "rules")
    op.drop_column("calendar_events", "duration")
    op.drop_column("users", "zone")
    op.drop_column("users", "papers")
