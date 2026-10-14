"""Past papers by sitting and past questions by chapter: an item's exam session, the worked-solutions kind, the
questions students tag with a chapter and the flags on wrong tags, and the switch for tagging

Revision ID: 0007
Revises: 0010
Create Date: 2026-10-14 18:00:00

Tagging arrives switched off: an admin switches it on from the Access screen. Files already in the library get their
session from their names with `python -m app.cli exam-meta`.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0007"
down_revision: str | None = "0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

OLD_KINDS = (
    "'past-paper', 'examiners-report', 'subject-guide', 'reading', 'study-guide', 'exercises', 'notes', "
    "'cheat-sheet', 'course-materials', 'vle-materials', 'other'"
)
KINDS = OLD_KINDS.replace("'examiners-report', ", "'examiners-report', 'exam-solutions', ")


def upgrade() -> None:
    op.add_column("library_items", sa.Column("exam_session", sa.String(length=8), nullable=True))
    op.create_check_constraint(
        op.f("ck_library_items_exam_session"), "library_items", "exam_session IN ('may', 'october')"
    )
    op.drop_constraint(op.f("ck_library_items_kind"), "library_items", type_="check")
    op.create_check_constraint(op.f("ck_library_items_kind"), "library_items", f"kind IN ({KINDS})")
    op.create_table(
        "paper_questions",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("item_id", sa.UUID(), nullable=False),
        sa.Column("chapter_id", sa.String(length=16), nullable=False),
        sa.Column("question", sa.SmallInteger(), nullable=False),
        sa.Column("page", sa.SmallInteger(), nullable=True),
        sa.Column("tagged_by", sa.UUID(), nullable=True),
        sa.Column("flag_count", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("question BETWEEN 1 AND 40", name=op.f("ck_paper_questions_question_range")),
        sa.CheckConstraint("page IS NULL OR page BETWEEN 1 AND 999", name=op.f("ck_paper_questions_page_range")),
        sa.ForeignKeyConstraint(
            ["chapter_id"], ["chapters.id"], name=op.f("fk_paper_questions_chapter_id_chapters"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["item_id"],
            ["library_items.id"],
            name=op.f("fk_paper_questions_item_id_library_items"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["tagged_by"], ["users.id"], name=op.f("fk_paper_questions_tagged_by_users"), ondelete="SET NULL"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_paper_questions")),
    )
    op.create_index("ix_paper_questions_chapter", "paper_questions", ["chapter_id"], unique=False)
    op.create_index(
        "ix_paper_questions_item_question_chapter",
        "paper_questions",
        ["item_id", "question", "chapter_id"],
        unique=True,
    )
    op.create_index("ix_paper_questions_tagged_by", "paper_questions", ["tagged_by"], unique=False)
    op.create_table(
        "paper_question_flags",
        sa.Column("question_id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["question_id"],
            ["paper_questions.id"],
            name=op.f("fk_paper_question_flags_question_id_paper_questions"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_paper_question_flags_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("question_id", "user_id", name=op.f("pk_paper_question_flags")),
    )
    op.create_index("ix_paper_question_flags_user", "paper_question_flags", ["user_id"], unique=False)
    op.execute("INSERT INTO feature_switches (feature, mode) VALUES ('library.questions', 'off')")


def downgrade() -> None:
    op.execute("DELETE FROM feature_switch_roles WHERE feature = 'library.questions'")
    op.execute("DELETE FROM feature_switches WHERE feature = 'library.questions'")
    op.drop_index("ix_paper_question_flags_user", table_name="paper_question_flags")
    op.drop_table("paper_question_flags")
    op.drop_index("ix_paper_questions_tagged_by", table_name="paper_questions")
    op.drop_index("ix_paper_questions_item_question_chapter", table_name="paper_questions")
    op.drop_index("ix_paper_questions_chapter", table_name="paper_questions")
    op.drop_table("paper_questions")
    op.execute("UPDATE library_items SET kind = 'past-paper' WHERE kind = 'exam-solutions'")
    op.drop_constraint(op.f("ck_library_items_kind"), "library_items", type_="check")
    op.create_check_constraint(op.f("ck_library_items_kind"), "library_items", f"kind IN ({OLD_KINDS})")
    op.drop_constraint(op.f("ck_library_items_exam_session"), "library_items", type_="check")
    op.drop_column("library_items", "exam_session")
