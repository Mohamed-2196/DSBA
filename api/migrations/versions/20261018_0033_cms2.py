"""forum categories and tags as tables

Revision ID: 0033
Revises: 0028
Create Date: 2026-10-18 09:00:00

The forum's categories and tags become tables that moderators edit in Manage → Forum, filled here with the ones the
forum has had so far. A thread's category is a foreign key to its category: a category that threads use can't be
deleted, only retired (it stops being offered and its threads keep it).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0033"
down_revision: str | None = "0028"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

CATEGORIES = (
    ("year-1", "Year 1", "Year 1", 1, "Maths, statistics, economics and business", None),
    ("year-2", "Year 2", "Year 2", 2, "Distribution theory, inference, programming and more", None),
    ("year-3", "Year 3", "Year 3", 3, "Machine learning, asset pricing and more", None),
    ("study-groups", "Study groups", "Study group", None, "Find people to revise with", "people"),
    ("general", "General", "General", None, "Exams, campus and everything else", "chat"),
)
TAGS = (
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


def upgrade() -> None:
    categories = op.create_table(
        "forum_categories",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("label", sa.String(length=40), nullable=False),
        sa.Column("short", sa.String(length=20), nullable=False),
        sa.Column("year", sa.SmallInteger(), nullable=True),
        sa.Column("blurb", sa.String(length=120), nullable=False),
        sa.Column("icon", sa.String(length=20), nullable=True),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.Column("retired", sa.Boolean(), server_default="false", nullable=False),
        sa.CheckConstraint("year IS NULL OR year BETWEEN 1 AND 3", name=op.f("ck_forum_categories_year_range")),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_forum_categories")),
    )
    tags = op.create_table(
        "forum_tags",
        sa.Column("id", sa.String(length=32), nullable=False),
        sa.Column("label", sa.String(length=40), nullable=False),
        sa.Column("position", sa.Integer(), server_default="0", nullable=False),
        sa.Column("retired", sa.Boolean(), server_default="false", nullable=False),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_forum_tags")),
    )
    op.bulk_insert(
        categories,
        [
            {"id": i, "label": label, "short": short, "year": year, "blurb": blurb, "icon": icon, "position": n}
            for n, (i, label, short, year, blurb, icon) in enumerate(CATEGORIES)
        ],
    )
    op.bulk_insert(tags, [{"id": i, "label": label, "position": n} for n, (i, label) in enumerate(TAGS)])
    op.create_foreign_key(
        op.f("fk_forum_threads_category_forum_categories"),
        "forum_threads",
        "forum_categories",
        ["category"],
        ["id"],
        ondelete="RESTRICT",
    )


def downgrade() -> None:
    op.drop_constraint(op.f("fk_forum_threads_category_forum_categories"), "forum_threads", type_="foreignkey")
    op.drop_table("forum_tags")
    op.drop_table("forum_categories")
