"""exam years checked like the rest of a sitting, an index for the requests done lately, and the suggested videos'
switch named like the others

Revision ID: 0034
Revises: 0033
Create Date: 2026-10-18 12:30:00

- A sitting is an exam year, a session and a zone. The database already checks the session and the zone; now
  `exam_year` on library items and requests holds a year from 1990 to 2100 too, as the API accepts.
- `ix_requests_done`: "You asked, we did" (`/requests/done` and the newsletter's section of it) reads the requests
  done lately, newest answer first.
- The switch for suggested videos is `modules.video-suggestions`, with the mode, the roles and who last set it kept.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0034"
down_revision: str | None = "0033"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

EXAM_YEARS = "exam_year IS NULL OR exam_year BETWEEN 1990 AND 2100"
DONE = "status = 'done' AND removed_at IS NULL"
SWITCH, RENAMED = "video_suggestions", "modules.video-suggestions"


def _rename_switch(old: str, new: str) -> None:
    """The switch under its new name: the row is copied, its roles moved onto the copy, then the old row goes (the
    roles' foreign key doesn't follow a renamed key)."""
    names = {"old": old, "new": new}
    op.execute(
        sa.text(
            "INSERT INTO feature_switches (feature, mode, updated_by, updated_at) "
            "SELECT :new, mode, updated_by, updated_at FROM feature_switches WHERE feature = :old"
        ).bindparams(**names)
    )
    op.execute(sa.text("UPDATE feature_switch_roles SET feature = :new WHERE feature = :old").bindparams(**names))
    op.execute(sa.text("DELETE FROM feature_switches WHERE feature = :old").bindparams(old=old))


def upgrade() -> None:
    for table in ("library_items", "requests"):
        op.create_check_constraint(op.f(f"ck_{table}_exam_year_range"), table, EXAM_YEARS)
    op.create_index("ix_requests_done", "requests", ["answered_at"], postgresql_where=sa.text(DONE))
    _rename_switch(SWITCH, RENAMED)


def downgrade() -> None:
    _rename_switch(RENAMED, SWITCH)
    op.drop_index("ix_requests_done", table_name="requests", postgresql_where=sa.text(DONE))
    for table in ("requests", "library_items"):
        op.drop_constraint(op.f(f"ck_{table}_exam_year_range"), table, type_="check")
