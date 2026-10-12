"""indexes that match the queries, deleted_at on forum posts, a check on notification kinds, no users.updated_at

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-13 09:00:00

Code quality review CQ-15: drop an index no query uses (forum threads by status and last activity), and add the
missing ones: the replies to a reply, a library item's uploader and reviewer, the reports about a post or a file,
and the foreign keys to users that deleting an account sets to NULL (audit log, notifications, reports, calendar,
newsletter), plus the emails of a notification. users.updated_at is dropped: nothing read it, and the session touch
made it mean "last seen".

CQ-14 and SEC-15: forum_threads and forum_replies get deleted_at. A hidden post whose text was deleted said so with
a single space as its body; that becomes deleted_at, and every deleted post gets one.

CQ-10: notifications.kind takes only the kinds the contract lists.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# app/schemas/notifications.py NotificationKind, as it is now (a new kind needs a migration of its own)
KINDS = (
    "thread_reply",
    "reply_reply",
    "answer_accepted",
    "upload_published",
    "upload_rejected",
    "new_issue",
    "report_resolved",
    "system",
)

INDEXES: list[tuple[str, str, list[str]]] = [
    ("ix_forum_replies_parent", "forum_replies", ["parent_id"]),
    ("ix_library_items_uploaded_by", "library_items", ["uploaded_by"]),
    ("ix_library_items_reviewed_by", "library_items", ["reviewed_by"]),
    ("ix_notifications_actor", "notifications", ["actor_id"]),
    ("ix_reports_target", "reports", ["target_type", "target_id"]),
    ("ix_reports_resolved_by", "reports", ["resolved_by"]),
    ("ix_audit_log_actor", "audit_log", ["actor_id"]),
    ("ix_calendar_events_created_by", "calendar_events", ["created_by"]),
    ("ix_newsletter_issues_created_by", "newsletter_issues", ["created_by"]),
    ("ix_email_outbox_notification", "email_outbox", ["notification_id"]),
]


POSTS = ("forum_threads", "forum_replies")
# the old marker of a hidden post whose text was deleted (a lone space as its body) becomes deleted_at, and every
# deleted post gets one
UPGRADE_POSTS = [
    "UPDATE forum_threads SET deleted_at = now(), body = '' WHERE status = 'hidden' AND body = ' '",
    "UPDATE forum_threads SET deleted_at = now() WHERE status = 'deleted'",
    "UPDATE forum_replies SET deleted_at = now(), body = '' WHERE status = 'hidden' AND body = ' '",
    "UPDATE forum_replies SET deleted_at = now() WHERE status = 'deleted'",
]
DOWNGRADE_POSTS = [
    "UPDATE forum_threads SET body = ' ' WHERE status = 'hidden' AND deleted_at IS NOT NULL",
    "UPDATE forum_replies SET body = ' ' WHERE status = 'hidden' AND deleted_at IS NOT NULL",
]


def upgrade() -> None:
    op.drop_index("ix_forum_threads_status_activity", table_name="forum_threads")
    for name, table, columns in INDEXES:
        op.create_index(name, table, columns, unique=False)

    for table in POSTS:
        op.add_column(table, sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True))
    for statement in UPGRADE_POSTS:
        op.execute(statement)

    kinds = ", ".join(f"'{k}'" for k in KINDS)
    op.create_check_constraint(op.f("ck_notifications_kind"), "notifications", f"kind IN ({kinds})")

    op.drop_column("users", "updated_at")


def downgrade() -> None:
    op.add_column("users", sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True))

    op.drop_constraint(op.f("ck_notifications_kind"), "notifications", type_="check")

    for statement in DOWNGRADE_POSTS:
        op.execute(statement)
    for table in POSTS:
        op.drop_column(table, "deleted_at")

    for name, table, _ in reversed(INDEXES):
        op.drop_index(name, table_name=table)
    op.create_index("ix_forum_threads_status_activity", "forum_threads", ["status", "last_activity_at"], unique=False)
