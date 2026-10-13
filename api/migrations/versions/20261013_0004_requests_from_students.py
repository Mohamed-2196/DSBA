"""requests from students: the requests, their me-toos, the requests.manage box for Rep, and the feature's switch

Revision ID: 0004
Revises: 0003
Create Date: 2026-10-13 23:59:34

Reports may now name a request, and a status change sends a request_update notification, so both CHECKs widen. The
feature arrives switched off: an admin switches it on from the Access screen.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0004"
down_revision: str | None = "0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

REPORT_TARGETS = ("thread", "reply", "library_item")
NOTIFICATION_KINDS = (
    "thread_reply",
    "reply_reply",
    "answer_accepted",
    "upload_published",
    "upload_rejected",
    "new_issue",
    "report_resolved",
    "system",
)


def _in(column: str, values: Sequence[str]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


def _checks(targets: Sequence[str], kinds: Sequence[str]) -> None:
    op.drop_constraint(op.f("ck_reports_target_type"), "reports", type_="check")
    op.create_check_constraint(op.f("ck_reports_target_type"), "reports", _in("target_type", targets))
    op.drop_constraint(op.f("ck_notifications_kind"), "notifications", type_="check")
    op.create_check_constraint(op.f("ck_notifications_kind"), "notifications", _in("kind", kinds))


def upgrade() -> None:
    op.create_table(
        "requests",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("author_id", sa.UUID(), nullable=True),
        sa.Column("kind", sa.String(length=16), nullable=False),
        sa.Column("title", sa.String(length=140), nullable=False),
        sa.Column("details", sa.Text(), server_default="", nullable=False),
        sa.Column("module_id", sa.String(length=64), nullable=True),
        sa.Column(
            "status",
            sa.Enum(
                "open",
                "planned",
                "done",
                "declined",
                name="requeststatus",
                native_enum=False,
                create_constraint=True,
                length=10,
            ),
            server_default="open",
            nullable=False,
        ),
        sa.Column("me_too_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("reply", sa.Text(), nullable=True),
        sa.Column("answered_by", sa.UUID(), nullable=True),
        sa.Column("answered_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("removed_by", sa.UUID(), nullable=True),
        sa.Column("removed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column(
            "search_vector",
            postgresql.TSVECTOR(),
            sa.Computed(
                "setweight(to_tsvector('simple', coalesce(title, '')), 'A') || setweight(to_tsvector('simple', coalesce(details, '')), 'B')",
                persisted=True,
            ),
            nullable=False,
        ),
        sa.CheckConstraint("kind IN ('paper', 'fix', 'event', 'feature', 'other')", name=op.f("ck_requests_kind")),
        sa.ForeignKeyConstraint(
            ["answered_by"], ["users.id"], name=op.f("fk_requests_answered_by_users"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["author_id"], ["users.id"], name=op.f("fk_requests_author_id_users"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["module_id"], ["modules.id"], name=op.f("fk_requests_module_id_modules"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["removed_by"], ["users.id"], name=op.f("fk_requests_removed_by_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_requests")),
    )
    op.create_index("ix_requests_answered_by", "requests", ["answered_by"], unique=False)
    op.create_index("ix_requests_author_created", "requests", ["author_id", "created_at"], unique=False)
    op.create_index("ix_requests_module", "requests", ["module_id"], unique=False)
    op.create_index(
        "ix_requests_queue",
        "requests",
        ["me_too_count", "created_at"],
        unique=False,
        postgresql_where=sa.text("removed_at IS NULL"),
    )
    op.create_index("ix_requests_removed_by", "requests", ["removed_by"], unique=False)
    op.create_index("ix_requests_search", "requests", ["search_vector"], unique=False, postgresql_using="gin")
    op.create_table(
        "request_me_toos",
        sa.Column("request_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["request_id"], ["requests.id"], name=op.f("fk_request_me_toos_request_id_requests"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_request_me_toos_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("request_id", "user_id", name=op.f("pk_request_me_toos")),
    )
    op.create_index("ix_request_me_toos_user", "request_me_toos", ["user_id"], unique=False)

    _checks((*REPORT_TARGETS, "request"), (*NOTIFICATION_KINDS[:-1], "request_update", "system"))
    conn = op.get_bind()
    conn.execute(
        sa.text("INSERT INTO role_boxes (role_id, box) SELECT id, 'requests.manage' FROM roles WHERE slug = 'rep'")
    )
    conn.execute(sa.text("INSERT INTO feature_switches (feature, mode) VALUES ('requests', 'off')"))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM feature_switch_roles WHERE feature = 'requests'"))
    conn.execute(sa.text("DELETE FROM feature_switches WHERE feature = 'requests'"))
    conn.execute(sa.text("DELETE FROM role_boxes WHERE box = 'requests.manage'"))
    conn.execute(sa.text("DELETE FROM notifications WHERE kind = 'request_update'"))
    conn.execute(sa.text("DELETE FROM reports WHERE target_type = 'request'"))
    _checks(REPORT_TARGETS, NOTIFICATION_KINDS)
    op.drop_index("ix_request_me_toos_user", table_name="request_me_toos")
    op.drop_table("request_me_toos")
    op.drop_index("ix_requests_search", table_name="requests", postgresql_using="gin")
    op.drop_index("ix_requests_removed_by", table_name="requests")
    op.drop_index("ix_requests_queue", table_name="requests", postgresql_where=sa.text("removed_at IS NULL"))
    op.drop_index("ix_requests_module", table_name="requests")
    op.drop_index("ix_requests_author_created", table_name="requests")
    op.drop_index("ix_requests_answered_by", table_name="requests")
    op.drop_table("requests")
