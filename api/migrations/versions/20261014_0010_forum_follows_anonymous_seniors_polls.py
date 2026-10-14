"""forum follows, threads without a name, seniors who answer and newsletter polls, with their four switches

Revision ID: 0010
Revises: 0006
Create Date: 2026-10-14 12:00:00

Following a thread and a senior's question send new notifications (followed_reply, followed_answer,
senior_question), so the notifications CHECK widens. The four features arrive switched off: an admin switches them
on from the Access screen.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0010"
down_revision: str | None = "0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

KINDS = (
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
NEW_KINDS = ("followed_reply", "followed_answer", "senior_question")


def _kinds(kinds: Sequence[str]) -> None:
    op.drop_constraint(op.f("ck_notifications_kind"), "notifications", type_="check")
    listed = ", ".join(repr(k) for k in kinds)
    op.create_check_constraint(op.f("ck_notifications_kind"), "notifications", f"kind IN ({listed})")


def upgrade() -> None:
    op.add_column("forum_threads", sa.Column("anonymous", sa.Boolean(), server_default="false", nullable=False))
    op.create_table(
        "forum_follows",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("thread_id", sa.UUID(), nullable=False),
        sa.Column("level", sa.String(length=10), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("level IN ('answers', 'replies', 'off')", name=op.f("ck_forum_follows_level")),
        sa.ForeignKeyConstraint(
            ["thread_id"],
            ["forum_threads.id"],
            name=op.f("fk_forum_follows_thread_id_forum_threads"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_forum_follows_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id", "thread_id", name=op.f("pk_forum_follows")),
    )
    op.create_index("ix_forum_follows_thread", "forum_follows", ["thread_id"], unique=False)
    op.create_table(
        "newsletter_poll_votes",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("issue_id", sa.UUID(), nullable=False),
        sa.Column("poll_id", sa.String(length=64), nullable=False),
        sa.Column("choice", sa.SmallInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["issue_id"],
            ["newsletter_issues.id"],
            name=op.f("fk_newsletter_poll_votes_issue_id_newsletter_issues"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_newsletter_poll_votes_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id", "issue_id", "poll_id", name=op.f("pk_newsletter_poll_votes")),
    )
    op.create_table(
        "senior_profiles",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("topics", postgresql.ARRAY(sa.String(length=32)), server_default="{}", nullable=False),
        sa.Column("note", sa.String(length=140), server_default="", nullable=False),
        sa.Column("paused", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_senior_profiles_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_senior_profiles")),
    )
    _kinds((*KINDS, *NEW_KINDS))
    op.execute(
        "INSERT INTO feature_switches (feature, mode) VALUES "
        "('forum.anonymous', 'off'), ('forum.follow', 'off'), ('newsletter.polls', 'off'), ('career.seniors', 'off')"
    )


def downgrade() -> None:
    op.execute(
        "DELETE FROM feature_switch_roles "
        "WHERE feature IN ('forum.anonymous', 'forum.follow', 'newsletter.polls', 'career.seniors')"
    )
    op.execute(
        "DELETE FROM feature_switches "
        "WHERE feature IN ('forum.anonymous', 'forum.follow', 'newsletter.polls', 'career.seniors')"
    )
    op.execute("DELETE FROM notifications WHERE kind IN ('followed_reply', 'followed_answer', 'senior_question')")
    _kinds(KINDS)
    op.drop_table("senior_profiles")
    op.drop_table("newsletter_poll_votes")
    op.drop_index("ix_forum_follows_thread", table_name="forum_follows")
    op.drop_table("forum_follows")
    op.drop_column("forum_threads", "anonymous")
