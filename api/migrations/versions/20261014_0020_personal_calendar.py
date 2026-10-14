"""each student's own calendar: their events, what they hide, their private feed; reminders; board cards for them

Revision ID: 0020
Revises: 0018
Create Date: 2026-10-14 23:50:00

A student's own events (personal_events) and their calendar settings (calendar_prefs). Reminders arrive as
event_reminder notifications, and a study-board card may point at one of their own events (my_event), so both
CHECKs widen.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0020"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

KINDS = (
    "thread_reply",
    "reply_reply",
    "answer_accepted",
    "followed_reply",
    "followed_answer",
    "senior_question",
    "upload_published",
    "upload_rejected",
    "new_issue",
    "report_resolved",
    "request_update",
    "date_changed",
    "video_suggestion",
    "system",
)
LINKS = ("event", "lesson", "module", "library_item")


def _in(column: str, values: Sequence[str]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


def _checks(kinds: Sequence[str], links: Sequence[str]) -> None:
    op.drop_constraint(op.f("ck_notifications_kind"), "notifications", type_="check")
    op.create_check_constraint(op.f("ck_notifications_kind"), "notifications", _in("kind", kinds))
    op.drop_constraint(op.f("ck_board_cards_link_type"), "board_cards", type_="check")
    op.create_check_constraint(op.f("ck_board_cards_link_type"), "board_cards", _in("link_type", links))


def upgrade() -> None:
    op.create_table(
        "personal_events",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("start_time", sa.Time(), nullable=True),
        sa.Column("end_time", sa.Time(), nullable=True),
        sa.Column("place", sa.String(length=120), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("colour", sa.String(length=16), server_default="violet", nullable=False),
        sa.Column("repeat", sa.String(length=8), server_default="none", nullable=False),
        sa.Column("repeat_until", sa.Date(), nullable=True),
        sa.Column("remind", sa.SmallInteger(), nullable=True),
        sa.Column("reminded_for", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("end_date IS NULL OR end_date >= date", name=op.f("ck_personal_events_end_after_start")),
        sa.CheckConstraint(
            "start_time IS NOT NULL OR end_time IS NULL", name=op.f("ck_personal_events_end_time_needs_start")
        ),
        sa.CheckConstraint(
            "end_time IS NULL OR end_time > start_time", name=op.f("ck_personal_events_end_time_after_start")
        ),
        sa.CheckConstraint(
            "repeat_until IS NULL OR repeat_until >= date", name=op.f("ck_personal_events_repeat_until_after_start")
        ),
        sa.CheckConstraint(
            "colour IN ('violet', 'teal', 'green', 'orange', 'rose', 'slate')", name=op.f("ck_personal_events_colour")
        ),
        sa.CheckConstraint("repeat IN ('none', 'daily', 'weekly')", name=op.f("ck_personal_events_repeat")),
        sa.CheckConstraint("remind IS NULL OR remind IN (0, 10, 30, 60, 1440)", name=op.f("ck_personal_events_remind")),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_personal_events_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_personal_events")),
    )
    op.create_index("ix_personal_events_user_date", "personal_events", ["user_id", "date"], unique=False)
    op.create_index(
        "ix_personal_events_reminders",
        "personal_events",
        ["date"],
        unique=False,
        postgresql_where=sa.text("remind IS NOT NULL"),
    )
    op.create_table(
        "calendar_prefs",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("hidden_events", postgresql.ARRAY(sa.String(length=120)), server_default="{}", nullable=False),
        sa.Column("hidden_modules", postgresql.ARRAY(sa.String(length=64)), server_default="{}", nullable=False),
        sa.Column("hidden_types", postgresql.ARRAY(sa.String(length=16)), server_default="{}", nullable=False),
        sa.Column("feed_salt", sa.String(length=32), nullable=True),
        sa.Column("feed_hash", sa.String(length=64), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_calendar_prefs_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id", name=op.f("pk_calendar_prefs")),
        sa.UniqueConstraint("feed_hash", name=op.f("uq_calendar_prefs_feed_hash")),
    )
    _checks((*KINDS[:-2], "event_reminder", *KINDS[-2:]), ("event", "my_event", *LINKS[1:]))


def downgrade() -> None:
    op.execute("DELETE FROM notifications WHERE kind = 'event_reminder'")
    op.execute("DELETE FROM board_cards WHERE link_type = 'my_event'")
    _checks(KINDS, LINKS)
    op.drop_table("calendar_prefs")
    op.drop_index(
        "ix_personal_events_reminders", table_name="personal_events", postgresql_where=sa.text("remind IS NOT NULL")
    )
    op.drop_index("ix_personal_events_user_date", table_name="personal_events")
    op.drop_table("personal_events")
