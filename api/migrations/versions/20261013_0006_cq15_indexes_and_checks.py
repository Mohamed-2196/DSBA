"""indexes for the queries that run, and the database's own checks on kinds, types, reasons and cohorts (CQ-15)

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-13 10:05:00

Code quality review CQ-15, what 0004 left:
- The library's lists filter by status and sort newest first by coalesce(published_at, created_at):
  ix_library_items_status_newest is on that expression, and replaces (status, published_at), which only ever
  served the status.
- reports(reporter_id, created_at): a person's reports per hour, their data export, and SET NULL when an account is
  deleted (the partial unique index covers open reports only). otp_challenges(user_id, created_at): a signed-in
  account's codes per hour, and anonymise() before a deletion. (content_docs.updated_by stays without one: the table
  holds a row per document.)
- CHECKs for the columns whose values the contract lists: library_items.kind (LibraryKind), calendar_events.type
  (EventType), reports.target_type (ReportTarget) and reports.reason (ReportReason), as they are now (a new value
  needs a migration of its own); and the 1-3 cohort range on forum_threads.author_year, forum_replies.author_year and
  library_items.year, as users.year has had from the start.
- reports.status defaults to 'open' in the database too.

Every value the API has ever written fits: its schemas have checked these fields since round 1, and the cohorts are
copied from users.year and modules.year, which are checked. A row that doesn't fit makes the upgrade fail, rather
than be changed behind anyone's back.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0006"
down_revision: str | None = "0005"
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
EVENT_TYPES = ("exam", "mock", "revision", "deadline", "event", "break", "term")
REPORT_TARGETS = ("thread", "reply", "library_item")
REPORT_REASONS = ("spam", "harassment", "inappropriate", "copyright", "other")


def _one_of(column: str, values: Sequence[str]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


def _cohort(column: str) -> str:
    return f"{column} IS NULL OR {column} BETWEEN 1 AND 3"


# (constraint, table, condition)
CHECKS: list[tuple[str, str, str]] = [
    ("ck_library_items_kind", "library_items", _one_of("kind", LIBRARY_KINDS)),
    ("ck_library_items_year_range", "library_items", _cohort("year")),
    ("ck_calendar_events_type", "calendar_events", _one_of("type", EVENT_TYPES)),
    ("ck_reports_target_type", "reports", _one_of("target_type", REPORT_TARGETS)),
    ("ck_reports_reason", "reports", _one_of("reason", REPORT_REASONS)),
    ("ck_forum_threads_author_year_range", "forum_threads", _cohort("author_year")),
    ("ck_forum_replies_author_year_range", "forum_replies", _cohort("author_year")),
]


def upgrade() -> None:
    op.drop_index(op.f("ix_library_items_status_published"), table_name="library_items")
    op.create_index(
        "ix_library_items_status_newest",
        "library_items",
        ["status", sa.literal_column("coalesce(published_at, created_at)")],
        unique=False,
    )
    op.create_index("ix_otp_challenges_user_created", "otp_challenges", ["user_id", "created_at"], unique=False)
    op.create_index("ix_reports_reporter_created", "reports", ["reporter_id", "created_at"], unique=False)

    for name, table, condition in CHECKS:
        op.create_check_constraint(op.f(name), table, condition)

    op.alter_column("reports", "status", server_default="open")


def downgrade() -> None:
    op.alter_column("reports", "status", server_default=None)

    for name, table, _ in reversed(CHECKS):
        op.drop_constraint(op.f(name), table, type_="check")

    op.drop_index("ix_reports_reporter_created", table_name="reports")
    op.drop_index("ix_otp_challenges_user_created", table_name="otp_challenges")
    op.drop_index("ix_library_items_status_newest", table_name="library_items")
    op.create_index(
        op.f("ix_library_items_status_published"), "library_items", ["status", "published_at"], unique=False
    )
