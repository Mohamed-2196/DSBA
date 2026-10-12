"""email_outbox: notification emails and account notices for the mail worker; one email switch per kind

Revision ID: 0003
Revises: 0002
Create Date: 2026-10-12 16:00:00

Round 2, decision D1: the notifications that matter also go out by email, through an outbox that
`python -m app.cli mail-worker` drains (retries with backoff; several workers can share it, FOR UPDATE SKIP LOCKED).

Preferences: "email me about replies, accepted answers and upload reviews" (email_notifications) and "about new
issues" (newsletter_emails) become one switch per kind: email_replies, email_answer_accepted, email_upload_reviews
and email_new_issues. Every switch defaults to on, so only a choice of "off" is stored; each person keeps theirs.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0003"
down_revision: str | None = "0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# Old keys, in either spelling the app ever wrote, to the new ones.
UPGRADE_PREFERENCES = """
UPDATE users SET preferences =
    (preferences - 'email_notifications' - 'newsletter_emails' - 'emailNotifications' - 'newsletterEmails')
    || CASE WHEN preferences @> '{"email_notifications": false}' OR preferences @> '{"emailNotifications": false}'
            THEN '{"email_replies": false, "email_answer_accepted": false, "email_upload_reviews": false}'::jsonb
            ELSE '{}'::jsonb END
    || CASE WHEN preferences @> '{"newsletter_emails": false}' OR preferences @> '{"newsletterEmails": false}'
            THEN '{"email_new_issues": false}'::jsonb
            ELSE '{}'::jsonb END
WHERE jsonb_exists_any(preferences,
                       ARRAY['email_notifications', 'newsletter_emails', 'emailNotifications', 'newsletterEmails'])
"""

DOWNGRADE_PREFERENCES = """
UPDATE users SET preferences =
    (preferences - 'email_replies' - 'email_answer_accepted' - 'email_upload_reviews' - 'email_new_issues')
    || CASE WHEN preferences @> '{"email_replies": false}' OR preferences @> '{"email_answer_accepted": false}'
                 OR preferences @> '{"email_upload_reviews": false}'
            THEN '{"email_notifications": false}'::jsonb
            ELSE '{}'::jsonb END
    || CASE WHEN preferences @> '{"email_new_issues": false}' THEN '{"newsletter_emails": false}'::jsonb
            ELSE '{}'::jsonb END
WHERE jsonb_exists_any(preferences,
                       ARRAY['email_replies', 'email_answer_accepted', 'email_upload_reviews', 'email_new_issues'])
"""


def upgrade() -> None:
    op.create_table(
        "email_outbox",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column("notification_id", sa.UUID(), nullable=True),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("to_address", sa.String(length=254), nullable=False),
        sa.Column("subject", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "pending",
                "sent",
                "failed",
                "cancelled",
                name="outboxstatus",
                native_enum=False,
                create_constraint=True,
                length=10,
            ),
            nullable=False,
        ),
        sa.Column("attempts", sa.SmallInteger(), server_default="0", nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_error", sa.String(length=200), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["notification_id"],
            ["notifications.id"],
            name=op.f("fk_email_outbox_notification_id_notifications"),
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_email_outbox_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_email_outbox")),
    )
    op.create_index(
        "ix_email_outbox_due",
        "email_outbox",
        ["next_attempt_at"],
        unique=False,
        postgresql_where=sa.text("status = 'pending'"),
    )
    op.create_index("ix_email_outbox_user", "email_outbox", ["user_id"], unique=False)
    op.create_index("ix_email_outbox_created", "email_outbox", ["created_at"], unique=False)
    op.execute(UPGRADE_PREFERENCES)


def downgrade() -> None:
    op.execute(DOWNGRADE_PREFERENCES)
    op.drop_index("ix_email_outbox_created", table_name="email_outbox")
    op.drop_index("ix_email_outbox_user", table_name="email_outbox")
    op.drop_index("ix_email_outbox_due", table_name="email_outbox", postgresql_where=sa.text("status = 'pending'"))
    op.drop_table("email_outbox")
