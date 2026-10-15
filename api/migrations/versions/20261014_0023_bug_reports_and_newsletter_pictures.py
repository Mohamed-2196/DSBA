"""bug reports, their screenshots and the bug_report notification; newsletter pictures

Revision ID: 0023
Revises: 0018
Create Date: 2026-10-15 09:00:00

Anyone may report a bug; admins triage the reports in Manage and hear of each new one in the hub. A signed-in
reporter may attach a screenshot, and newsletter managers upload an issue's cover art and figures: two new upload
purposes, each attached to what shows it.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0023"
down_revision: str | None = "0020"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NOTIFICATION_KINDS = (
    "thread_reply",
    "reply_reply",
    "answer_accepted",
    "upload_published",
    "upload_rejected",
    "new_issue",
    "report_resolved",
    "request_update",
    "date_changed",
    "system",
    "followed_reply",
    "followed_answer",
    "senior_question",
    "video_suggestion",
    "board_reminder",
    "event_reminder",
)
UPLOAD_PURPOSES = ("library", "forum_image", "board")
NEW_PURPOSES = ("newsletter_image", "bug_screenshot")


def _check(table: str, name: str, column: str, values: Sequence[str]) -> None:
    op.drop_constraint(op.f(name), table, type_="check")
    op.create_check_constraint(op.f(name), table, f"{column} IN ({', '.join(repr(v) for v in values)})")


def upgrade() -> None:
    op.create_table(
        "bug_reports",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("ip", postgresql.INET(), nullable=True),
        sa.Column("what_happened", sa.Text(), nullable=False),
        sa.Column("expected", sa.Text(), server_default="", nullable=False),
        sa.Column("page_url", sa.String(length=500), nullable=False),
        sa.Column("app_version", sa.String(length=40), nullable=False),
        sa.Column("browser", sa.String(length=300), server_default="", nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "open", "fixed", "wont_fix", name="bugstatus", native_enum=False, create_constraint=True, length=10
            ),
            server_default="open",
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_by", sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(
            ["resolved_by"], ["users.id"], name=op.f("fk_bug_reports_resolved_by_users"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_bug_reports_user_id_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_bug_reports")),
    )
    op.create_index("ix_bug_reports_resolved_by", "bug_reports", ["resolved_by"], unique=False)
    op.create_index("ix_bug_reports_status_created", "bug_reports", ["status", "created_at"], unique=False)
    op.create_index("ix_bug_reports_user_created", "bug_reports", ["user_id", "created_at"], unique=False)

    op.add_column("uploads", sa.Column("newsletter_issue_id", sa.UUID(), nullable=True))
    op.add_column("uploads", sa.Column("bug_report_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        op.f("fk_uploads_newsletter_issue_id_newsletter_issues"),
        "uploads",
        "newsletter_issues",
        ["newsletter_issue_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        op.f("fk_uploads_bug_report_id_bug_reports"),
        "uploads",
        "bug_reports",
        ["bug_report_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_uploads_newsletter_issue", "uploads", ["newsletter_issue_id"], unique=False)
    op.create_index("ix_uploads_bug_report", "uploads", ["bug_report_id"], unique=False)
    _check("uploads", "ck_uploads_uploadpurpose", "purpose", (*UPLOAD_PURPOSES, *NEW_PURPOSES))
    _check("notifications", "ck_notifications_kind", "kind", (*NOTIFICATION_KINDS, "bug_report"))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM notifications WHERE kind = 'bug_report'"))
    _check("notifications", "ck_notifications_kind", "kind", NOTIFICATION_KINDS)
    conn.execute(sa.text("DELETE FROM uploads WHERE purpose IN ('newsletter_image', 'bug_screenshot')"))
    _check("uploads", "ck_uploads_uploadpurpose", "purpose", UPLOAD_PURPOSES)
    op.drop_index("ix_uploads_bug_report", table_name="uploads")
    op.drop_index("ix_uploads_newsletter_issue", table_name="uploads")
    op.drop_constraint(op.f("fk_uploads_bug_report_id_bug_reports"), "uploads", type_="foreignkey")
    op.drop_constraint(op.f("fk_uploads_newsletter_issue_id_newsletter_issues"), "uploads", type_="foreignkey")
    op.drop_column("uploads", "bug_report_id")
    op.drop_column("uploads", "newsletter_issue_id")
    op.drop_index("ix_bug_reports_user_created", table_name="bug_reports")
    op.drop_index("ix_bug_reports_status_created", table_name="bug_reports")
    op.drop_index("ix_bug_reports_resolved_by", table_name="bug_reports")
    op.drop_table("bug_reports")
