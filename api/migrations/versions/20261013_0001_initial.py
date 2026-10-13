"""the whole schema, with the ready-made roles and every feature's switch

Revision ID: 0001
Revises:
Create Date: 2026-10-13 12:00:00

The roles and switches are seeded here, not by `python -m app.cli seed`. The API can't run without them, so every
database built by `alembic upgrade head` has them. And `seed`, which the API container runs on every start, never
touches what admins have changed since.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0001"
down_revision: str | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ROLES = [  # slug, name, badge, position, built_in, locked
    ("admin", "Admin", "Admin", 0, True, True),
    ("rep", "Rep", "Student rep", 1, True, False),
    ("student", "Student", None, 2, True, False),
    ("newsletter-manager", "Newsletter manager", "Newsletter", 3, False, False),
    ("content-manager", "Content manager", "Content", 4, False, False),
]
BOXES = {  # Admin holds every box without listing them
    "student": ("forum.post", "library.upload", "newsletter.react", "reports.create"),
    "rep": ("forum.moderate", "library.manage", "newsletter.manage", "calendar.manage", "stats.view"),
    "newsletter-manager": ("newsletter.manage",),
    "content-manager": ("calendar.manage", "career.edit", "content.edit"),
}
FEATURES = ("forum", "library", "library.uploads", "newsletter", "calendar", "career", "grades", "noora")


def upgrade() -> None:
    op.create_table(
        "modules",
        sa.Column("id", sa.String(length=64), nullable=False),
        sa.Column("unit_code", sa.String(length=16), nullable=True),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("short_name", sa.String(length=60), nullable=False),
        sa.Column("year", sa.SmallInteger(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("icon", sa.String(length=40), nullable=True),
        sa.Column("resources", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("chapters", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("year BETWEEN 1 AND 3", name=op.f("ck_modules_year_range")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_modules")),
    )
    op.create_table(
        "roles",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("slug", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=40), nullable=False),
        sa.Column("badge", sa.String(length=24), nullable=True),
        sa.Column("position", sa.SmallInteger(), server_default="100", nullable=False),
        sa.Column("built_in", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("locked", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_roles")),
        sa.UniqueConstraint("name", name=op.f("uq_roles_name")),
        sa.UniqueConstraint("slug", name=op.f("uq_roles_slug")),
    )
    op.create_table(
        "users",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("email", sa.String(length=254), nullable=True),
        sa.Column("phone", sa.String(length=20), nullable=True),
        sa.Column("display_name", sa.String(length=60), nullable=True),
        sa.Column("year", sa.SmallInteger(), nullable=True),
        sa.Column(
            "status",
            sa.Enum("active", "suspended", name="userstatus", native_enum=False, create_constraint=True, length=20),
            server_default="active",
            nullable=False,
        ),
        sa.Column(
            "preferences",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'{}'::jsonb"),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("email IS NOT NULL OR phone IS NOT NULL", name=op.f("ck_users_has_identifier")),
        sa.CheckConstraint("year IS NULL OR year BETWEEN 1 AND 3", name=op.f("ck_users_year_range")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_users")),
        sa.UniqueConstraint("email", name=op.f("uq_users_email")),
        sa.UniqueConstraint("phone", name=op.f("uq_users_phone")),
    )
    op.create_table(
        "audit_log",
        sa.Column("id", sa.BigInteger(), autoincrement=True, nullable=False),
        sa.Column("actor_id", sa.UUID(), nullable=True),
        sa.Column("action", sa.String(length=64), nullable=False),
        sa.Column("target_type", sa.String(length=32), nullable=True),
        sa.Column("target_id", sa.String(length=64), nullable=True),
        sa.Column(
            "data", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False
        ),
        sa.Column("ip", postgresql.INET(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["actor_id"], ["users.id"], name=op.f("fk_audit_log_actor_id_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_audit_log")),
    )
    op.create_index("ix_audit_log_actor", "audit_log", ["actor_id"], unique=False)
    op.create_index("ix_audit_log_created", "audit_log", ["created_at"], unique=False)
    op.create_table(
        "calendar_events",
        sa.Column("id", sa.String(length=120), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("end_date", sa.Date(), nullable=True),
        sa.Column("time", sa.String(length=40), nullable=True),
        sa.Column("place", sa.String(length=120), nullable=True),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("type", sa.String(length=16), nullable=False),
        sa.Column("year", sa.SmallInteger(), nullable=True),
        sa.Column("module_id", sa.String(length=64), nullable=True),
        sa.Column("unit_code", sa.String(length=16), nullable=True),
        sa.Column("sample", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("created_by", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "type IN ('exam', 'mock', 'revision', 'deadline', 'event', 'break', 'term')",
            name=op.f("ck_calendar_events_type"),
        ),
        sa.CheckConstraint("end_date IS NULL OR end_date >= date", name=op.f("ck_calendar_events_end_after_start")),
        sa.CheckConstraint("year IS NULL OR year BETWEEN 1 AND 3", name=op.f("ck_calendar_events_year_range")),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"], name=op.f("fk_calendar_events_created_by_users"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["module_id"], ["modules.id"], name=op.f("fk_calendar_events_module_id_modules"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_calendar_events")),
    )
    op.create_index("ix_calendar_events_created_by", "calendar_events", ["created_by"], unique=False)
    op.create_index("ix_calendar_events_date", "calendar_events", ["date"], unique=False)
    op.create_table(
        "content_docs",
        sa.Column("key", sa.String(length=64), nullable=False),
        sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_by", sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(
            ["updated_by"], ["users.id"], name=op.f("fk_content_docs_updated_by_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("key", name=op.f("pk_content_docs")),
    )
    op.create_table(
        "feature_switches",
        sa.Column("feature", sa.String(length=40), nullable=False),
        sa.Column("mode", sa.String(length=10), server_default="everyone", nullable=False),
        sa.Column("updated_by", sa.UUID(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint("mode IN ('off', 'roles', 'everyone')", name=op.f("ck_feature_switches_mode")),
        sa.ForeignKeyConstraint(
            ["updated_by"], ["users.id"], name=op.f("fk_feature_switches_updated_by_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("feature", name=op.f("pk_feature_switches")),
    )
    op.create_index("ix_feature_switches_updated_by", "feature_switches", ["updated_by"], unique=False)
    op.create_table(
        "forum_threads",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("category", sa.String(length=32), nullable=False),
        sa.Column("module_id", sa.String(length=64), nullable=True),
        sa.Column("tags", sa.ARRAY(sa.String(length=32)), server_default="{}", nullable=False),
        sa.Column("author_id", sa.UUID(), nullable=True),
        sa.Column("author_year", sa.SmallInteger(), nullable=True),
        sa.Column("pinned", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("locked", sa.Boolean(), server_default="false", nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "visible", "hidden", "deleted", name="poststatus", native_enum=False, create_constraint=True, length=10
            ),
            nullable=False,
        ),
        sa.Column("accepted_reply_id", sa.UUID(), nullable=True),
        sa.Column("vote_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("reply_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("last_activity_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column(
            "search_vector",
            postgresql.TSVECTOR(),
            sa.Computed(
                "setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('simple', coalesce(body, '')), 'B')",
                persisted=True,
            ),
            nullable=False,
        ),
        sa.CheckConstraint(
            "author_year IS NULL OR author_year BETWEEN 1 AND 3", name=op.f("ck_forum_threads_author_year_range")
        ),
        sa.ForeignKeyConstraint(
            ["author_id"], ["users.id"], name=op.f("fk_forum_threads_author_id_users"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["module_id"], ["modules.id"], name=op.f("fk_forum_threads_module_id_modules"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_forum_threads")),
        sa.UniqueConstraint("slug", name=op.f("uq_forum_threads_slug")),
    )
    op.create_index("ix_forum_threads_author", "forum_threads", ["author_id"], unique=False)
    op.create_index("ix_forum_threads_category", "forum_threads", ["category"], unique=False)
    op.create_index("ix_forum_threads_module", "forum_threads", ["module_id"], unique=False)
    op.create_index("ix_forum_threads_search", "forum_threads", ["search_vector"], unique=False, postgresql_using="gin")
    op.create_table(
        "lesson_resume",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("module_id", sa.String(length=64), nullable=False),
        sa.Column("chapter", sa.SmallInteger(), nullable=False),
        sa.Column("video", sa.SmallInteger(), nullable=False),
        sa.Column("opened_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["module_id"], ["modules.id"], name=op.f("fk_lesson_resume_module_id_modules"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_lesson_resume_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id", "module_id", name=op.f("pk_lesson_resume")),
    )
    op.create_table(
        "lesson_views",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("lesson_key", sa.String(length=96), nullable=False),
        sa.Column("module_id", sa.String(length=64), nullable=False),
        sa.Column("watched_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["module_id"], ["modules.id"], name=op.f("fk_lesson_views_module_id_modules"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_lesson_views_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id", "lesson_key", name=op.f("pk_lesson_views")),
    )
    op.create_table(
        "library_items",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column(
            "source",
            sa.Enum("file", "link", name="itemsource", native_enum=False, create_constraint=True, length=8),
            nullable=False,
        ),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("module_id", sa.String(length=64), nullable=True),
        sa.Column("year", sa.SmallInteger(), nullable=True),
        sa.Column("url", sa.Text(), nullable=True),
        sa.Column("storage_key", sa.Text(), nullable=True),
        sa.Column("file_name", sa.String(length=255), nullable=True),
        sa.Column("content_type", sa.String(length=127), nullable=True),
        sa.Column("size_bytes", sa.BigInteger(), nullable=True),
        sa.Column("exam_year", sa.SmallInteger(), nullable=True),
        sa.Column("zone", sa.String(length=8), nullable=True),
        sa.Column("author_name", sa.String(length=120), nullable=True),
        sa.Column("import_key", sa.String(length=200), nullable=True),
        sa.Column("uploaded_by", sa.UUID(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "pending",
                "published",
                "rejected",
                "removed",
                name="itemstatus",
                native_enum=False,
                create_constraint=True,
                length=12,
            ),
            nullable=False,
        ),
        sa.Column("review_note", sa.Text(), nullable=True),
        sa.Column("reviewed_by", sa.UUID(), nullable=True),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("download_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "search_vector",
            postgresql.TSVECTOR(),
            sa.Computed(
                "setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('simple', coalesce(description, '')), 'B') || setweight(to_tsvector('simple', coalesce(author_name, '') || ' ' || coalesce(file_name, '')), 'C')",
                persisted=True,
            ),
            nullable=False,
        ),
        sa.CheckConstraint(
            "kind IN ('past-paper', 'examiners-report', 'subject-guide', 'reading', 'study-guide', 'exercises', 'notes', 'cheat-sheet', 'course-materials', 'vle-materials', 'other')",
            name=op.f("ck_library_items_kind"),
        ),
        sa.CheckConstraint("year IS NULL OR year BETWEEN 1 AND 3", name=op.f("ck_library_items_year_range")),
        sa.ForeignKeyConstraint(
            ["module_id"], ["modules.id"], name=op.f("fk_library_items_module_id_modules"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["reviewed_by"], ["users.id"], name=op.f("fk_library_items_reviewed_by_users"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["uploaded_by"], ["users.id"], name=op.f("fk_library_items_uploaded_by_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_library_items")),
        sa.UniqueConstraint("import_key", name=op.f("uq_library_items_import_key")),
        sa.UniqueConstraint("slug", name=op.f("uq_library_items_slug")),
    )
    op.create_index("ix_library_items_module", "library_items", ["module_id"], unique=False)
    op.create_index("ix_library_items_reviewed_by", "library_items", ["reviewed_by"], unique=False)
    op.create_index("ix_library_items_search", "library_items", ["search_vector"], unique=False, postgresql_using="gin")
    op.create_index(
        "ix_library_items_status_newest",
        "library_items",
        ["status", sa.literal_column("coalesce(published_at, created_at)")],
        unique=False,
    )
    op.create_index("ix_library_items_uploaded_by", "library_items", ["uploaded_by"], unique=False)
    op.create_table(
        "newsletter_issues",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("slug", sa.String(length=120), nullable=False),
        sa.Column("number", sa.Integer(), nullable=False),
        sa.Column("title", sa.String(length=160), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("cover", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("dek", sa.Text(), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("editors", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("sections", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column(
            "status",
            sa.Enum("draft", "published", name="issuestatus", native_enum=False, create_constraint=True, length=10),
            nullable=False,
        ),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.UUID(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "search_vector",
            postgresql.TSVECTOR(),
            sa.Computed(
                "setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('simple', coalesce(dek, '') || ' ' || coalesce(summary, '')), 'B') || setweight(jsonb_to_tsvector('simple', sections, '[\"string\"]'), 'C')",
                persisted=True,
            ),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"], name=op.f("fk_newsletter_issues_created_by_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_newsletter_issues")),
        sa.UniqueConstraint("slug", name=op.f("uq_newsletter_issues_slug")),
    )
    op.create_index("ix_newsletter_issues_created_by", "newsletter_issues", ["created_by"], unique=False)
    op.create_index(
        "ix_newsletter_issues_search", "newsletter_issues", ["search_vector"], unique=False, postgresql_using="gin"
    )
    op.create_table(
        "notifications",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("kind", sa.String(length=40), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("body", sa.Text(), nullable=True),
        sa.Column("url", sa.String(length=300), nullable=True),
        sa.Column("actor_id", sa.UUID(), nullable=True),
        sa.Column(
            "data", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("read_at", sa.DateTime(timezone=True), nullable=True),
        sa.CheckConstraint(
            "kind IN ('thread_reply', 'reply_reply', 'answer_accepted', 'upload_published', 'upload_rejected', 'new_issue', 'report_resolved', 'system')",
            name=op.f("ck_notifications_kind"),
        ),
        sa.ForeignKeyConstraint(
            ["actor_id"], ["users.id"], name=op.f("fk_notifications_actor_id_users"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_notifications_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_notifications")),
    )
    op.create_index("ix_notifications_actor", "notifications", ["actor_id"], unique=False)
    op.create_index("ix_notifications_user_created", "notifications", ["user_id", "created_at"], unique=False)
    op.create_index(
        "ix_notifications_user_unread",
        "notifications",
        ["user_id"],
        unique=False,
        postgresql_where=sa.text("read_at IS NULL"),
    )
    op.create_table(
        "otp_challenges",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column(
            "purpose",
            sa.Enum(
                "sign_in", "add_identifier", name="otppurpose", native_enum=False, create_constraint=True, length=20
            ),
            nullable=False,
        ),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column(
            "channel",
            sa.Enum("email", "sms", name="channel", native_enum=False, create_constraint=True, length=10),
            nullable=False,
        ),
        sa.Column("identifier", sa.String(length=254), nullable=False),
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("attempts", sa.SmallInteger(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ip", postgresql.INET(), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_otp_challenges_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_otp_challenges")),
    )
    op.create_index(
        "ix_otp_challenges_identifier_created", "otp_challenges", ["identifier", "created_at"], unique=False
    )
    op.create_index("ix_otp_challenges_ip_created", "otp_challenges", ["ip", "created_at"], unique=False)
    op.create_index("ix_otp_challenges_user_created", "otp_challenges", ["user_id", "created_at"], unique=False)
    op.create_table(
        "reports",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("reporter_id", sa.UUID(), nullable=True),
        sa.Column("target_type", sa.String(length=20), nullable=False),
        sa.Column("target_id", sa.UUID(), nullable=False),
        sa.Column("reason", sa.String(length=20), nullable=False),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "open",
                "resolved",
                "dismissed",
                name="reportstatus",
                native_enum=False,
                create_constraint=True,
                length=10,
            ),
            server_default="open",
            nullable=False,
        ),
        sa.Column("resolved_by", sa.UUID(), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolution_note", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "reason IN ('spam', 'harassment', 'inappropriate', 'copyright', 'other')", name=op.f("ck_reports_reason")
        ),
        sa.CheckConstraint("target_type IN ('thread', 'reply', 'library_item')", name=op.f("ck_reports_target_type")),
        sa.ForeignKeyConstraint(
            ["reporter_id"], ["users.id"], name=op.f("fk_reports_reporter_id_users"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["resolved_by"], ["users.id"], name=op.f("fk_reports_resolved_by_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_reports")),
    )
    op.create_index("ix_reports_reporter_created", "reports", ["reporter_id", "created_at"], unique=False)
    op.create_index("ix_reports_resolved_by", "reports", ["resolved_by"], unique=False)
    op.create_index("ix_reports_status_created", "reports", ["status", "created_at"], unique=False)
    op.create_index("ix_reports_target", "reports", ["target_type", "target_id"], unique=False)
    op.create_index(
        "uq_reports_open_per_reporter",
        "reports",
        ["reporter_id", "target_type", "target_id"],
        unique=True,
        postgresql_where=sa.text("status = 'open'"),
    )
    op.create_table(
        "role_boxes",
        sa.Column("role_id", sa.UUID(), nullable=False),
        sa.Column("box", sa.String(length=40), nullable=False),
        sa.ForeignKeyConstraint(
            ["role_id"], ["roles.id"], name=op.f("fk_role_boxes_role_id_roles"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("role_id", "box", name=op.f("pk_role_boxes")),
    )
    op.create_table(
        "user_roles",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("role_id", sa.UUID(), nullable=False),
        sa.Column("given_by", sa.UUID(), nullable=True),
        sa.Column("given_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["given_by"], ["users.id"], name=op.f("fk_user_roles_given_by_users"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["role_id"], ["roles.id"], name=op.f("fk_user_roles_role_id_roles"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_user_roles_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id", "role_id", name=op.f("pk_user_roles")),
    )
    op.create_index("ix_user_roles_given_by", "user_roles", ["given_by"], unique=False)
    op.create_index("ix_user_roles_role", "user_roles", ["role_id"], unique=False)
    op.create_table(
        "user_sessions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_seen_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("revoked_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("ip", postgresql.INET(), nullable=True),
        sa.Column("user_agent", sa.String(length=300), nullable=True),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_user_sessions_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_user_sessions")),
        sa.UniqueConstraint("token_hash", name=op.f("uq_user_sessions_token_hash")),
    )
    op.create_index("ix_user_sessions_user", "user_sessions", ["user_id"], unique=False)
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
    op.create_index("ix_email_outbox_created", "email_outbox", ["created_at"], unique=False)
    op.create_index(
        "ix_email_outbox_due",
        "email_outbox",
        ["next_attempt_at"],
        unique=False,
        postgresql_where=sa.text("status = 'pending'"),
    )
    op.create_index("ix_email_outbox_notification", "email_outbox", ["notification_id"], unique=False)
    op.create_index("ix_email_outbox_user", "email_outbox", ["user_id"], unique=False)
    op.create_table(
        "feature_switch_roles",
        sa.Column("feature", sa.String(length=40), nullable=False),
        sa.Column("role_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["feature"],
            ["feature_switches.feature"],
            name=op.f("fk_feature_switch_roles_feature_feature_switches"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["role_id"], ["roles.id"], name=op.f("fk_feature_switch_roles_role_id_roles"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("feature", "role_id", name=op.f("pk_feature_switch_roles")),
    )
    op.create_index("ix_feature_switch_roles_role", "feature_switch_roles", ["role_id"], unique=False)
    op.create_table(
        "forum_replies",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("thread_id", sa.UUID(), nullable=False),
        sa.Column("parent_id", sa.UUID(), nullable=True),
        sa.Column("author_id", sa.UUID(), nullable=True),
        sa.Column("author_year", sa.SmallInteger(), nullable=True),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "visible", "hidden", "deleted", name="poststatus", native_enum=False, create_constraint=True, length=10
            ),
            nullable=False,
        ),
        sa.Column("vote_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("edited_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("deleted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column(
            "search_vector",
            postgresql.TSVECTOR(),
            sa.Computed("to_tsvector('simple', coalesce(body, ''))", persisted=True),
            nullable=False,
        ),
        sa.CheckConstraint(
            "author_year IS NULL OR author_year BETWEEN 1 AND 3", name=op.f("ck_forum_replies_author_year_range")
        ),
        sa.ForeignKeyConstraint(
            ["author_id"], ["users.id"], name=op.f("fk_forum_replies_author_id_users"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["parent_id"],
            ["forum_replies.id"],
            name=op.f("fk_forum_replies_parent_id_forum_replies"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["thread_id"],
            ["forum_threads.id"],
            name=op.f("fk_forum_replies_thread_id_forum_threads"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_forum_replies")),
    )
    op.create_index("ix_forum_replies_author", "forum_replies", ["author_id"], unique=False)
    op.create_index("ix_forum_replies_parent", "forum_replies", ["parent_id"], unique=False)
    op.create_index("ix_forum_replies_search", "forum_replies", ["search_vector"], unique=False, postgresql_using="gin")
    op.create_index("ix_forum_replies_thread_created", "forum_replies", ["thread_id", "created_at"], unique=False)
    # forum_threads.accepted_reply_id -> forum_replies: the two tables refer to each other, so this key comes after both
    op.create_foreign_key(
        op.f("fk_forum_threads_accepted_reply_id_forum_replies"),
        "forum_threads",
        "forum_replies",
        ["accepted_reply_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_table(
        "forum_thread_votes",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("thread_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["thread_id"],
            ["forum_threads.id"],
            name=op.f("fk_forum_thread_votes_thread_id_forum_threads"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_forum_thread_votes_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id", "thread_id", name=op.f("pk_forum_thread_votes")),
    )
    op.create_table(
        "library_stars",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("item_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["item_id"], ["library_items.id"], name=op.f("fk_library_stars_item_id_library_items"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_library_stars_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id", "item_id", name=op.f("pk_library_stars")),
    )
    op.create_table(
        "newsletter_reactions",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("issue_id", sa.UUID(), nullable=False),
        sa.Column("section_id", sa.String(length=64), nullable=False),
        sa.Column("reaction", sa.String(length=16), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["issue_id"],
            ["newsletter_issues.id"],
            name=op.f("fk_newsletter_reactions_issue_id_newsletter_issues"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_newsletter_reactions_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id", "issue_id", "section_id", "reaction", name=op.f("pk_newsletter_reactions")),
    )
    op.create_table(
        "forum_reply_votes",
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("reply_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["reply_id"],
            ["forum_replies.id"],
            name=op.f("fk_forum_reply_votes_reply_id_forum_replies"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_forum_reply_votes_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("user_id", "reply_id", name=op.f("pk_forum_reply_votes")),
    )
    op.create_table(
        "uploads",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=True),
        sa.Column(
            "purpose",
            sa.Enum(
                "library", "forum_image", name="uploadpurpose", native_enum=False, create_constraint=True, length=20
            ),
            nullable=False,
        ),
        sa.Column("storage_key", sa.Text(), nullable=False),
        sa.Column("file_name", sa.String(length=255), nullable=False),
        sa.Column("content_type", sa.String(length=127), nullable=False),
        sa.Column("size_bytes", sa.BigInteger(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "pending",
                "uploaded",
                "attached",
                name="uploadstatus",
                native_enum=False,
                create_constraint=True,
                length=12,
            ),
            nullable=False,
        ),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("thread_id", sa.UUID(), nullable=True),
        sa.Column("reply_id", sa.UUID(), nullable=True),
        sa.ForeignKeyConstraint(
            ["reply_id"], ["forum_replies.id"], name=op.f("fk_uploads_reply_id_forum_replies"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["thread_id"], ["forum_threads.id"], name=op.f("fk_uploads_thread_id_forum_threads"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_uploads_user_id_users"), ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_uploads")),
        sa.UniqueConstraint("storage_key", name=op.f("uq_uploads_storage_key")),
    )
    op.create_index("ix_uploads_status_created", "uploads", ["status", "created_at"], unique=False)
    op.create_index("ix_uploads_user_created", "uploads", ["user_id", "created_at"], unique=False)
    _seed()


def downgrade() -> None:
    op.drop_constraint(op.f("fk_forum_threads_accepted_reply_id_forum_replies"), "forum_threads", type_="foreignkey")
    op.drop_index("ix_uploads_user_created", table_name="uploads")
    op.drop_index("ix_uploads_status_created", table_name="uploads")
    op.drop_table("uploads")
    op.drop_table("forum_reply_votes")
    op.drop_table("newsletter_reactions")
    op.drop_table("library_stars")
    op.drop_table("forum_thread_votes")
    op.drop_index("ix_forum_replies_thread_created", table_name="forum_replies")
    op.drop_index("ix_forum_replies_search", table_name="forum_replies", postgresql_using="gin")
    op.drop_index("ix_forum_replies_parent", table_name="forum_replies")
    op.drop_index("ix_forum_replies_author", table_name="forum_replies")
    op.drop_table("forum_replies")
    op.drop_index("ix_feature_switch_roles_role", table_name="feature_switch_roles")
    op.drop_table("feature_switch_roles")
    op.drop_index("ix_email_outbox_user", table_name="email_outbox")
    op.drop_index("ix_email_outbox_notification", table_name="email_outbox")
    op.drop_index("ix_email_outbox_due", table_name="email_outbox", postgresql_where=sa.text("status = 'pending'"))
    op.drop_index("ix_email_outbox_created", table_name="email_outbox")
    op.drop_table("email_outbox")
    op.drop_index("ix_user_sessions_user", table_name="user_sessions")
    op.drop_table("user_sessions")
    op.drop_index("ix_user_roles_role", table_name="user_roles")
    op.drop_index("ix_user_roles_given_by", table_name="user_roles")
    op.drop_table("user_roles")
    op.drop_table("role_boxes")
    op.drop_index("uq_reports_open_per_reporter", table_name="reports", postgresql_where=sa.text("status = 'open'"))
    op.drop_index("ix_reports_target", table_name="reports")
    op.drop_index("ix_reports_status_created", table_name="reports")
    op.drop_index("ix_reports_resolved_by", table_name="reports")
    op.drop_index("ix_reports_reporter_created", table_name="reports")
    op.drop_table("reports")
    op.drop_index("ix_otp_challenges_user_created", table_name="otp_challenges")
    op.drop_index("ix_otp_challenges_ip_created", table_name="otp_challenges")
    op.drop_index("ix_otp_challenges_identifier_created", table_name="otp_challenges")
    op.drop_table("otp_challenges")
    op.drop_index(
        "ix_notifications_user_unread", table_name="notifications", postgresql_where=sa.text("read_at IS NULL")
    )
    op.drop_index("ix_notifications_user_created", table_name="notifications")
    op.drop_index("ix_notifications_actor", table_name="notifications")
    op.drop_table("notifications")
    op.drop_index("ix_newsletter_issues_search", table_name="newsletter_issues", postgresql_using="gin")
    op.drop_index("ix_newsletter_issues_created_by", table_name="newsletter_issues")
    op.drop_table("newsletter_issues")
    op.drop_index("ix_library_items_uploaded_by", table_name="library_items")
    op.drop_index("ix_library_items_status_newest", table_name="library_items")
    op.drop_index("ix_library_items_search", table_name="library_items", postgresql_using="gin")
    op.drop_index("ix_library_items_reviewed_by", table_name="library_items")
    op.drop_index("ix_library_items_module", table_name="library_items")
    op.drop_table("library_items")
    op.drop_table("lesson_views")
    op.drop_table("lesson_resume")
    op.drop_index("ix_forum_threads_search", table_name="forum_threads", postgresql_using="gin")
    op.drop_index("ix_forum_threads_module", table_name="forum_threads")
    op.drop_index("ix_forum_threads_category", table_name="forum_threads")
    op.drop_index("ix_forum_threads_author", table_name="forum_threads")
    op.drop_table("forum_threads")
    op.drop_index("ix_feature_switches_updated_by", table_name="feature_switches")
    op.drop_table("feature_switches")
    op.drop_table("content_docs")
    op.drop_index("ix_calendar_events_date", table_name="calendar_events")
    op.drop_index("ix_calendar_events_created_by", table_name="calendar_events")
    op.drop_table("calendar_events")
    op.drop_index("ix_audit_log_created", table_name="audit_log")
    op.drop_index("ix_audit_log_actor", table_name="audit_log")
    op.drop_table("audit_log")
    op.drop_table("users")
    op.drop_table("roles")
    op.drop_table("modules")


def _seed() -> None:
    conn = op.get_bind()
    for slug, name, badge, position, built_in, locked in ROLES:
        conn.execute(
            sa.text(
                "INSERT INTO roles (id, slug, name, badge, position, built_in, locked) "
                "VALUES (gen_random_uuid(), :slug, :name, :badge, :position, :built_in, :locked)"
            ),
            {"slug": slug, "name": name, "badge": badge, "position": position, "built_in": built_in, "locked": locked},
        )
    for slug, boxes in BOXES.items():
        for box in boxes:
            conn.execute(
                sa.text("INSERT INTO role_boxes (role_id, box) SELECT id, :box FROM roles WHERE slug = :slug"),
                {"slug": slug, "box": box},
            )
    for feature in FEATURES:
        conn.execute(
            sa.text("INSERT INTO feature_switches (feature, mode) VALUES (:feature, 'everyone')"), {"feature": feature}
        )
