"""Web push: the browsers that asked for notifications, and the pushes waiting for them

Revision ID: 0065
Revises: 0064
Create Date: 2026-11-08 20:00:00

One row per browser that turned on "Notifications on this device", tied to the signed-in session that did it (gone
with it), and an outbox of pushes the mail worker sends, one row per browser (app/models/push.py). Nobody has a
subscription yet, so nothing is sent until someone turns it on.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0065"
down_revision: str | None = "0064"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "push_subscriptions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("session_id", sa.UUID(), nullable=False),
        sa.Column("endpoint", sa.String(1000), nullable=False),
        sa.Column("p256dh", sa.String(100), nullable=False),
        sa.Column("auth", sa.String(40), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_success_at", sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint("id", name="pk_push_subscriptions"),
        sa.UniqueConstraint("endpoint", name="uq_push_subscriptions_endpoint"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_push_subscriptions_user_id_users", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["session_id"],
            ["user_sessions.id"],
            name="fk_push_subscriptions_session_id_user_sessions",
            ondelete="CASCADE",
        ),
    )
    op.create_index("ix_push_subscriptions_user", "push_subscriptions", ["user_id"])
    op.create_index("ix_push_subscriptions_session", "push_subscriptions", ["session_id"])

    op.create_table(
        "push_outbox",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("subscription_id", sa.UUID()),
        sa.Column("notification_id", sa.UUID()),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("payload", postgresql.JSONB(), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("attempts", sa.SmallInteger(), server_default="0", nullable=False),
        sa.Column("next_attempt_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_error", sa.String(200)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint("id", name="pk_push_outbox"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_push_outbox_user_id_users", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["subscription_id"],
            ["push_subscriptions.id"],
            name="fk_push_outbox_subscription_id_push_subscriptions",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["notification_id"],
            ["notifications.id"],
            name="fk_push_outbox_notification_id_notifications",
            ondelete="CASCADE",
        ),
        sa.CheckConstraint(
            "status IN ('pending', 'sent', 'failed', 'cancelled')", name=op.f("ck_push_outbox_outboxstatus")
        ),
    )
    op.create_index(
        "ix_push_outbox_due", "push_outbox", ["next_attempt_at"], postgresql_where=sa.text("status = 'pending'")
    )
    op.create_index("ix_push_outbox_user", "push_outbox", ["user_id"])
    op.create_index("ix_push_outbox_subscription", "push_outbox", ["subscription_id"])
    op.create_index("ix_push_outbox_notification", "push_outbox", ["notification_id"])
    op.create_index("ix_push_outbox_created", "push_outbox", ["created_at"])


def downgrade() -> None:
    op.drop_table("push_outbox")
    op.drop_table("push_subscriptions")
