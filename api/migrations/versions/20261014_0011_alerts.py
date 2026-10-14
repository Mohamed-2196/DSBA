"""alerts: date_changed notifications, the Sunday summary's weekly_summaries, its switch (off) and summary.share for Rep

Revision ID: 0011
Revises: 0006
Create Date: 2026-10-14 18:00:00

A rep's change to an exam, mock or deadline now sends a date_changed notification, so the kinds CHECK widens. The
Sunday summary arrives switched off: an admin switches it on from the Access screen.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0011"
down_revision: str | None = "0006"
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
    "system",
)


def _kinds(kinds: Sequence[str]) -> None:
    op.drop_constraint(op.f("ck_notifications_kind"), "notifications", type_="check")
    op.create_check_constraint(
        op.f("ck_notifications_kind"), "notifications", f"kind IN ({', '.join(repr(k) for k in kinds)})"
    )


def upgrade() -> None:
    op.create_table(
        "weekly_summaries",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("week_of", sa.Date(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_weekly_summaries_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id", "week_of", name=op.f("pk_weekly_summaries")),
    )
    _kinds((*NOTIFICATION_KINDS[:-1], "date_changed", "system"))
    conn = op.get_bind()
    conn.execute(
        sa.text("INSERT INTO role_boxes (role_id, box) SELECT id, 'summary.share' FROM roles WHERE slug = 'rep'")
    )
    conn.execute(sa.text("INSERT INTO feature_switches (feature, mode) VALUES ('summary', 'off')"))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM feature_switch_roles WHERE feature = 'summary'"))
    conn.execute(sa.text("DELETE FROM feature_switches WHERE feature = 'summary'"))
    conn.execute(sa.text("DELETE FROM role_boxes WHERE box = 'summary.share'"))
    conn.execute(sa.text("DELETE FROM notifications WHERE kind = 'date_changed'"))
    _kinds(NOTIFICATION_KINDS)
    op.drop_table("weekly_summaries")
