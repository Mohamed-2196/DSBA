"""The whole schema, and the rows the API needs before anyone signs in

Revision ID: 0033
Revises:
Create Date: 2026-10-18 12:00:00

Every table, area by area, in the order their foreign keys need. Then the rows the API can't run without: the
ready-made roles and their boxes, a switch for every feature (the main areas on for everyone, the rest off until an
admin switches them on), Mini Noora's limits, and the forum's categories and tags. The content (modules, lessons, the
calendar, Daily's themes, ...) comes from `python -m app.cli seed`, which leaves these rows alone once admins change
them.

Every name is written out. A CHECK's name goes through op.f(), so the models' naming convention doesn't prefix it a
second time.
"""

from __future__ import annotations

import uuid
from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0033"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

# ── what the CHECK constraints allow ─────────────────────────────────────────────────────────

ZONES = ("A", "B", "RTC")
LIBRARY_KINDS = (
    "past-paper",
    "examiners-report",
    "exam-solutions",
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
WANTED_KINDS = (  # what a paper request asks for: any library kind
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
    "exam-solutions",
)
VIDEO_KINDS = ("youtube", "youtube-playlist", "bbb")  # lessons and suggested videos
POST_STATUSES = ("visible", "hidden", "deleted")  # threads and replies
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
    "bug_report",
)
UPLOAD_PURPOSES = (
    "library",
    "forum_image",
    "board",
    "note_file",
    "career_logo",
    "newsletter_image",
    "bug_screenshot",
    "module_art",
)
BOARD_COLOURS = ("cobalt", "teal", "green", "amber", "coral", "slate")  # boards and their labels
GAMES = ("word", "groups", "search", "quiz", "nearest", "sudoku")

# ── the rows every database starts with ──────────────────────────────────────────────────────

ROLES = (  # slug, name, badge, built in, locked; listed in this order
    ("admin", "Admin", "Admin", True, True),
    ("rep", "Rep", "Student rep", True, False),
    ("student", "Student", None, True, False),
    ("newsletter-manager", "Newsletter manager", "Newsletter", False, False),
    ("content-manager", "Content manager", "Content", False, False),
)
BOXES = {  # Admin holds every box without listing them
    "student": ("forum.post", "library.upload", "newsletter.react", "reports.create"),
    "rep": (
        "forum.moderate",
        "library.manage",
        "newsletter.manage",
        "calendar.manage",
        "stats.view",
        "requests.manage",
        "summary.share",
        "guides.edit",
    ),
    "newsletter-manager": ("newsletter.manage",),
    "content-manager": ("calendar.manage", "career.edit", "content.edit", "guides.edit"),
}
ON_FOR_EVERYONE = ("forum", "library", "library.uploads", "newsletter", "calendar", "career", "grades", "noora")
SWITCHED_OFF = (
    "notes",
    "board",
    "requests",
    "forum.anonymous",
    "forum.follow",
    "newsletter.polls",
    "career.seniors",
    "noora.ai",
    "library.questions",
    "summary",
    "requests.autoclose",
    "forum.help-below",
    "video_suggestions",
    "library.daily-question",
    "requests.done",
    "daily",
)
FORUM_CATEGORIES = (  # id, label, short label, cohort, blurb, icon; listed in this order
    ("year-1", "Year 1", "Year 1", 1, "Maths, statistics, economics and business", None),
    ("year-2", "Year 2", "Year 2", 2, "Distribution theory, inference, programming and more", None),
    ("year-3", "Year 3", "Year 3", 3, "Machine learning, asset pricing and more", None),
    ("study-groups", "Study groups", "Study group", None, "Find people to revise with", "people"),
    ("general", "General", "General", None, "Exams, campus and everything else", "chat"),
)
FORUM_TAGS = (  # id, label; listed in this order
    ("exam-prep", "Exam prep"),
    ("past-papers", "Past papers"),
    ("coursework", "Coursework"),
    ("formula-sheet", "Formula sheets"),
    ("r", "R"),
    ("python", "Python"),
    ("excel", "Excel"),
    ("exams", "Exam rules"),
    ("calculators", "Calculators"),
    ("module-choice", "Module choice"),
    ("campus", "Campus"),
    ("lost-and-found", "Lost and found"),
)


# ── shapes used again and again ──────────────────────────────────────────────────────────────


def _in(column: str, values: Sequence[str]) -> str:
    """A CHECK's condition: the column holds one of the values."""
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


def _year_range(column: str) -> str:
    """A CHECK's condition: a cohort, Year 1, 2 or 3, or none."""
    return f"{column} IS NULL OR {column} BETWEEN 1 AND 3"


def _now(name: str) -> sa.Column[Any]:
    """A time the database fills in when the row is made."""
    return sa.Column(name, sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False)


def _at(name: str) -> sa.Column[Any]:
    """A time, empty until it happens."""
    return sa.Column(name, sa.DateTime(timezone=True))


def _flag(name: str) -> sa.Column[Any]:
    """Yes or no, no until set."""
    return sa.Column(name, sa.Boolean(), server_default="false", nullable=False)


# ── the schema ───────────────────────────────────────────────────────────────────────────────


def upgrade() -> None:
    _accounts()
    _modules()
    _calendar()
    _forum()
    _library()
    _newsletter()
    _notifications()
    _requests_and_reports()
    _boards()
    _uploads_and_notes()
    _noora()
    _daily()
    _seed()


def _accounts() -> None:
    """People, their sessions and sign-in codes; roles, boxes and feature switches; the audit log."""
    op.create_table(
        "users",
        sa.Column("id", sa.UUID()),
        sa.Column("email", sa.String(254)),
        sa.Column("phone", sa.String(20)),
        sa.Column("display_name", sa.String(60)),
        sa.Column("year", sa.SmallInteger()),
        sa.Column("status", sa.String(20), server_default="active", nullable=False),
        sa.Column("preferences", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        _now("created_at"),
        _at("last_seen_at"),
        sa.Column("papers", postgresql.ARRAY(sa.String(64)), server_default="{}", nullable=False),
        sa.Column("zone", sa.String(8)),
        sa.PrimaryKeyConstraint("id", name="pk_users"),
        sa.UniqueConstraint("email", name="uq_users_email"),
        sa.UniqueConstraint("phone", name="uq_users_phone"),
        sa.CheckConstraint("email IS NOT NULL OR phone IS NOT NULL", name=op.f("ck_users_has_identifier")),
        sa.CheckConstraint(_in("status", ("active", "suspended")), name=op.f("ck_users_userstatus")),
        sa.CheckConstraint(_year_range("year"), name=op.f("ck_users_year_range")),
        sa.CheckConstraint(_in("zone", ZONES), name=op.f("ck_users_zone")),
    )
    op.create_table(
        "user_sessions",
        sa.Column("id", sa.UUID()),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        _now("created_at"),
        _at("last_seen_at"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        _at("revoked_at"),
        sa.Column("ip", postgresql.INET()),
        sa.Column("user_agent", sa.String(300)),
        sa.PrimaryKeyConstraint("id", name="pk_user_sessions"),
        sa.UniqueConstraint("token_hash", name="uq_user_sessions_token_hash"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_user_sessions_user_id_users", ondelete="CASCADE"),
    )
    op.create_index("ix_user_sessions_user", "user_sessions", ["user_id"])
    op.create_table(
        "otp_challenges",
        sa.Column("id", sa.UUID()),
        sa.Column("purpose", sa.String(20), nullable=False),
        sa.Column("user_id", sa.UUID()),
        sa.Column("channel", sa.String(10), nullable=False),
        sa.Column("identifier", sa.String(254), nullable=False),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("attempts", sa.SmallInteger(), server_default="0", nullable=False),
        _now("created_at"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        _at("consumed_at"),
        sa.Column("ip", postgresql.INET()),
        sa.PrimaryKeyConstraint("id", name="pk_otp_challenges"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_otp_challenges_user_id_users", ondelete="CASCADE"),
        sa.CheckConstraint(_in("channel", ("email", "sms")), name=op.f("ck_otp_challenges_channel")),
        sa.CheckConstraint(_in("purpose", ("sign_in", "add_identifier")), name=op.f("ck_otp_challenges_otppurpose")),
    )
    op.create_index("ix_otp_challenges_identifier_created", "otp_challenges", ["identifier", "created_at"])
    op.create_index("ix_otp_challenges_ip_created", "otp_challenges", ["ip", "created_at"])
    op.create_index("ix_otp_challenges_user_created", "otp_challenges", ["user_id", "created_at"])
    op.create_table(
        "roles",
        sa.Column("id", sa.UUID()),
        sa.Column("slug", sa.String(64), nullable=False),
        sa.Column("name", sa.String(40), nullable=False),
        sa.Column("badge", sa.String(24)),
        sa.Column("position", sa.SmallInteger(), server_default="100", nullable=False),
        _flag("built_in"),
        _flag("locked"),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        _now("created_at"),
        _at("updated_at"),
        sa.PrimaryKeyConstraint("id", name="pk_roles"),
        sa.UniqueConstraint("name", name="uq_roles_name"),
        sa.UniqueConstraint("slug", name="uq_roles_slug"),
    )
    op.create_table(
        "role_boxes",
        sa.Column("role_id", sa.UUID()),
        sa.Column("box", sa.String(40)),
        sa.PrimaryKeyConstraint("role_id", "box", name="pk_role_boxes"),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], name="fk_role_boxes_role_id_roles", ondelete="CASCADE"),
    )
    op.create_table(
        "user_roles",
        sa.Column("user_id", sa.UUID()),
        sa.Column("role_id", sa.UUID()),
        sa.Column("given_by", sa.UUID()),
        _now("given_at"),
        sa.PrimaryKeyConstraint("user_id", "role_id", name="pk_user_roles"),
        sa.ForeignKeyConstraint(["given_by"], ["users.id"], name="fk_user_roles_given_by_users", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["role_id"], ["roles.id"], name="fk_user_roles_role_id_roles", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_user_roles_user_id_users", ondelete="CASCADE"),
    )
    op.create_index("ix_user_roles_given_by", "user_roles", ["given_by"])
    op.create_index("ix_user_roles_role", "user_roles", ["role_id"])
    op.create_table(
        "feature_switches",
        sa.Column("feature", sa.String(40)),
        sa.Column("mode", sa.String(10), server_default="everyone", nullable=False),
        sa.Column("updated_by", sa.UUID()),
        _at("updated_at"),
        sa.PrimaryKeyConstraint("feature", name="pk_feature_switches"),
        sa.ForeignKeyConstraint(
            ["updated_by"], ["users.id"], name="fk_feature_switches_updated_by_users", ondelete="SET NULL"
        ),
        sa.CheckConstraint(_in("mode", ("off", "roles", "everyone")), name=op.f("ck_feature_switches_mode")),
    )
    op.create_index("ix_feature_switches_updated_by", "feature_switches", ["updated_by"])
    op.create_table(
        "feature_switch_roles",
        sa.Column("feature", sa.String(40)),
        sa.Column("role_id", sa.UUID()),
        sa.PrimaryKeyConstraint("feature", "role_id", name="pk_feature_switch_roles"),
        sa.ForeignKeyConstraint(
            ["feature"],
            ["feature_switches.feature"],
            name="fk_feature_switch_roles_feature_feature_switches",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["role_id"], ["roles.id"], name="fk_feature_switch_roles_role_id_roles", ondelete="CASCADE"
        ),
    )
    op.create_index("ix_feature_switch_roles_role", "feature_switch_roles", ["role_id"])
    op.create_table(
        "audit_log",
        sa.Column("id", sa.BigInteger()),
        sa.Column("actor_id", sa.UUID()),
        sa.Column("action", sa.String(64), nullable=False),
        sa.Column("target_type", sa.String(32)),
        sa.Column("target_id", sa.String(64)),
        sa.Column("data", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("ip", postgresql.INET()),
        _now("created_at"),
        sa.PrimaryKeyConstraint("id", name="pk_audit_log"),
        sa.ForeignKeyConstraint(["actor_id"], ["users.id"], name="fk_audit_log_actor_id_users", ondelete="SET NULL"),
    )
    op.create_index("ix_audit_log_actor", "audit_log", ["actor_id"])
    op.create_index("ix_audit_log_created", "audit_log", ["created_at"])


def _modules() -> None:
    """Modules, their chapters and lessons, who watched what, suggested videos; the documents edited in Manage."""
    op.create_table(
        "modules",
        sa.Column("id", sa.String(64)),
        sa.Column("unit_code", sa.String(16)),
        sa.Column("name", sa.String(120), nullable=False),
        sa.Column("short_name", sa.String(60), nullable=False),
        sa.Column("year", sa.SmallInteger(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("icon", sa.String(40)),
        sa.Column("position", sa.Integer(), nullable=False),
        _at("updated_at"),
        _flag("hidden"),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("art", sa.String(500)),
        sa.PrimaryKeyConstraint("id", name="pk_modules"),
        sa.CheckConstraint("year BETWEEN 1 AND 3", name=op.f("ck_modules_year_range")),
    )
    op.create_table(
        "chapters",
        sa.Column("id", sa.String(16)),
        sa.Column("module_id", sa.String(64), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("audio_url", sa.String(500)),
        _flag("hidden"),
        sa.PrimaryKeyConstraint("id", name="pk_chapters"),
        sa.ForeignKeyConstraint(
            ["module_id"], ["modules.id"], name="fk_chapters_module_id_modules", ondelete="CASCADE"
        ),
    )
    op.create_index("ix_chapters_module_position", "chapters", ["module_id", "position"])
    op.create_table(
        "lessons",
        sa.Column("id", sa.String(16)),
        sa.Column("module_id", sa.String(64), nullable=False),
        sa.Column("chapter_id", sa.String(16), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("video_id", sa.String(64)),
        sa.Column("url", sa.String(500)),
        sa.Column("title", sa.String(200)),
        sa.Column("channel", sa.String(120)),
        _flag("unavailable"),
        _flag("hidden"),
        sa.PrimaryKeyConstraint("id", name="pk_lessons"),
        sa.ForeignKeyConstraint(
            ["chapter_id"], ["chapters.id"], name="fk_lessons_chapter_id_chapters", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["module_id"], ["modules.id"], name="fk_lessons_module_id_modules", ondelete="CASCADE"),
        sa.CheckConstraint(_in("kind", VIDEO_KINDS), name=op.f("ck_lessons_kind")),
    )
    op.create_index("ix_lessons_chapter_position", "lessons", ["chapter_id", "position"])
    op.create_index("ix_lessons_module", "lessons", ["module_id"])
    op.create_table(
        "lesson_views",
        sa.Column("user_id", sa.UUID()),
        sa.Column("lesson_id", sa.String(16)),
        _now("watched_at"),
        sa.PrimaryKeyConstraint("user_id", "lesson_id", name="pk_lesson_views"),
        sa.ForeignKeyConstraint(
            ["lesson_id"], ["lessons.id"], name="fk_lesson_views_lesson_id_lessons", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_lesson_views_user_id_users", ondelete="CASCADE"),
    )
    op.create_index("ix_lesson_views_lesson", "lesson_views", ["lesson_id"])
    op.create_table(
        "lesson_resume",
        sa.Column("user_id", sa.UUID()),
        sa.Column("module_id", sa.String(64)),
        sa.Column("lesson_id", sa.String(16), nullable=False),
        _now("opened_at"),
        sa.PrimaryKeyConstraint("user_id", "module_id", name="pk_lesson_resume"),
        sa.ForeignKeyConstraint(
            ["lesson_id"], ["lessons.id"], name="fk_lesson_resume_lesson_id_lessons", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["module_id"], ["modules.id"], name="fk_lesson_resume_module_id_modules", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_lesson_resume_user_id_users", ondelete="CASCADE"),
    )
    op.create_index("ix_lesson_resume_lesson", "lesson_resume", ["lesson_id"])
    op.create_table(
        "video_suggestions",
        sa.Column("id", sa.UUID()),
        sa.Column("author_id", sa.UUID()),
        sa.Column("module_id", sa.String(64), nullable=False),
        sa.Column("chapter_id", sa.String(16)),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("video_id", sa.String(64)),
        sa.Column("url", sa.String(500)),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("reason", sa.Text(), server_default="", nullable=False),
        sa.Column("status", sa.String(10), server_default="pending", nullable=False),
        sa.Column("reply", sa.Text()),
        sa.Column("lesson_id", sa.String(16)),
        sa.Column("decided_by", sa.UUID()),
        _at("decided_at"),
        _now("created_at"),
        sa.PrimaryKeyConstraint("id", name="pk_video_suggestions"),
        sa.ForeignKeyConstraint(
            ["author_id"], ["users.id"], name="fk_video_suggestions_author_id_users", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["chapter_id"], ["chapters.id"], name="fk_video_suggestions_chapter_id_chapters", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["decided_by"], ["users.id"], name="fk_video_suggestions_decided_by_users", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["lesson_id"], ["lessons.id"], name="fk_video_suggestions_lesson_id_lessons", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["module_id"], ["modules.id"], name="fk_video_suggestions_module_id_modules", ondelete="CASCADE"
        ),
        sa.CheckConstraint(_in("kind", VIDEO_KINDS), name=op.f("ck_video_suggestions_kind")),
        sa.CheckConstraint(
            _in("status", ("pending", "accepted", "declined")), name=op.f("ck_video_suggestions_suggestionstatus")
        ),
    )
    op.create_index("ix_video_suggestions_author_created", "video_suggestions", ["author_id", "created_at"])
    op.create_index("ix_video_suggestions_chapter", "video_suggestions", ["chapter_id"])
    op.create_index("ix_video_suggestions_decided_by", "video_suggestions", ["decided_by"])
    op.create_index("ix_video_suggestions_lesson", "video_suggestions", ["lesson_id"])
    op.create_index("ix_video_suggestions_module", "video_suggestions", ["module_id"])
    op.create_index(
        "ix_video_suggestions_queue",
        "video_suggestions",
        ["created_at"],
        postgresql_where=sa.text("status = 'pending'"),
    )
    op.create_table(
        "content_docs",
        sa.Column("key", sa.String(64)),
        sa.Column("data", postgresql.JSONB(), nullable=False),
        _now("updated_at"),
        sa.Column("updated_by", sa.UUID()),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.PrimaryKeyConstraint("key", name="pk_content_docs"),
        sa.ForeignKeyConstraint(
            ["updated_by"], ["users.id"], name="fk_content_docs_updated_by_users", ondelete="SET NULL"
        ),
    )


def _calendar() -> None:
    """The programme's calendar, and each student's own events and calendar settings."""
    op.create_table(
        "calendar_events",
        sa.Column("id", sa.String(120)),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date()),
        sa.Column("time", sa.String(40)),
        sa.Column("place", sa.String(120)),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("type", sa.String(16), nullable=False),
        sa.Column("year", sa.SmallInteger()),
        sa.Column("module_id", sa.String(64)),
        sa.Column("unit_code", sa.String(16)),
        _flag("sample"),
        sa.Column("created_by", sa.UUID()),
        _now("created_at"),
        _at("updated_at"),
        sa.Column("duration", sa.String(40)),
        sa.Column("rules", sa.String(300)),
        sa.Column("source", sa.String(300)),
        sa.Column("checked_on", sa.Date()),
        sa.Column("employer_id", sa.String(64)),
        sa.PrimaryKeyConstraint("id", name="pk_calendar_events"),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"], name="fk_calendar_events_created_by_users", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["module_id"], ["modules.id"], name="fk_calendar_events_module_id_modules", ondelete="SET NULL"
        ),
        sa.CheckConstraint("end_date IS NULL OR end_date >= date", name=op.f("ck_calendar_events_end_after_start")),
        sa.CheckConstraint(
            _in("type", ("exam", "mock", "revision", "deadline", "careers", "event", "break", "term")),
            name=op.f("ck_calendar_events_type"),
        ),
        sa.CheckConstraint(_year_range("year"), name=op.f("ck_calendar_events_year_range")),
    )
    op.create_index("ix_calendar_events_created_by", "calendar_events", ["created_by"])
    op.create_index("ix_calendar_events_date", "calendar_events", ["date"])
    op.create_table(
        "personal_events",
        sa.Column("id", sa.UUID()),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date()),
        sa.Column("start_time", sa.Time()),
        sa.Column("end_time", sa.Time()),
        sa.Column("place", sa.String(120)),
        sa.Column("notes", sa.Text()),
        sa.Column("colour", sa.String(16), server_default="violet", nullable=False),
        sa.Column("repeat", sa.String(8), server_default="none", nullable=False),
        sa.Column("repeat_until", sa.Date()),
        sa.Column("remind", sa.SmallInteger()),
        _at("reminded_for"),
        _now("created_at"),
        _now("updated_at"),
        sa.Column("skipped", postgresql.ARRAY(sa.Date()), server_default="{}", nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_personal_events"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_personal_events_user_id_users", ondelete="CASCADE"),
        sa.CheckConstraint(
            _in("colour", ("violet", "teal", "green", "orange", "rose", "slate")),
            name=op.f("ck_personal_events_colour"),
        ),
        sa.CheckConstraint("end_date IS NULL OR end_date >= date", name=op.f("ck_personal_events_end_after_start")),
        sa.CheckConstraint(
            "end_time IS NULL OR end_time > start_time", name=op.f("ck_personal_events_end_time_after_start")
        ),
        sa.CheckConstraint(
            "start_time IS NOT NULL OR end_time IS NULL", name=op.f("ck_personal_events_end_time_needs_start")
        ),
        sa.CheckConstraint("remind IS NULL OR remind IN (0, 10, 30, 60, 1440)", name=op.f("ck_personal_events_remind")),
        sa.CheckConstraint(_in("repeat", ("none", "daily", "weekly")), name=op.f("ck_personal_events_repeat")),
        sa.CheckConstraint(
            "repeat_until IS NULL OR repeat_until >= date", name=op.f("ck_personal_events_repeat_until_after_start")
        ),
    )
    op.create_index(
        "ix_personal_events_reminders", "personal_events", ["date"], postgresql_where=sa.text("remind IS NOT NULL")
    )
    op.create_index("ix_personal_events_user_date", "personal_events", ["user_id", "date"])
    op.create_table(
        "calendar_prefs",
        sa.Column("user_id", sa.UUID()),
        sa.Column("hidden_events", postgresql.ARRAY(sa.String(120)), server_default="{}", nullable=False),
        sa.Column("hidden_modules", postgresql.ARRAY(sa.String(64)), server_default="{}", nullable=False),
        sa.Column("hidden_types", postgresql.ARRAY(sa.String(16)), server_default="{}", nullable=False),
        sa.Column("feed_salt", sa.String(32)),
        sa.Column("feed_hash", sa.String(64)),
        _now("updated_at"),
        sa.PrimaryKeyConstraint("user_id", name="pk_calendar_prefs"),
        sa.UniqueConstraint("feed_hash", name="uq_calendar_prefs_feed_hash"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_calendar_prefs_user_id_users", ondelete="CASCADE"),
    )


def _forum() -> None:
    """Categories and tags, threads and replies, votes and follows; the seniors who answer questions."""
    op.create_table(
        "forum_categories",
        sa.Column("id", sa.String(32)),
        sa.Column("label", sa.String(40), nullable=False),
        sa.Column("short", sa.String(20), nullable=False),
        sa.Column("year", sa.SmallInteger()),
        sa.Column("blurb", sa.String(120), nullable=False),
        sa.Column("icon", sa.String(20)),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        _flag("retired"),
        sa.PrimaryKeyConstraint("id", name="pk_forum_categories"),
        sa.CheckConstraint(_year_range("year"), name=op.f("ck_forum_categories_year_range")),
    )
    op.create_table(
        "forum_tags",
        sa.Column("id", sa.String(32)),
        sa.Column("label", sa.String(40), nullable=False),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        _flag("retired"),
        sa.PrimaryKeyConstraint("id", name="pk_forum_tags"),
    )
    op.create_table(
        "forum_threads",
        sa.Column("id", sa.UUID()),
        sa.Column("slug", sa.String(120), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("category", sa.String(32), nullable=False),
        sa.Column("module_id", sa.String(64)),
        sa.Column("tags", postgresql.ARRAY(sa.String(32)), server_default="{}", nullable=False),
        sa.Column("author_id", sa.UUID()),
        sa.Column("author_year", sa.SmallInteger()),
        _flag("pinned"),
        _flag("locked"),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("accepted_reply_id", sa.UUID()),  # its foreign key comes after forum_replies
        sa.Column("vote_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("reply_count", sa.Integer(), server_default="0", nullable=False),
        _now("created_at"),
        _at("edited_at"),
        _at("deleted_at"),
        _now("last_activity_at"),
        sa.Column(
            "search_vector",
            postgresql.TSVECTOR(),
            sa.Computed(
                "setweight(to_tsvector('simple', coalesce(title, '')), 'A') || "
                "setweight(to_tsvector('simple', coalesce(body, '')), 'B')",
                persisted=True,
            ),
            nullable=False,
        ),
        _flag("anonymous"),
        sa.PrimaryKeyConstraint("id", name="pk_forum_threads"),
        sa.UniqueConstraint("slug", name="uq_forum_threads_slug"),
        sa.ForeignKeyConstraint(
            ["author_id"], ["users.id"], name="fk_forum_threads_author_id_users", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["category"],
            ["forum_categories.id"],
            name="fk_forum_threads_category_forum_categories",
            ondelete="RESTRICT",
        ),
        sa.ForeignKeyConstraint(
            ["module_id"], ["modules.id"], name="fk_forum_threads_module_id_modules", ondelete="SET NULL"
        ),
        sa.CheckConstraint(_year_range("author_year"), name=op.f("ck_forum_threads_author_year_range")),
        sa.CheckConstraint(_in("status", POST_STATUSES), name=op.f("ck_forum_threads_poststatus")),
    )
    op.create_index("ix_forum_threads_author", "forum_threads", ["author_id"])
    op.create_index("ix_forum_threads_category", "forum_threads", ["category"])
    op.create_index("ix_forum_threads_module", "forum_threads", ["module_id"])
    op.create_index("ix_forum_threads_search", "forum_threads", ["search_vector"], postgresql_using="gin")
    op.create_table(
        "forum_replies",
        sa.Column("id", sa.UUID()),
        sa.Column("thread_id", sa.UUID(), nullable=False),
        sa.Column("parent_id", sa.UUID()),
        sa.Column("author_id", sa.UUID()),
        sa.Column("author_year", sa.SmallInteger()),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("vote_count", sa.Integer(), server_default="0", nullable=False),
        _now("created_at"),
        _at("edited_at"),
        _at("deleted_at"),
        sa.Column(
            "search_vector",
            postgresql.TSVECTOR(),
            sa.Computed("to_tsvector('simple', coalesce(body, ''))", persisted=True),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_forum_replies"),
        sa.ForeignKeyConstraint(
            ["author_id"], ["users.id"], name="fk_forum_replies_author_id_users", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["parent_id"], ["forum_replies.id"], name="fk_forum_replies_parent_id_forum_replies", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["thread_id"], ["forum_threads.id"], name="fk_forum_replies_thread_id_forum_threads", ondelete="CASCADE"
        ),
        sa.CheckConstraint(_year_range("author_year"), name=op.f("ck_forum_replies_author_year_range")),
        sa.CheckConstraint(_in("status", POST_STATUSES), name=op.f("ck_forum_replies_poststatus")),
    )
    op.create_index("ix_forum_replies_author", "forum_replies", ["author_id"])
    op.create_index("ix_forum_replies_parent", "forum_replies", ["parent_id"])
    op.create_index("ix_forum_replies_search", "forum_replies", ["search_vector"], postgresql_using="gin")
    op.create_index("ix_forum_replies_thread_created", "forum_replies", ["thread_id", "created_at"])
    op.create_foreign_key(
        "fk_forum_threads_accepted_reply_id_forum_replies",
        "forum_threads",
        "forum_replies",
        ["accepted_reply_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_table(
        "forum_thread_votes",
        sa.Column("user_id", sa.UUID()),
        sa.Column("thread_id", sa.UUID()),
        _now("created_at"),
        sa.PrimaryKeyConstraint("user_id", "thread_id", name="pk_forum_thread_votes"),
        sa.ForeignKeyConstraint(
            ["thread_id"],
            ["forum_threads.id"],
            name="fk_forum_thread_votes_thread_id_forum_threads",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_forum_thread_votes_user_id_users", ondelete="CASCADE"
        ),
    )
    op.create_table(
        "forum_reply_votes",
        sa.Column("user_id", sa.UUID()),
        sa.Column("reply_id", sa.UUID()),
        _now("created_at"),
        sa.PrimaryKeyConstraint("user_id", "reply_id", name="pk_forum_reply_votes"),
        sa.ForeignKeyConstraint(
            ["reply_id"], ["forum_replies.id"], name="fk_forum_reply_votes_reply_id_forum_replies", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_forum_reply_votes_user_id_users", ondelete="CASCADE"
        ),
    )
    op.create_table(
        "forum_follows",
        sa.Column("user_id", sa.UUID()),
        sa.Column("thread_id", sa.UUID()),
        sa.Column("level", sa.String(10), nullable=False),
        _now("created_at"),
        sa.PrimaryKeyConstraint("user_id", "thread_id", name="pk_forum_follows"),
        sa.ForeignKeyConstraint(
            ["thread_id"], ["forum_threads.id"], name="fk_forum_follows_thread_id_forum_threads", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_forum_follows_user_id_users", ondelete="CASCADE"),
        sa.CheckConstraint(_in("level", ("answers", "replies", "off")), name=op.f("ck_forum_follows_level")),
    )
    op.create_index("ix_forum_follows_thread", "forum_follows", ["thread_id"])
    op.create_table(
        "senior_profiles",
        sa.Column("user_id", sa.UUID()),
        sa.Column("topics", postgresql.ARRAY(sa.String(32)), server_default="{}", nullable=False),
        sa.Column("note", sa.String(140), server_default="", nullable=False),
        _flag("paused"),
        _now("created_at"),
        sa.PrimaryKeyConstraint("user_id", name="pk_senior_profiles"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_senior_profiles_user_id_users", ondelete="CASCADE"),
    )


def _library() -> None:
    """The Drive folders the import reads, the library's files and links, their text and stars, and the past
    questions students tag with a chapter."""
    op.create_table(
        "drive_folders",
        sa.Column("id", sa.UUID()),
        sa.Column("module_id", sa.String(64), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("author_name", sa.String(120)),
        _now("created_at"),
        sa.PrimaryKeyConstraint("id", name="pk_drive_folders"),
        sa.ForeignKeyConstraint(
            ["module_id"], ["modules.id"], name="fk_drive_folders_module_id_modules", ondelete="CASCADE"
        ),
        sa.CheckConstraint(_in("kind", LIBRARY_KINDS), name=op.f("ck_drive_folders_kind")),
    )
    op.create_index("ix_drive_folders_module_url", "drive_folders", ["module_id", "url"], unique=True)
    op.create_table(
        "library_items",
        sa.Column("id", sa.UUID()),
        sa.Column("slug", sa.String(120), nullable=False),
        sa.Column("source", sa.String(8), nullable=False),
        sa.Column("kind", sa.String(32), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("module_id", sa.String(64)),
        sa.Column("year", sa.SmallInteger()),
        sa.Column("url", sa.Text()),
        sa.Column("storage_key", sa.Text()),
        sa.Column("file_name", sa.String(255)),
        sa.Column("content_type", sa.String(127)),
        sa.Column("size_bytes", sa.BigInteger()),
        sa.Column("exam_year", sa.SmallInteger()),
        sa.Column("zone", sa.String(8)),
        sa.Column("author_name", sa.String(120)),
        sa.Column("import_key", sa.String(200)),
        sa.Column("uploaded_by", sa.UUID()),
        sa.Column("status", sa.String(12), nullable=False),
        sa.Column("review_note", sa.Text()),
        sa.Column("reviewed_by", sa.UUID()),
        _at("reviewed_at"),
        sa.Column("download_count", sa.Integer(), server_default="0", nullable=False),
        _now("created_at"),
        _at("updated_at"),
        _at("published_at"),
        sa.Column(
            "search_vector",
            postgresql.TSVECTOR(),
            sa.Computed(
                "setweight(to_tsvector('simple', coalesce(title, '')), 'A') || "
                "setweight(to_tsvector('simple', coalesce(description, '')), 'B') || "
                "setweight(to_tsvector('simple', coalesce(author_name, '') || ' ' || coalesce(file_name, '')), 'C')",
                persisted=True,
            ),
            nullable=False,
        ),
        sa.Column("exam_session", sa.String(8)),
        sa.Column("drive_folder_id", sa.UUID()),
        sa.Column("content_hash", sa.String(64)),
        sa.PrimaryKeyConstraint("id", name="pk_library_items"),
        sa.UniqueConstraint("import_key", name="uq_library_items_import_key"),
        sa.UniqueConstraint("slug", name="uq_library_items_slug"),
        sa.ForeignKeyConstraint(
            ["drive_folder_id"],
            ["drive_folders.id"],
            name="fk_library_items_drive_folder_id_drive_folders",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["module_id"], ["modules.id"], name="fk_library_items_module_id_modules", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["reviewed_by"], ["users.id"], name="fk_library_items_reviewed_by_users", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["uploaded_by"], ["users.id"], name="fk_library_items_uploaded_by_users", ondelete="SET NULL"
        ),
        sa.CheckConstraint(_in("exam_session", ("may", "october")), name=op.f("ck_library_items_exam_session")),
        sa.CheckConstraint(_in("source", ("file", "link")), name=op.f("ck_library_items_itemsource")),
        sa.CheckConstraint(
            _in("status", ("pending", "published", "rejected", "removed")), name=op.f("ck_library_items_itemstatus")
        ),
        sa.CheckConstraint(_in("kind", LIBRARY_KINDS), name=op.f("ck_library_items_kind")),
        sa.CheckConstraint(_year_range("year"), name=op.f("ck_library_items_year_range")),
        sa.CheckConstraint(_in("zone", ZONES), name=op.f("ck_library_items_zone")),
    )
    op.create_index("ix_library_items_content_hash", "library_items", ["content_hash"])
    op.create_index("ix_library_items_drive_folder", "library_items", ["drive_folder_id"])
    op.create_index("ix_library_items_module", "library_items", ["module_id"])
    op.create_index("ix_library_items_reviewed_by", "library_items", ["reviewed_by"])
    op.create_index("ix_library_items_search", "library_items", ["search_vector"], postgresql_using="gin")
    op.create_index(
        "ix_library_items_status_newest",
        "library_items",
        ["status", sa.literal_column("coalesce(published_at, created_at)")],
    )
    op.create_index("ix_library_items_uploaded_by", "library_items", ["uploaded_by"])
    op.create_table(
        "library_texts",
        sa.Column("item_id", sa.UUID()),
        sa.Column("status", sa.String(8), nullable=False),
        sa.Column("body", sa.Text()),
        sa.Column("pages", sa.Integer()),
        sa.Column("error", sa.String(200)),
        _now("started_at"),
        _at("finished_at"),
        sa.Column(
            "search_vector",
            postgresql.TSVECTOR(),
            sa.Computed("to_tsvector('simple', coalesce(body, ''))", persisted=True),
            nullable=False,
        ),
        sa.Column("cover_key", sa.Text()),
        sa.PrimaryKeyConstraint("item_id", name="pk_library_texts"),
        sa.ForeignKeyConstraint(
            ["item_id"], ["library_items.id"], name="fk_library_texts_item_id_library_items", ondelete="CASCADE"
        ),
        sa.CheckConstraint(
            _in("status", ("working", "done", "empty", "failed")), name=op.f("ck_library_texts_textstatus")
        ),
    )
    op.create_index("ix_library_texts_search", "library_texts", ["search_vector"], postgresql_using="gin")
    op.create_table(
        "library_stars",
        sa.Column("user_id", sa.UUID()),
        sa.Column("item_id", sa.UUID()),
        _now("created_at"),
        sa.PrimaryKeyConstraint("user_id", "item_id", name="pk_library_stars"),
        sa.ForeignKeyConstraint(
            ["item_id"], ["library_items.id"], name="fk_library_stars_item_id_library_items", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_library_stars_user_id_users", ondelete="CASCADE"),
    )
    op.create_table(
        "paper_questions",
        sa.Column("id", sa.UUID()),
        sa.Column("item_id", sa.UUID(), nullable=False),
        sa.Column("chapter_id", sa.String(16), nullable=False),
        sa.Column("question", sa.SmallInteger(), nullable=False),
        sa.Column("page", sa.SmallInteger()),
        sa.Column("tagged_by", sa.UUID()),
        sa.Column("flag_count", sa.Integer(), server_default="0", nullable=False),
        _now("created_at"),
        sa.PrimaryKeyConstraint("id", name="pk_paper_questions"),
        sa.ForeignKeyConstraint(
            ["chapter_id"], ["chapters.id"], name="fk_paper_questions_chapter_id_chapters", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["item_id"], ["library_items.id"], name="fk_paper_questions_item_id_library_items", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["tagged_by"], ["users.id"], name="fk_paper_questions_tagged_by_users", ondelete="SET NULL"
        ),
        sa.CheckConstraint("page IS NULL OR page BETWEEN 1 AND 999", name=op.f("ck_paper_questions_page_range")),
        sa.CheckConstraint("question BETWEEN 1 AND 40", name=op.f("ck_paper_questions_question_range")),
    )
    op.create_index("ix_paper_questions_chapter", "paper_questions", ["chapter_id"])
    op.create_index(
        "ix_paper_questions_item_question_chapter",
        "paper_questions",
        ["item_id", "question", "chapter_id"],
        unique=True,
    )
    op.create_index("ix_paper_questions_tagged_by", "paper_questions", ["tagged_by"])
    op.create_table(
        "paper_question_flags",
        sa.Column("question_id", sa.UUID()),
        sa.Column("user_id", sa.UUID()),
        _now("created_at"),
        sa.PrimaryKeyConstraint("question_id", "user_id", name="pk_paper_question_flags"),
        sa.ForeignKeyConstraint(
            ["question_id"],
            ["paper_questions.id"],
            name="fk_paper_question_flags_question_id_paper_questions",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_paper_question_flags_user_id_users", ondelete="CASCADE"
        ),
    )
    op.create_index("ix_paper_question_flags_user", "paper_question_flags", ["user_id"])


def _newsletter() -> None:
    """Issues, their reactions and poll votes."""
    op.create_table(
        "newsletter_issues",
        sa.Column("id", sa.UUID()),
        sa.Column("slug", sa.String(120), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(160), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("cover", postgresql.JSONB(), nullable=False),
        sa.Column("dek", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("editors", postgresql.JSONB(), nullable=False),
        sa.Column("sections", postgresql.JSONB(), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        _at("published_at"),
        sa.Column("created_by", sa.UUID()),
        _now("created_at"),
        _at("updated_at"),
        sa.Column(
            "search_vector",
            postgresql.TSVECTOR(),
            sa.Computed(
                "setweight(to_tsvector('simple', coalesce(title, '')), 'A') || "
                "setweight(to_tsvector('simple', coalesce(dek, '') || ' ' || coalesce(summary, '')), 'B') || "
                "setweight(jsonb_to_tsvector('simple', sections, '[\"string\"]'), 'C')",
                persisted=True,
            ),
            nullable=False,
        ),
        sa.PrimaryKeyConstraint("id", name="pk_newsletter_issues"),
        sa.UniqueConstraint("slug", name="uq_newsletter_issues_slug"),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"], name="fk_newsletter_issues_created_by_users", ondelete="SET NULL"
        ),
        sa.CheckConstraint(_in("status", ("draft", "published")), name=op.f("ck_newsletter_issues_issuestatus")),
    )
    op.create_index("ix_newsletter_issues_created_by", "newsletter_issues", ["created_by"])
    op.create_index("ix_newsletter_issues_search", "newsletter_issues", ["search_vector"], postgresql_using="gin")
    op.create_table(
        "newsletter_reactions",
        sa.Column("user_id", sa.UUID()),
        sa.Column("issue_id", sa.UUID()),
        sa.Column("section_id", sa.String(64)),
        sa.Column("reaction", sa.String(16)),
        _now("created_at"),
        sa.PrimaryKeyConstraint("user_id", "issue_id", "section_id", "reaction", name="pk_newsletter_reactions"),
        sa.ForeignKeyConstraint(
            ["issue_id"],
            ["newsletter_issues.id"],
            name="fk_newsletter_reactions_issue_id_newsletter_issues",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_newsletter_reactions_user_id_users", ondelete="CASCADE"
        ),
    )
    op.create_table(
        "newsletter_poll_votes",
        sa.Column("user_id", sa.UUID()),
        sa.Column("issue_id", sa.UUID()),
        sa.Column("poll_id", sa.String(64)),
        sa.Column("choice", sa.SmallInteger(), nullable=False),
        _now("created_at"),
        sa.PrimaryKeyConstraint("user_id", "issue_id", "poll_id", name="pk_newsletter_poll_votes"),
        sa.ForeignKeyConstraint(
            ["issue_id"],
            ["newsletter_issues.id"],
            name="fk_newsletter_poll_votes_issue_id_newsletter_issues",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_newsletter_poll_votes_user_id_users", ondelete="CASCADE"
        ),
    )


def _notifications() -> None:
    """Notifications, the emails queued for them, and the Sunday summaries sent."""
    op.create_table(
        "notifications",
        sa.Column("id", sa.UUID()),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("body", sa.Text()),
        sa.Column("url", sa.String(300)),
        sa.Column("actor_id", sa.UUID()),
        sa.Column("data", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        _now("created_at"),
        _at("read_at"),
        sa.PrimaryKeyConstraint("id", name="pk_notifications"),
        sa.ForeignKeyConstraint(
            ["actor_id"], ["users.id"], name="fk_notifications_actor_id_users", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_notifications_user_id_users", ondelete="CASCADE"),
        sa.CheckConstraint(_in("kind", NOTIFICATION_KINDS), name=op.f("ck_notifications_kind")),
    )
    op.create_index("ix_notifications_actor", "notifications", ["actor_id"])
    op.create_index("ix_notifications_user_created", "notifications", ["user_id", "created_at"])
    op.create_index(
        "ix_notifications_user_unread", "notifications", ["user_id"], postgresql_where=sa.text("read_at IS NULL")
    )
    op.create_table(
        "email_outbox",
        sa.Column("id", sa.UUID()),
        sa.Column("user_id", sa.UUID()),
        sa.Column("notification_id", sa.UUID()),
        sa.Column("kind", sa.String(40), nullable=False),
        sa.Column("to_address", sa.String(254), nullable=False),
        sa.Column("subject", sa.String(200), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("attempts", sa.SmallInteger(), server_default="0", nullable=False),
        _now("next_attempt_at"),
        sa.Column("last_error", sa.String(200)),
        _now("created_at"),
        _at("sent_at"),
        sa.PrimaryKeyConstraint("id", name="pk_email_outbox"),
        sa.ForeignKeyConstraint(
            ["notification_id"],
            ["notifications.id"],
            name="fk_email_outbox_notification_id_notifications",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_email_outbox_user_id_users", ondelete="CASCADE"),
        sa.CheckConstraint(
            _in("status", ("pending", "sent", "failed", "cancelled")), name=op.f("ck_email_outbox_outboxstatus")
        ),
    )
    op.create_index("ix_email_outbox_created", "email_outbox", ["created_at"])
    op.create_index(
        "ix_email_outbox_due", "email_outbox", ["next_attempt_at"], postgresql_where=sa.text("status = 'pending'")
    )
    op.create_index("ix_email_outbox_notification", "email_outbox", ["notification_id"])
    op.create_index("ix_email_outbox_user", "email_outbox", ["user_id"])
    op.create_table(
        "weekly_summaries",
        sa.Column("user_id", sa.UUID()),
        sa.Column("week_of", sa.Date()),
        _now("created_at"),
        sa.PrimaryKeyConstraint("user_id", "week_of", name="pk_weekly_summaries"),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name="fk_weekly_summaries_user_id_users", ondelete="CASCADE"
        ),
    )


def _requests_and_reports() -> None:
    """Reports on posts and files, students' requests and their me-toos, and bug reports."""
    op.create_table(
        "reports",
        sa.Column("id", sa.UUID()),
        sa.Column("reporter_id", sa.UUID()),
        sa.Column("target_type", sa.String(20), nullable=False),
        sa.Column("target_id", sa.UUID(), nullable=False),
        sa.Column("reason", sa.String(20), nullable=False),
        sa.Column("note", sa.Text()),
        sa.Column("status", sa.String(10), server_default="open", nullable=False),
        sa.Column("resolved_by", sa.UUID()),
        _at("resolved_at"),
        sa.Column("resolution_note", sa.Text()),
        _now("created_at"),
        sa.PrimaryKeyConstraint("id", name="pk_reports"),
        sa.ForeignKeyConstraint(
            ["reporter_id"], ["users.id"], name="fk_reports_reporter_id_users", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["resolved_by"], ["users.id"], name="fk_reports_resolved_by_users", ondelete="SET NULL"
        ),
        sa.CheckConstraint(
            _in("reason", ("spam", "harassment", "inappropriate", "copyright", "other")),
            name=op.f("ck_reports_reason"),
        ),
        sa.CheckConstraint(_in("status", ("open", "resolved", "dismissed")), name=op.f("ck_reports_reportstatus")),
        sa.CheckConstraint(
            _in("target_type", ("thread", "reply", "library_item", "request")), name=op.f("ck_reports_target_type")
        ),
    )
    op.create_index("ix_reports_reporter_created", "reports", ["reporter_id", "created_at"])
    op.create_index("ix_reports_resolved_by", "reports", ["resolved_by"])
    op.create_index("ix_reports_status_created", "reports", ["status", "created_at"])
    op.create_index("ix_reports_target", "reports", ["target_type", "target_id"])
    op.create_index(
        "uq_reports_open_per_reporter",
        "reports",
        ["reporter_id", "target_type", "target_id"],
        unique=True,
        postgresql_where=sa.text("status = 'open'"),
    )
    op.create_table(
        "requests",
        sa.Column("id", sa.UUID()),
        sa.Column("author_id", sa.UUID()),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("title", sa.String(140), nullable=False),
        sa.Column("details", sa.Text(), server_default="", nullable=False),
        sa.Column("module_id", sa.String(64)),
        sa.Column("status", sa.String(10), server_default="open", nullable=False),
        sa.Column("me_too_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("reply", sa.Text()),
        sa.Column("answered_by", sa.UUID()),
        _at("answered_at"),
        sa.Column("removed_by", sa.UUID()),
        _at("removed_at"),
        _now("created_at"),
        sa.Column(
            "search_vector",
            postgresql.TSVECTOR(),
            sa.Computed(
                "setweight(to_tsvector('simple', coalesce(title, '')), 'A') || "
                "setweight(to_tsvector('simple', coalesce(details, '')), 'B')",
                persisted=True,
            ),
            nullable=False,
        ),
        sa.Column("wanted_kind", sa.String(32)),
        sa.Column("exam_year", sa.SmallInteger()),
        sa.Column("zone", sa.String(8)),
        sa.Column("event_id", sa.String(120)),
        sa.Column("found_item_id", sa.UUID()),
        _at("found_at"),
        sa.PrimaryKeyConstraint("id", name="pk_requests"),
        sa.ForeignKeyConstraint(
            ["answered_by"], ["users.id"], name="fk_requests_answered_by_users", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["author_id"], ["users.id"], name="fk_requests_author_id_users", ondelete="SET NULL"),
        sa.ForeignKeyConstraint(
            ["event_id"], ["calendar_events.id"], name="fk_requests_event_id_calendar_events", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["found_item_id"],
            ["library_items.id"],
            name="fk_requests_found_item_id_library_items",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["module_id"], ["modules.id"], name="fk_requests_module_id_modules", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["removed_by"], ["users.id"], name="fk_requests_removed_by_users", ondelete="SET NULL"),
        sa.CheckConstraint(_in("kind", ("paper", "fix", "event", "feature", "other")), name=op.f("ck_requests_kind")),
        sa.CheckConstraint(
            _in("status", ("open", "planned", "done", "declined")), name=op.f("ck_requests_requeststatus")
        ),
        sa.CheckConstraint(_in("wanted_kind", WANTED_KINDS), name=op.f("ck_requests_wanted_kind")),
        sa.CheckConstraint(_in("zone", ZONES), name=op.f("ck_requests_zone")),
    )
    op.create_index("ix_requests_answered_by", "requests", ["answered_by"])
    op.create_index("ix_requests_author_created", "requests", ["author_id", "created_at"])
    op.create_index("ix_requests_event", "requests", ["event_id"])
    op.create_index("ix_requests_found_item", "requests", ["found_item_id"])
    op.create_index("ix_requests_module", "requests", ["module_id"])
    op.create_index(
        "ix_requests_queue",
        "requests",
        ["me_too_count", "created_at"],
        postgresql_where=sa.text("removed_at IS NULL"),
    )
    op.create_index("ix_requests_removed_by", "requests", ["removed_by"])
    op.create_index("ix_requests_search", "requests", ["search_vector"], postgresql_using="gin")
    op.create_table(
        "request_me_toos",
        sa.Column("request_id", sa.UUID()),
        sa.Column("user_id", sa.UUID()),
        _now("created_at"),
        sa.PrimaryKeyConstraint("request_id", "user_id", name="pk_request_me_toos"),
        sa.ForeignKeyConstraint(
            ["request_id"], ["requests.id"], name="fk_request_me_toos_request_id_requests", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_request_me_toos_user_id_users", ondelete="CASCADE"),
    )
    op.create_index("ix_request_me_toos_user", "request_me_toos", ["user_id"])
    op.create_table(
        "bug_reports",
        sa.Column("id", sa.UUID()),
        sa.Column("user_id", sa.UUID()),
        sa.Column("ip", postgresql.INET()),
        sa.Column("what_happened", sa.Text(), nullable=False),
        sa.Column("expected", sa.Text(), server_default="", nullable=False),
        sa.Column("page_url", sa.String(500), nullable=False),
        sa.Column("app_version", sa.String(40), nullable=False),
        sa.Column("browser", sa.String(300), server_default="", nullable=False),
        sa.Column("status", sa.String(10), server_default="open", nullable=False),
        _now("created_at"),
        _at("resolved_at"),
        sa.Column("resolved_by", sa.UUID()),
        sa.PrimaryKeyConstraint("id", name="pk_bug_reports"),
        sa.ForeignKeyConstraint(
            ["resolved_by"], ["users.id"], name="fk_bug_reports_resolved_by_users", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_bug_reports_user_id_users", ondelete="CASCADE"),
        sa.CheckConstraint(_in("status", ("open", "fixed", "wont_fix")), name=op.f("ck_bug_reports_bugstatus")),
    )
    op.create_index("ix_bug_reports_resolved_by", "bug_reports", ["resolved_by"])
    op.create_index("ix_bug_reports_status_created", "bug_reports", ["status", "created_at"])
    op.create_index("ix_bug_reports_user_created", "bug_reports", ["user_id", "created_at"])


def _boards() -> None:
    """Each student's boards: columns, labels, revision plans, cards, and the cards' labels and comments."""
    op.create_table(
        "boards",
        sa.Column("id", sa.UUID()),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(60), nullable=False),
        sa.Column("emoji", sa.String(16)),
        sa.Column("color", sa.String(12), nullable=False),
        sa.Column("template", sa.String(12), nullable=False),
        sa.Column("position", sa.Double(), nullable=False),
        _at("archived_at"),
        _now("created_at"),
        _now("updated_at"),
        sa.PrimaryKeyConstraint("id", name="pk_boards"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_boards_user_id_users", ondelete="CASCADE"),
        sa.CheckConstraint(_in("color", BOARD_COLOURS), name=op.f("ck_boards_color")),
        sa.CheckConstraint(
            _in("template", ("study", "revision", "assignment", "weekly", "personal", "blank")),
            name=op.f("ck_boards_template"),
        ),
    )
    op.create_index("ix_boards_user_position", "boards", ["user_id", "position"])
    op.create_table(
        "board_columns",
        sa.Column("id", sa.UUID()),
        sa.Column("board_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(40), nullable=False),
        sa.Column("done", sa.Boolean(), nullable=False),
        sa.Column("position", sa.Double(), nullable=False),
        _now("created_at"),
        sa.PrimaryKeyConstraint("id", name="pk_board_columns"),
        sa.ForeignKeyConstraint(
            ["board_id"], ["boards.id"], name="fk_board_columns_board_id_boards", ondelete="CASCADE"
        ),
    )
    op.create_index("ix_board_columns_board_position", "board_columns", ["board_id", "position"])
    op.create_table(
        "board_labels",
        sa.Column("id", sa.UUID()),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(30), nullable=False),
        sa.Column("color", sa.String(12), nullable=False),
        _now("created_at"),
        sa.PrimaryKeyConstraint("id", name="pk_board_labels"),
        sa.UniqueConstraint("user_id", "name", name="uq_board_labels_user_name"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_board_labels_user_id_users", ondelete="CASCADE"),
        sa.CheckConstraint(_in("color", BOARD_COLOURS), name=op.f("ck_board_labels_color")),
    )
    op.create_table(
        "board_plans",
        sa.Column("id", sa.UUID()),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("module_id", sa.String(64), nullable=False),
        sa.Column("exam_date", sa.Date(), nullable=False),
        sa.Column("paper_every", sa.SmallInteger(), nullable=False),
        _now("created_at"),
        _now("updated_at"),
        sa.Column("board_id", sa.UUID(), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_board_plans"),
        sa.UniqueConstraint("user_id", "module_id", name="uq_board_plans_user_module"),
        sa.ForeignKeyConstraint(["board_id"], ["boards.id"], name="fk_board_plans_board_id_boards", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["module_id"], ["modules.id"], name="fk_board_plans_module_id_modules", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_board_plans_user_id_users", ondelete="CASCADE"),
        sa.CheckConstraint("paper_every BETWEEN 1 AND 14", name=op.f("ck_board_plans_paper_every_range")),
    )
    op.create_index("ix_board_plans_board", "board_plans", ["board_id"])
    op.create_index("ix_board_plans_module", "board_plans", ["module_id"])
    op.create_table(
        "board_cards",
        sa.Column("id", sa.UUID()),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("position", sa.Double(), nullable=False),
        sa.Column("title", sa.String(200), nullable=False),
        sa.Column("description", sa.Text()),
        sa.Column("due_date", sa.Date()),
        sa.Column("link_type", sa.String(16)),
        sa.Column("link_id", sa.String(96)),
        sa.Column("lesson_id", sa.String(16)),
        _now("created_at"),
        _now("updated_at"),
        _at("done_at"),
        sa.Column("plan_id", sa.UUID()),
        sa.Column("board_id", sa.UUID(), nullable=False),
        sa.Column("column_id", sa.UUID(), nullable=False),
        sa.Column("due_time", sa.Time()),
        sa.Column("remind_before", sa.SmallInteger()),
        _at("remind_at"),
        sa.Column("priority", sa.String(8), nullable=False),
        sa.Column("checklist", postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("cover_id", sa.UUID()),
        sa.PrimaryKeyConstraint("id", name="pk_board_cards"),
        sa.ForeignKeyConstraint(["board_id"], ["boards.id"], name="fk_board_cards_board_id_boards", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["column_id"], ["board_columns.id"], name="fk_board_cards_column_id_board_columns", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["lesson_id"], ["lessons.id"], name="fk_board_cards_lesson_id_lessons", ondelete="RESTRICT"
        ),
        sa.ForeignKeyConstraint(
            ["plan_id"], ["board_plans.id"], name="fk_board_cards_plan_id_board_plans", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_board_cards_user_id_users", ondelete="CASCADE"),
        sa.CheckConstraint(
            "CASE WHEN link_type = 'lesson' THEN lesson_id IS NOT NULL AND link_id IS NULL ELSE lesson_id IS NULL END",
            name=op.f("ck_board_cards_lesson_link"),
        ),
        sa.CheckConstraint(
            _in("link_type", ("event", "my_event", "lesson", "module", "library_item")),
            name=op.f("ck_board_cards_link_type"),
        ),
        sa.CheckConstraint(_in("priority", ("none", "low", "medium", "high")), name=op.f("ck_board_cards_priority")),
    )
    op.create_index("ix_board_cards_board", "board_cards", ["board_id"])
    op.create_index("ix_board_cards_column_position", "board_cards", ["column_id", "position"])
    op.create_index("ix_board_cards_lesson", "board_cards", ["lesson_id"])
    op.create_index("ix_board_cards_plan", "board_cards", ["plan_id"])
    op.create_index(
        "ix_board_cards_remind_at", "board_cards", ["remind_at"], postgresql_where=sa.text("remind_at IS NOT NULL")
    )
    op.create_index("ix_board_cards_user", "board_cards", ["user_id"])
    op.create_index(
        "uq_board_cards_board_lesson",
        "board_cards",
        ["board_id", "lesson_id"],
        unique=True,
        postgresql_where=sa.text("lesson_id IS NOT NULL"),
    )
    op.create_index(
        "uq_board_cards_board_link",
        "board_cards",
        ["board_id", "link_type", "link_id"],
        unique=True,
        postgresql_where=sa.text("link_type IS NOT NULL"),
    )
    op.create_table(
        "board_card_labels",
        sa.Column("card_id", sa.UUID()),
        sa.Column("label_id", sa.UUID()),
        sa.PrimaryKeyConstraint("card_id", "label_id", name="pk_board_card_labels"),
        sa.ForeignKeyConstraint(
            ["card_id"], ["board_cards.id"], name="fk_board_card_labels_card_id_board_cards", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["label_id"], ["board_labels.id"], name="fk_board_card_labels_label_id_board_labels", ondelete="CASCADE"
        ),
    )
    op.create_index("ix_board_card_labels_label", "board_card_labels", ["label_id"])
    op.create_table(
        "board_comments",
        sa.Column("id", sa.UUID()),
        sa.Column("card_id", sa.UUID(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        _now("created_at"),
        sa.PrimaryKeyConstraint("id", name="pk_board_comments"),
        sa.ForeignKeyConstraint(
            ["card_id"], ["board_cards.id"], name="fk_board_comments_card_id_board_cards", ondelete="CASCADE"
        ),
    )
    op.create_index("ix_board_comments_card", "board_comments", ["card_id", "created_at"])


def _uploads_and_notes() -> None:
    """Files browsers upload, and each student's notebooks, notes and handwriting. A note may write over an uploaded
    PDF, and a note's files are uploads, so the two tables point at each other: uploads.note_id's key comes last."""
    op.create_table(
        "uploads",
        sa.Column("id", sa.UUID()),
        sa.Column("user_id", sa.UUID()),
        sa.Column("purpose", sa.String(20), nullable=False),
        sa.Column("storage_key", sa.Text(), nullable=False),
        sa.Column("file_name", sa.String(255), nullable=False),
        sa.Column("content_type", sa.String(127), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column("status", sa.String(12), nullable=False),
        _now("created_at"),
        _at("completed_at"),
        sa.Column("thread_id", sa.UUID()),
        sa.Column("reply_id", sa.UUID()),
        sa.Column("card_id", sa.UUID()),
        sa.Column("note_id", sa.UUID()),
        sa.Column("newsletter_issue_id", sa.UUID()),
        sa.Column("bug_report_id", sa.UUID()),
        sa.PrimaryKeyConstraint("id", name="pk_uploads"),
        sa.UniqueConstraint("storage_key", name="uq_uploads_storage_key"),
        sa.ForeignKeyConstraint(
            ["bug_report_id"], ["bug_reports.id"], name="fk_uploads_bug_report_id_bug_reports", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["card_id"], ["board_cards.id"], name="fk_uploads_card_id_board_cards", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["newsletter_issue_id"],
            ["newsletter_issues.id"],
            name="fk_uploads_newsletter_issue_id_newsletter_issues",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["reply_id"], ["forum_replies.id"], name="fk_uploads_reply_id_forum_replies", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["thread_id"], ["forum_threads.id"], name="fk_uploads_thread_id_forum_threads", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_uploads_user_id_users", ondelete="SET NULL"),
        sa.CheckConstraint(_in("purpose", UPLOAD_PURPOSES), name=op.f("ck_uploads_uploadpurpose")),
        sa.CheckConstraint(_in("status", ("pending", "uploaded", "attached")), name=op.f("ck_uploads_uploadstatus")),
    )
    op.create_index("ix_uploads_bug_report", "uploads", ["bug_report_id"])
    op.create_index("ix_uploads_card", "uploads", ["card_id"])
    op.create_index("ix_uploads_newsletter_issue", "uploads", ["newsletter_issue_id"])
    op.create_index("ix_uploads_note", "uploads", ["note_id"])
    op.create_index("ix_uploads_status_created", "uploads", ["status", "created_at"])
    op.create_index("ix_uploads_user_created", "uploads", ["user_id", "created_at"])
    op.create_table(
        "notebooks",
        sa.Column("id", sa.UUID()),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(120), nullable=False),
        sa.Column("module_id", sa.String(64)),
        _now("created_at"),
        _now("updated_at"),
        sa.PrimaryKeyConstraint("id", name="pk_notebooks"),
        sa.ForeignKeyConstraint(
            ["module_id"], ["modules.id"], name="fk_notebooks_module_id_modules", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_notebooks_user_id_users", ondelete="CASCADE"),
    )
    op.create_index("ix_notebooks_module", "notebooks", ["module_id"])
    op.create_index("ix_notebooks_user_created", "notebooks", ["user_id", "created_at"])
    op.create_index(
        "ix_notebooks_user_module",
        "notebooks",
        ["user_id", "module_id"],
        unique=True,
        postgresql_where=sa.text("module_id IS NOT NULL"),
    )
    op.create_table(
        "notes",
        sa.Column("id", sa.UUID()),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(200), server_default="", nullable=False),
        sa.Column("lesson_id", sa.String(16)),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        _now("saves_since"),
        sa.Column("saves", sa.Integer(), server_default="0", nullable=False),
        _now("created_at"),
        _now("updated_at"),
        sa.Column("notebook_id", sa.UUID(), nullable=False),
        sa.Column("doc", postgresql.JSONB(), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("text", sa.Text(), server_default="", nullable=False),
        sa.Column("paper", sa.String(8), server_default="lined", nullable=False),
        sa.Column("sheets", sa.Integer(), server_default="1", nullable=False),
        sa.Column("library_item_id", sa.UUID()),
        sa.Column("pdf_upload_id", sa.UUID()),
        sa.PrimaryKeyConstraint("id", name="pk_notes"),
        sa.ForeignKeyConstraint(["lesson_id"], ["lessons.id"], name="fk_notes_lesson_id_lessons", ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(
            ["library_item_id"],
            ["library_items.id"],
            name="fk_notes_library_item_id_library_items",
            ondelete="SET NULL",
        ),
        sa.ForeignKeyConstraint(
            ["notebook_id"], ["notebooks.id"], name="fk_notes_notebook_id_notebooks", ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["pdf_upload_id"], ["uploads.id"], name="fk_notes_pdf_upload_id_uploads", ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_notes_user_id_users", ondelete="CASCADE"),
        sa.CheckConstraint(_in("paper", ("blank", "lined", "grid", "dotted")), name=op.f("ck_notes_paper")),
    )
    op.create_index("ix_notes_lesson", "notes", ["lesson_id"])
    op.create_index("ix_notes_library_item", "notes", ["library_item_id"])
    op.create_index("ix_notes_notebook_updated", "notes", ["notebook_id", "updated_at"])
    op.create_index("ix_notes_pdf_upload", "notes", ["pdf_upload_id"])
    op.create_index("ix_notes_user_lesson", "notes", ["user_id", "lesson_id"])
    op.create_index(
        "ix_notes_user_library_item",
        "notes",
        ["user_id", "library_item_id"],
        unique=True,
        postgresql_where=sa.text("library_item_id IS NOT NULL"),
    )
    op.create_index("ix_notes_user_updated", "notes", ["user_id", "updated_at"])
    op.create_table(
        "note_ink",
        sa.Column("note_id", sa.UUID()),
        sa.Column("sheet", sa.Integer()),
        sa.Column("strokes", postgresql.JSONB(), server_default=sa.text("'[]'::jsonb"), nullable=False),
        sa.Column("size_bytes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        _now("updated_at"),
        sa.PrimaryKeyConstraint("note_id", "sheet", name="pk_note_ink"),
        sa.ForeignKeyConstraint(["note_id"], ["notes.id"], name="fk_note_ink_note_id_notes", ondelete="CASCADE"),
    )
    op.create_foreign_key("fk_uploads_note_id_notes", "uploads", "notes", ["note_id"], ["id"], ondelete="SET NULL")


def _noora() -> None:
    """Mini Noora's limits (one row) and each student's use of her per day."""
    op.create_table(
        "noora_limits",
        sa.Column("id", sa.SmallInteger()),
        sa.Column("daily_questions", sa.Integer(), server_default="30", nullable=False),
        sa.Column("monthly_budget_cents", sa.Integer(), server_default="2500", nullable=False),
        sa.Column("updated_by", sa.UUID()),
        _at("updated_at"),
        sa.PrimaryKeyConstraint("id", name="pk_noora_limits"),
        sa.ForeignKeyConstraint(
            ["updated_by"], ["users.id"], name="fk_noora_limits_updated_by_users", ondelete="SET NULL"
        ),
        sa.CheckConstraint("id = 1", name=op.f("ck_noora_limits_single_row")),
    )
    op.create_table(
        "noora_usage",
        sa.Column("id", sa.UUID()),
        sa.Column("user_id", sa.UUID()),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("questions", sa.Integer(), server_default="0", nullable=False),
        sa.Column("input_tokens", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("output_tokens", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("cache_read_tokens", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("cache_write_tokens", sa.BigInteger(), server_default="0", nullable=False),
        sa.Column("cost_microusd", sa.BigInteger(), server_default="0", nullable=False),
        _at("last_asked_at"),
        _at("answering_since"),
        sa.PrimaryKeyConstraint("id", name="pk_noora_usage"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_noora_usage_user_id_users", ondelete="SET NULL"),
    )
    op.create_index("ix_noora_usage_day", "noora_usage", ["day"])
    op.create_index("ix_noora_usage_user_day", "noora_usage", ["user_id", "day"], unique=True)


def _daily() -> None:
    """Daily: who shows on the leaderboard and everyone's plays; the themes and their weeks, the puzzles' items, each
    day's stored puzzles, the word lists, and the install's own seed."""
    op.create_table(
        "daily_profiles",
        sa.Column("user_id", sa.UUID()),
        _flag("show_on_board"),
        _now("updated_at"),
        sa.PrimaryKeyConstraint("user_id", name="pk_daily_profiles"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_daily_profiles_user_id_users", ondelete="CASCADE"),
    )
    op.create_table(
        "daily_plays",
        sa.Column("id", sa.UUID()),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("game", sa.String(16), nullable=False),
        sa.Column("variant", sa.String(12), server_default="", nullable=False),
        sa.Column("moves", postgresql.JSONB(), nullable=False),
        sa.Column("status", sa.String(8), nullable=False),
        sa.Column("scored", sa.Boolean(), nullable=False),
        sa.Column("points", sa.SmallInteger(), nullable=False),
        sa.Column("mistakes", sa.SmallInteger(), nullable=False),
        sa.Column("hints", sa.SmallInteger(), nullable=False),
        _flag("too_fast"),
        _now("started_at"),
        _now("updated_at"),
        _at("finished_at"),
        sa.PrimaryKeyConstraint("id", name="pk_daily_plays"),
        sa.UniqueConstraint("user_id", "day", "game", "variant", name="uq_daily_plays_user_day_game_variant"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_daily_plays_user_id_users", ondelete="CASCADE"),
        sa.CheckConstraint(_in("game", GAMES), name=op.f("ck_daily_plays_game")),
        sa.CheckConstraint(_in("status", ("new", "playing", "won", "lost")), name=op.f("ck_daily_plays_status")),
    )
    op.create_index("ix_daily_plays_day_scored", "daily_plays", ["day"], postgresql_where=sa.text("scored"))
    op.create_index(
        "uq_daily_plays_scored",
        "daily_plays",
        ["user_id", "day", "game"],
        unique=True,
        postgresql_where=sa.text("scored"),
    )
    op.create_table(
        "daily_themes",
        sa.Column("id", sa.String(32)),
        sa.Column("title", sa.String(60), nullable=False),
        sa.Column("blurb", sa.String(200), server_default="", nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("in_rotation", sa.Boolean(), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        _now("created_at"),
        _now("updated_at"),
        sa.PrimaryKeyConstraint("id", name="pk_daily_themes"),
    )
    op.create_table(
        "daily_theme_weeks",
        sa.Column("week_start", sa.Date()),
        sa.Column("theme_id", sa.String(32), nullable=False),
        _now("created_at"),
        sa.PrimaryKeyConstraint("week_start", name="pk_daily_theme_weeks"),
        sa.ForeignKeyConstraint(
            ["theme_id"], ["daily_themes.id"], name="fk_daily_theme_weeks_theme_id_daily_themes", ondelete="RESTRICT"
        ),
        sa.CheckConstraint("extract(dow from week_start) = 0", name=op.f("ck_daily_theme_weeks_sunday")),
    )
    op.create_index("ix_daily_theme_weeks_theme_id", "daily_theme_weeks", ["theme_id"])
    op.create_table(
        "daily_items",
        sa.Column("id", sa.UUID()),
        sa.Column("game", sa.String(16), nullable=False),
        sa.Column("theme_id", sa.String(32), nullable=False),
        sa.Column("data", postgresql.JSONB(), nullable=False),
        sa.Column("key", sa.String(240), nullable=False),
        _flag("retired"),
        sa.Column("ranking", postgresql.JSONB()),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        _now("created_at"),
        _now("updated_at"),
        sa.PrimaryKeyConstraint("id", name="pk_daily_items"),
        sa.ForeignKeyConstraint(
            ["theme_id"], ["daily_themes.id"], name="fk_daily_items_theme_id_daily_themes", ondelete="RESTRICT"
        ),
        sa.CheckConstraint(
            _in("game", ("word", "groups", "search", "quiz", "nearest")), name=op.f("ck_daily_items_game")
        ),
    )
    op.create_index("ix_daily_items_game_theme", "daily_items", ["game", "theme_id"])
    op.create_index(
        "uq_daily_items_game_key",
        "daily_items",
        ["game", "key"],
        unique=True,
        postgresql_where=sa.text("game IN ('word', 'quiz', 'nearest')"),
    )
    op.create_index(
        "uq_daily_items_game_theme_key",
        "daily_items",
        ["game", "theme_id", "key"],
        unique=True,
        postgresql_where=sa.text("game IN ('groups', 'search')"),
    )
    op.create_table(
        "daily_sets",
        sa.Column("day", sa.Date()),
        sa.Column("game", sa.String(16)),
        sa.Column("variant", sa.String(12), server_default=""),
        sa.Column("theme_id", sa.String(32)),
        sa.Column("puzzle", postgresql.JSONB(), nullable=False),
        _now("created_at"),
        sa.PrimaryKeyConstraint("day", "game", "variant", name="pk_daily_sets"),
        sa.ForeignKeyConstraint(
            ["theme_id"], ["daily_themes.id"], name="fk_daily_sets_theme_id_daily_themes", ondelete="RESTRICT"
        ),
        sa.CheckConstraint(_in("game", GAMES), name=op.f("ck_daily_sets_game")),
    )
    op.create_index("ix_daily_sets_theme_id", "daily_sets", ["theme_id"])
    op.create_table(
        "daily_set_items",
        sa.Column("day", sa.Date()),
        sa.Column("game", sa.String(16)),
        sa.Column("variant", sa.String(12), server_default=""),
        sa.Column("item_id", sa.UUID()),
        sa.PrimaryKeyConstraint("day", "game", "variant", "item_id", name="pk_daily_set_items"),
        sa.ForeignKeyConstraint(
            ["day", "game", "variant"],
            ["daily_sets.day", "daily_sets.game", "daily_sets.variant"],
            name="fk_daily_set_items_set",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["item_id"], ["daily_items.id"], name="fk_daily_set_items_item_id_daily_items", ondelete="RESTRICT"
        ),
    )
    op.create_index("ix_daily_set_items_item_id", "daily_set_items", ["item_id"])
    op.create_table(
        "daily_guess_words",
        sa.Column("word", sa.String(5)),
        sa.PrimaryKeyConstraint("word", name="pk_daily_guess_words"),
        sa.CheckConstraint("word ~ '^[A-Z]{5}$'", name=op.f("ck_daily_guess_words_word")),
    )
    op.create_table(
        "daily_nearest_words",
        sa.Column("word", sa.String(24)),
        sa.Column("tags", postgresql.JSONB(), nullable=False),
        sa.Column("near", postgresql.JSONB(), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        _now("updated_at"),
        sa.PrimaryKeyConstraint("word", name="pk_daily_nearest_words"),
        sa.CheckConstraint("word ~ '^[a-z]+$'", name=op.f("ck_daily_nearest_words_word")),
    )
    op.create_table(
        "daily_seed",
        sa.Column("id", sa.SmallInteger()),
        sa.Column("seed", sa.String(64), nullable=False),
        _now("created_at"),
        sa.PrimaryKeyConstraint("id", name="pk_daily_seed"),
        sa.CheckConstraint("id = 1", name=op.f("ck_daily_seed_one")),
    )


def _seed() -> None:
    """The rows the API can't run without."""
    roles = sa.table(
        "roles",
        sa.column("id", sa.UUID()),
        sa.column("slug", sa.String()),
        sa.column("name", sa.String()),
        sa.column("badge", sa.String()),
        sa.column("position", sa.SmallInteger()),
        sa.column("built_in", sa.Boolean()),
        sa.column("locked", sa.Boolean()),
    )
    role_ids = {role[0]: uuid.uuid4() for role in ROLES}
    op.bulk_insert(
        roles,
        [
            {
                "id": role_ids[slug],
                "slug": slug,
                "name": name,
                "badge": badge,
                "position": n,
                "built_in": built_in,
                "locked": locked,
            }
            for n, (slug, name, badge, built_in, locked) in enumerate(ROLES)
        ],
    )
    role_boxes = sa.table("role_boxes", sa.column("role_id", sa.UUID()), sa.column("box", sa.String()))
    op.bulk_insert(
        role_boxes, [{"role_id": role_ids[slug], "box": box} for slug, boxes in BOXES.items() for box in boxes]
    )
    switches = sa.table("feature_switches", sa.column("feature", sa.String()), sa.column("mode", sa.String()))
    op.bulk_insert(
        switches,
        [{"feature": f, "mode": "everyone"} for f in ON_FOR_EVERYONE]
        + [{"feature": f, "mode": "off"} for f in SWITCHED_OFF],
    )
    op.bulk_insert(sa.table("noora_limits", sa.column("id", sa.SmallInteger())), [{"id": 1}])
    categories = sa.table(
        "forum_categories",
        sa.column("id", sa.String()),
        sa.column("label", sa.String()),
        sa.column("short", sa.String()),
        sa.column("year", sa.SmallInteger()),
        sa.column("blurb", sa.String()),
        sa.column("icon", sa.String()),
        sa.column("position", sa.Integer()),
    )
    op.bulk_insert(
        categories,
        [
            {"id": i, "label": label, "short": short, "year": year, "blurb": blurb, "icon": icon, "position": n}
            for n, (i, label, short, year, blurb, icon) in enumerate(FORUM_CATEGORIES)
        ],
    )
    tags = sa.table(
        "forum_tags", sa.column("id", sa.String()), sa.column("label", sa.String()), sa.column("position", sa.Integer())
    )
    op.bulk_insert(tags, [{"id": i, "label": label, "position": n} for n, (i, label) in enumerate(FORUM_TAGS)])


# ── undoing it ───────────────────────────────────────────────────────────────────────────────

TABLES = (  # every table, in the order upgrade() makes them
    *("users", "user_sessions", "otp_challenges", "roles", "role_boxes", "user_roles"),
    *("feature_switches", "feature_switch_roles", "audit_log"),
    *("modules", "chapters", "lessons", "lesson_views", "lesson_resume", "video_suggestions", "content_docs"),
    *("calendar_events", "personal_events", "calendar_prefs"),
    *("forum_categories", "forum_tags", "forum_threads", "forum_replies", "forum_thread_votes", "forum_reply_votes"),
    *("forum_follows", "senior_profiles"),
    *("drive_folders", "library_items", "library_texts", "library_stars", "paper_questions", "paper_question_flags"),
    *("newsletter_issues", "newsletter_reactions", "newsletter_poll_votes"),
    *("notifications", "email_outbox", "weekly_summaries"),
    *("reports", "requests", "request_me_toos", "bug_reports"),
    *("boards", "board_columns", "board_labels", "board_plans", "board_cards", "board_card_labels", "board_comments"),
    *("uploads", "notebooks", "notes", "note_ink"),
    *("noora_limits", "noora_usage"),
    *("daily_profiles", "daily_plays", "daily_themes", "daily_theme_weeks", "daily_items", "daily_sets"),
    *("daily_set_items", "daily_guess_words", "daily_nearest_words", "daily_seed"),
)


def downgrade() -> None:
    """Drops every table, with its indexes, constraints and sequences. The two keys that tie tables to each other
    go first."""
    op.drop_constraint("fk_uploads_note_id_notes", "uploads", type_="foreignkey")
    op.drop_constraint("fk_forum_threads_accepted_reply_id_forum_replies", "forum_threads", type_="foreignkey")
    for table in reversed(TABLES):
        op.drop_table(table)
