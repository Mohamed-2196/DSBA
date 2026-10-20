"""exams marked main sitting or resit, and the modules each student is resitting

Revision ID: 0054
Revises: 0052
Create Date: 2026-10-20 21:00:00

- `calendar_events.resit`: an exam's resit sitting (only exams can be one). A resit counts down for the year after
  the module's and for those resitting the module, never for the module's own year. Exams already on the calendar
  in the resit window (September to December: the October sitting) are marked as resits.
- `users.resits`: the modules a student ticked "I'm resitting this" on.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0054"
down_revision: str | None = "0052"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("calendar_events", sa.Column("resit", sa.Boolean(), server_default="false", nullable=False))
    op.create_check_constraint(
        op.f("ck_calendar_events_resit_is_exam"), "calendar_events", "NOT resit OR type = 'exam'"
    )
    op.execute("UPDATE calendar_events SET resit = true WHERE type = 'exam' AND EXTRACT(MONTH FROM date) >= 9")
    op.add_column("users", sa.Column("resits", postgresql.ARRAY(sa.String(64)), server_default="{}", nullable=False))


def downgrade() -> None:
    op.drop_column("users", "resits")
    op.drop_constraint(op.f("ck_calendar_events_resit_is_exam"), "calendar_events", type_="check")
    op.drop_column("calendar_events", "resit")
