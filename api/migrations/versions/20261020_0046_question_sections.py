"""past questions know their section

Revision ID: 0046
Revises: 0045
Create Date: 2026-10-20 12:00:00

Some papers number Section A and Section B from 1 each (ST2195, two EC1002 papers of 2023), so their B1 clashed
with A1.

- `paper_questions.section`: the section's capital letter ('B' of "B1"), None on a paper numbered right through.
- A question is its paper, section, number and chapter: the unique index takes the section, NULLS NOT DISTINCT so
  Q3 without a section is still tagged once a chapter (Postgres 15 or newer).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0046"
down_revision: str | None = "0045"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("paper_questions", sa.Column("section", sa.String(1), nullable=True))
    op.create_check_constraint(
        op.f("ck_paper_questions_section_letter"), "paper_questions", "section IS NULL OR section ~ '^[A-Z]$'"
    )
    op.drop_index("ix_paper_questions_item_question_chapter", table_name="paper_questions")
    op.create_index(
        "ix_paper_questions_item_section_question_chapter",
        "paper_questions",
        ["item_id", "section", "question", "chapter_id"],
        unique=True,
        postgresql_nulls_not_distinct=True,
    )


def downgrade() -> None:
    # B1 and A1 of one paper can't both stay once the section goes: the sectioned copies go with it.
    op.execute(
        "DELETE FROM paper_questions p USING paper_questions q "
        "WHERE p.section IS NOT NULL AND p.item_id = q.item_id AND p.question = q.question "
        "AND p.chapter_id = q.chapter_id AND p.id <> q.id "
        "AND (q.section IS NULL OR q.section < p.section)"
    )
    op.drop_index("ix_paper_questions_item_section_question_chapter", table_name="paper_questions")
    op.create_index(
        "ix_paper_questions_item_question_chapter",
        "paper_questions",
        ["item_id", "question", "chapter_id"],
        unique=True,
    )
    op.drop_constraint(op.f("ck_paper_questions_section_letter"), "paper_questions", type_="check")
    op.drop_column("paper_questions", "section")
