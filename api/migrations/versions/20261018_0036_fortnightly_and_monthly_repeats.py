"""a student's own events repeat every two weeks or every month too

Revision ID: 0036
Revises: 0034
Create Date: 2026-10-18 12:00:00

personal_events.repeat takes "fortnightly" and "monthly" (the column widens to fit them). A monthly repeat falls on
the same day of each month, or on a month's last day when the month has no such day. personal_events.month_day keeps
that day while the event's first day is such a last day instead: a repeat changed from 28 February on keeps the 31st.

Going back, the events that repeat every two weeks or every month keep only their first day.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0036"
down_revision: str | None = "0034"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.drop_constraint(op.f("ck_personal_events_repeat"), "personal_events", type_="check")
    op.alter_column(
        "personal_events",
        "repeat",
        existing_type=sa.String(length=8),
        type_=sa.String(length=12),
        existing_nullable=False,
        existing_server_default=sa.text("'none'::character varying"),
    )
    op.create_check_constraint(
        op.f("ck_personal_events_repeat"),
        "personal_events",
        "repeat IN ('none', 'daily', 'weekly', 'fortnightly', 'monthly')",
    )
    op.add_column("personal_events", sa.Column("month_day", sa.SmallInteger(), nullable=True))
    op.create_check_constraint(
        op.f("ck_personal_events_month_day"),
        "personal_events",
        "month_day IS NULL OR (repeat = 'monthly' AND month_day BETWEEN 29 AND 31)",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_personal_events_month_day"), "personal_events", type_="check")
    op.drop_column("personal_events", "month_day")
    op.drop_constraint(op.f("ck_personal_events_repeat"), "personal_events", type_="check")
    op.execute(
        "UPDATE personal_events SET repeat = 'none', repeat_until = NULL, skipped = '{}' "
        "WHERE repeat IN ('fortnightly', 'monthly')"
    )
    op.alter_column(
        "personal_events",
        "repeat",
        existing_type=sa.String(length=12),
        type_=sa.String(length=8),
        existing_nullable=False,
        existing_server_default=sa.text("'none'::character varying"),
    )
    op.create_check_constraint(
        op.f("ck_personal_events_repeat"), "personal_events", "repeat IN ('none', 'daily', 'weekly')"
    )
