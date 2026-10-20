"""worked answers in examiners' reports, and students' marks on past questions

Revision ID: 0048
Revises: 0050
Create Date: 2026-10-20 15:00:00

- `library_texts.worked_answers`: the report works through its questions ("Approaching the question"), so the
  sittings table says "Worked answers in the report" where a sitting has no solutions.
- `library_texts.question_pages`: where each question's commentary starts in a report (its zone, section, number and
  page), so a tagged question opens the report there. Both are filled from the stored text by the text worker, and
  for reports already read by `python -m app.cli report-answers`.
- `question_marks`: a student's done, stuck or skipped on a past question while practising a chapter. Private, by
  the question (paper, section, number) rather than its tag; it goes with the account or the paper.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0048"
down_revision: str | None = "0050"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "library_texts", sa.Column("worked_answers", sa.Boolean(), server_default=sa.text("false"), nullable=False)
    )
    op.add_column("library_texts", sa.Column("question_pages", postgresql.JSONB(), nullable=True))
    op.create_table(
        "question_marks",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("item_id", sa.UUID(), nullable=False),
        sa.Column("section", sa.String(length=1), nullable=True),
        sa.Column("question", sa.SmallInteger(), nullable=False),
        sa.Column("mark", sa.String(length=8), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("mark IN ('done', 'stuck', 'skipped')", name=op.f("ck_question_marks_mark")),
        sa.CheckConstraint("section IS NULL OR section ~ '^[A-Z]$'", name=op.f("ck_question_marks_section_letter")),
        sa.CheckConstraint("question BETWEEN 1 AND 40", name=op.f("ck_question_marks_question_range")),
        sa.ForeignKeyConstraint(
            ["item_id"],
            ["library_items.id"],
            name=op.f("fk_question_marks_item_id_library_items"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_question_marks_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_question_marks")),
    )
    op.create_index("ix_question_marks_item", "question_marks", ["item_id"])
    op.create_index(
        "ix_question_marks_user_item_section_question",
        "question_marks",
        ["user_id", "item_id", "section", "question"],
        unique=True,
        postgresql_nulls_not_distinct=True,
    )
    op.create_index("ix_question_marks_user_updated", "question_marks", ["user_id", "updated_at"])


def downgrade() -> None:
    op.drop_index("ix_question_marks_user_updated", table_name="question_marks")
    op.drop_index("ix_question_marks_user_item_section_question", table_name="question_marks")
    op.drop_index("ix_question_marks_item", table_name="question_marks")
    op.drop_table("question_marks")
    op.drop_column("library_texts", "question_pages")
    op.drop_column("library_texts", "worked_answers")
