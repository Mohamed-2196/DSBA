"""suggested videos: video_suggestions, the video_suggestion notification and its switch (off)

Revision ID: 0015
Revises: 0014
Create Date: 2026-10-14 21:00:00

Students suggest videos for a module's chapters; content managers accept them as lessons or decline them.
The feature arrives switched off: an admin switches it on from the Access screen.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0015"
down_revision: str | None = "0014"
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
)


def _kinds(kinds: Sequence[str]) -> None:
    op.drop_constraint(op.f("ck_notifications_kind"), "notifications", type_="check")
    op.create_check_constraint(
        op.f("ck_notifications_kind"), "notifications", f"kind IN ({', '.join(repr(k) for k in kinds)})"
    )


def upgrade() -> None:
    op.create_table(
        "video_suggestions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("author_id", sa.UUID(), nullable=True),
        sa.Column("module_id", sa.String(length=64), nullable=False),
        sa.Column("chapter_id", sa.String(length=16), nullable=True),
        sa.Column("kind", sa.String(length=20), nullable=False),
        sa.Column("video_id", sa.String(length=64), nullable=True),
        sa.Column("url", sa.String(length=500), nullable=True),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("reason", sa.Text(), server_default="", nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "pending",
                "accepted",
                "declined",
                name="suggestionstatus",
                native_enum=False,
                create_constraint=True,
                length=10,
            ),
            server_default="pending",
            nullable=False,
        ),
        sa.Column("reply", sa.Text(), nullable=True),
        sa.Column("lesson_id", sa.String(length=16), nullable=True),
        sa.Column("decided_by", sa.UUID(), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("kind IN ('youtube', 'youtube-playlist', 'bbb')", name=op.f("ck_video_suggestions_kind")),
        sa.ForeignKeyConstraint(
            ["author_id"], ["users.id"], name=op.f("fk_video_suggestions_author_id_users"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["chapter_id"], ["chapters.id"], name=op.f("fk_video_suggestions_chapter_id_chapters"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["decided_by"], ["users.id"], name=op.f("fk_video_suggestions_decided_by_users"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["lesson_id"], ["lessons.id"], name=op.f("fk_video_suggestions_lesson_id_lessons"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["module_id"], ["modules.id"], name=op.f("fk_video_suggestions_module_id_modules"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_video_suggestions")),
    )
    op.create_index(
        "ix_video_suggestions_author_created", "video_suggestions", ["author_id", "created_at"], unique=False
    )
    op.create_index("ix_video_suggestions_chapter", "video_suggestions", ["chapter_id"], unique=False)
    op.create_index("ix_video_suggestions_decided_by", "video_suggestions", ["decided_by"], unique=False)
    op.create_index("ix_video_suggestions_lesson", "video_suggestions", ["lesson_id"], unique=False)
    op.create_index("ix_video_suggestions_module", "video_suggestions", ["module_id"], unique=False)
    op.create_index(
        "ix_video_suggestions_queue",
        "video_suggestions",
        ["created_at"],
        unique=False,
        postgresql_where=sa.text("status = 'pending'"),
    )
    _kinds((*NOTIFICATION_KINDS, "video_suggestion"))
    op.get_bind().execute(sa.text("INSERT INTO feature_switches (feature, mode) VALUES ('video_suggestions', 'off')"))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM feature_switch_roles WHERE feature = 'video_suggestions'"))
    conn.execute(sa.text("DELETE FROM feature_switches WHERE feature = 'video_suggestions'"))
    conn.execute(sa.text("DELETE FROM notifications WHERE kind = 'video_suggestion'"))
    _kinds(NOTIFICATION_KINDS)
    op.drop_index(
        "ix_video_suggestions_queue", table_name="video_suggestions", postgresql_where=sa.text("status = 'pending'")
    )
    op.drop_index("ix_video_suggestions_module", table_name="video_suggestions")
    op.drop_index("ix_video_suggestions_lesson", table_name="video_suggestions")
    op.drop_index("ix_video_suggestions_decided_by", table_name="video_suggestions")
    op.drop_index("ix_video_suggestions_chapter", table_name="video_suggestions")
    op.drop_index("ix_video_suggestions_author_created", table_name="video_suggestions")
    op.drop_table("video_suggestions")
