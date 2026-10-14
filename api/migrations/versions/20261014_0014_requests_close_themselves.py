"""requests close themselves: what a paper or date request wants, the file found for it, and two switches (off)

Revision ID: 0014
Revises: 0012
Create Date: 2026-10-14 22:00:00

A paper request names a module, a library kind and maybe an exam year and zone; a published file that fits becomes
its `found_item_id` until the requester or a rep says yes or no. A date request names an unconfirmed event and closes
when a rep confirms it. Both arrive switched off, with "Help the year below" on Home (a web-only switch).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0014"
down_revision: str | None = "0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

LIBRARY_KINDS = (
    "past-paper",
    "examiners-report",
    "subject-guide",
    "reading",
    "study-guide",
    "exercises",
    "notes",
    "cheat-sheet",
    "course-materials",
    "vle-materials",
    "other",
)
SWITCHES = ("requests.autoclose", "forum.help-below")


def upgrade() -> None:
    op.add_column("requests", sa.Column("wanted_kind", sa.String(length=32), nullable=True))
    op.add_column("requests", sa.Column("exam_year", sa.SmallInteger(), nullable=True))
    op.add_column("requests", sa.Column("zone", sa.String(length=8), nullable=True))
    op.add_column("requests", sa.Column("event_id", sa.String(length=120), nullable=True))
    op.add_column("requests", sa.Column("found_item_id", sa.UUID(), nullable=True))
    op.add_column("requests", sa.Column("found_at", sa.DateTime(timezone=True), nullable=True))
    op.create_foreign_key(
        op.f("fk_requests_event_id_calendar_events"),
        "requests",
        "calendar_events",
        ["event_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        op.f("fk_requests_found_item_id_library_items"),
        "requests",
        "library_items",
        ["found_item_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_requests_event", "requests", ["event_id"], unique=False)
    op.create_index("ix_requests_found_item", "requests", ["found_item_id"], unique=False)
    op.create_check_constraint(
        op.f("ck_requests_wanted_kind"),
        "requests",
        f"wanted_kind IN ({', '.join(repr(k) for k in LIBRARY_KINDS)})",
    )
    conn = op.get_bind()
    for feature in SWITCHES:
        conn.execute(sa.text("INSERT INTO feature_switches (feature, mode) VALUES (:f, 'off')"), {"f": feature})


def downgrade() -> None:
    conn = op.get_bind()
    for feature in SWITCHES:
        conn.execute(sa.text("DELETE FROM feature_switch_roles WHERE feature = :f"), {"f": feature})
        conn.execute(sa.text("DELETE FROM feature_switches WHERE feature = :f"), {"f": feature})
    op.drop_constraint(op.f("ck_requests_wanted_kind"), "requests", type_="check")
    op.drop_index("ix_requests_found_item", table_name="requests")
    op.drop_index("ix_requests_event", table_name="requests")
    op.drop_constraint(op.f("fk_requests_found_item_id_library_items"), "requests", type_="foreignkey")
    op.drop_constraint(op.f("fk_requests_event_id_calendar_events"), "requests", type_="foreignkey")
    for column in ("found_at", "found_item_id", "event_id", "zone", "exam_year", "wanted_kind"):
        op.drop_column("requests", column)
