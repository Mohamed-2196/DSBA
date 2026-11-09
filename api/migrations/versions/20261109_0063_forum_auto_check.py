"""the forum's automatic check

Revision ID: 0062
Revises: 0061
Create Date: 2026-11-08 12:00:00

- `content_checks`: Claude's check of each new forum picture, thread and reply (app/services/forum/checks.py): one row
  per target, with its verdict, category, short reason and cost.
- `uploads.check_state`: a forum picture the check holds ('checking', 'held' or 'removed').
- `reports`: the Hub reports forum pictures (target 'image') and has two reasons of its own ('hub_flagged',
  'hub_unchecked'), with no reporter.
- The `forum.auto-check` switch is stored off on every install: it needs DSBA_ANTHROPIC_API_KEY, and without it
  every new picture would wait for a student rep. An admin switches it on in Manage, Access.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0062"
down_revision: str | None = "0061"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FEATURE = "forum.auto-check"
TARGETS = "'thread', 'reply', 'library_item', 'request', 'shared_note'"
REASONS = "'spam', 'harassment', 'inappropriate', 'copyright', 'other'"


def upgrade() -> None:
    op.create_table(
        "content_checks",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("target_type", sa.String(10), nullable=False),
        sa.Column("target_id", sa.UUID(), nullable=False),
        sa.Column("status", sa.String(10), nullable=False),
        sa.Column("verdict", sa.String(10)),
        sa.Column("category", sa.String(20)),
        sa.Column("reason", sa.String(300)),
        sa.Column("attempts", sa.Integer(), server_default="0", nullable=False),
        sa.Column("model", sa.String(40)),
        sa.Column("cost_microusd", sa.Integer(), server_default="0", nullable=False),
        sa.Column("queued_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True)),
        sa.Column("finished_at", sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_content_checks")),
        sa.CheckConstraint("target_type IN ('image', 'thread', 'reply')", name=op.f("ck_content_checks_target_type")),
        sa.CheckConstraint("status IN ('queued', 'working', 'done')", name=op.f("ck_content_checks_status")),
        sa.CheckConstraint("verdict IN ('clear', 'flagged', 'unchecked')", name=op.f("ck_content_checks_verdict")),
    )
    op.create_index("uq_content_checks_target", "content_checks", ["target_type", "target_id"], unique=True)
    op.create_index("ix_content_checks_status_queued", "content_checks", ["status", "queued_at"])
    op.create_index("ix_content_checks_finished", "content_checks", ["finished_at"])

    op.add_column("uploads", sa.Column("check_state", sa.String(10)))

    op.drop_constraint(op.f("ck_reports_target_type"), "reports", type_="check")
    op.create_check_constraint(op.f("ck_reports_target_type"), "reports", f"target_type IN ({TARGETS}, 'image')")
    op.drop_constraint(op.f("ck_reports_reason"), "reports", type_="check")
    op.create_check_constraint(
        op.f("ck_reports_reason"), "reports", f"reason IN ({REASONS}, 'hub_flagged', 'hub_unchecked')"
    )

    op.execute(
        sa.text(
            "INSERT INTO feature_switches (feature, mode, updated_by, updated_at) VALUES (:feature, 'off', NULL, now()) "
            "ON CONFLICT (feature) DO NOTHING"
        ).bindparams(feature=FEATURE)
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM feature_switch_roles WHERE feature = :feature").bindparams(feature=FEATURE))
    op.execute(sa.text("DELETE FROM feature_switches WHERE feature = :feature").bindparams(feature=FEATURE))
    op.execute("DELETE FROM reports WHERE target_type = 'image' OR reason IN ('hub_flagged', 'hub_unchecked')")
    op.drop_constraint(op.f("ck_reports_reason"), "reports", type_="check")
    op.create_check_constraint(op.f("ck_reports_reason"), "reports", f"reason IN ({REASONS})")
    op.drop_constraint(op.f("ck_reports_target_type"), "reports", type_="check")
    op.create_check_constraint(op.f("ck_reports_target_type"), "reports", f"target_type IN ({TARGETS})")
    op.drop_column("uploads", "check_state")
    op.drop_index("ix_content_checks_finished", table_name="content_checks")
    op.drop_index("ix_content_checks_status_queued", table_name="content_checks")
    op.drop_index("uq_content_checks_target", table_name="content_checks")
    op.drop_table("content_checks")
