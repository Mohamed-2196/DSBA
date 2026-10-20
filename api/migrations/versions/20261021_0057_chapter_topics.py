"""chapters' study-guide topics, and the topics each tagged past question tests

Revision ID: 0057
Revises: 0054
Create Date: 2026-10-21 10:00:00

- `chapter_topics`: a chapter's topics as its module's study guide lists them, from the seed
  (app/seed/data/chapter_outlines.json); each id is unique within its chapter.
- `paper_question_topics`: one to three of its chapter's topics on a tag of a past paper's question. Both foreign keys
  carry the tag's chapter, so a tag only takes topics of its own chapter (`uq_paper_questions_id_chapter_id`).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0057"
down_revision: str | None = "0054"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "chapter_topics",
        sa.Column("chapter_id", sa.String(length=16), nullable=False),
        sa.Column("id", sa.String(length=52), nullable=False),
        sa.Column("position", sa.SmallInteger(), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.ForeignKeyConstraint(
            ["chapter_id"], ["chapters.id"], name=op.f("fk_chapter_topics_chapter_id_chapters"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("chapter_id", "id", name=op.f("pk_chapter_topics")),
    )
    op.create_unique_constraint(op.f("uq_paper_questions_id_chapter_id"), "paper_questions", ["id", "chapter_id"])
    op.create_table(
        "paper_question_topics",
        sa.Column("question_id", sa.UUID(), nullable=False),
        sa.Column("topic_id", sa.String(length=52), nullable=False),
        sa.Column("chapter_id", sa.String(length=16), nullable=False),
        sa.ForeignKeyConstraint(
            ["question_id", "chapter_id"],
            ["paper_questions.id", "paper_questions.chapter_id"],
            name="fk_paper_question_topics_question",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["chapter_id", "topic_id"],
            ["chapter_topics.chapter_id", "chapter_topics.id"],
            name="fk_paper_question_topics_topic",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("question_id", "topic_id", name=op.f("pk_paper_question_topics")),
    )
    op.create_index(
        "ix_paper_question_topics_chapter_topic", "paper_question_topics", ["chapter_id", "topic_id"], unique=False
    )


def downgrade() -> None:
    op.drop_index("ix_paper_question_topics_chapter_topic", table_name="paper_question_topics")
    op.drop_table("paper_question_topics")
    op.drop_constraint(op.f("uq_paper_questions_id_chapter_id"), "paper_questions", type_="unique")
    op.drop_table("chapter_topics")
