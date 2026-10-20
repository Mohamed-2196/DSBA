"""shared notes and lesson topics

Revision ID: 0051
Revises: 0046
Create Date: 2026-10-20 15:07:37

- `shared_notes` (IDEA-29): a copy of a student's note shared with its module's students: the note's title, typed
  text, paper, pages, ink and the files it shows, as they were when it was shared. One per note, deleted with it.
  A moderator may hide it.
- `lesson_topics` (IDEA-52): a time in a lesson's video and what it covers, suggested by a student and accepted or
  declined by a content manager, as suggested videos are.
- Reports may name a shared note (`reports.target_type` 'shared_note').
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0051"
down_revision: str | None = "0046"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TARGETS = ("thread", "reply", "library_item", "request")


def _in(column: str, values: Sequence[str]) -> str:
    """A CHECK's condition: the column holds one of the values."""
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


def upgrade() -> None:
    op.create_table(
        "lesson_topics",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("lesson_id", sa.String(length=16), nullable=False),
        sa.Column("author_id", sa.UUID(), nullable=True),
        sa.Column("seconds", sa.Integer(), nullable=False),
        sa.Column("label", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=10), server_default="pending", nullable=False),
        sa.Column("reply", sa.Text(), nullable=True),
        sa.Column("decided_by", sa.UUID(), nullable=True),
        sa.Column("decided_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("seconds BETWEEN 0 AND 86399", name=op.f("ck_lesson_topics_seconds_range")),
        sa.CheckConstraint(
            _in("status", ("pending", "accepted", "declined")), name=op.f("ck_lesson_topics_suggestionstatus")
        ),
        sa.ForeignKeyConstraint(
            ["author_id"], ["users.id"], name=op.f("fk_lesson_topics_author_id_users"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["decided_by"], ["users.id"], name=op.f("fk_lesson_topics_decided_by_users"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["lesson_id"], ["lessons.id"], name=op.f("fk_lesson_topics_lesson_id_lessons"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_lesson_topics")),
    )
    op.create_index("ix_lesson_topics_author_created", "lesson_topics", ["author_id", "created_at"])
    op.create_index("ix_lesson_topics_decided_by", "lesson_topics", ["decided_by"])
    op.create_index("ix_lesson_topics_lesson_seconds", "lesson_topics", ["lesson_id", "seconds"])
    op.create_index(
        "ix_lesson_topics_queue", "lesson_topics", ["created_at"], postgresql_where=sa.text("status = 'pending'")
    )

    op.create_table(
        "shared_notes",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("note_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("module_id", sa.String(length=64), nullable=False),
        sa.Column("credited", sa.Boolean(), server_default="true", nullable=False),
        sa.Column("title", sa.String(length=200), server_default="", nullable=False),
        sa.Column(
            "doc", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False
        ),
        sa.Column("text", sa.Text(), server_default="", nullable=False),
        sa.Column("paper", sa.String(length=8), server_default="lined", nullable=False),
        sa.Column("sheets", sa.Integer(), server_default="1", nullable=False),
        sa.Column(
            "ink", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False
        ),
        sa.Column("uploads", postgresql.ARRAY(sa.Uuid()), server_default=sa.text("'{}'"), nullable=False),
        sa.Column("note_version", sa.Integer(), nullable=False),
        sa.Column("hidden", sa.Boolean(), server_default="false", nullable=False),
        sa.Column("hidden_by", sa.UUID(), nullable=True),
        sa.Column("hidden_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("shared_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(_in("paper", ("blank", "lined", "grid", "dotted")), name=op.f("ck_shared_notes_paper")),
        sa.ForeignKeyConstraint(
            ["hidden_by"], ["users.id"], name=op.f("fk_shared_notes_hidden_by_users"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(
            ["module_id"], ["modules.id"], name=op.f("fk_shared_notes_module_id_modules"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["note_id"], ["notes.id"], name=op.f("fk_shared_notes_note_id_notes"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_shared_notes_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_shared_notes")),
    )
    op.create_index("ix_shared_notes_hidden_by", "shared_notes", ["hidden_by"])
    op.create_index("ix_shared_notes_module_shared", "shared_notes", ["module_id", "shared_at"])
    op.create_index("ix_shared_notes_note", "shared_notes", ["note_id"], unique=True)
    op.create_index("ix_shared_notes_uploads", "shared_notes", ["uploads"], postgresql_using="gin")
    op.create_index("ix_shared_notes_user", "shared_notes", ["user_id"])

    op.drop_constraint(op.f("ck_reports_target_type"), "reports", type_="check")
    op.create_check_constraint(op.f("ck_reports_target_type"), "reports", _in("target_type", (*TARGETS, "shared_note")))


def downgrade() -> None:
    op.execute("DELETE FROM reports WHERE target_type = 'shared_note'")
    op.drop_constraint(op.f("ck_reports_target_type"), "reports", type_="check")
    op.create_check_constraint(op.f("ck_reports_target_type"), "reports", _in("target_type", TARGETS))
    op.drop_table("shared_notes")
    op.drop_table("lesson_topics")
