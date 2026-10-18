"""forum categories and tags as tables; new parts of the site settings

Revision ID: 0033
Revises: 0030
Create Date: 2026-10-18 09:00:00

The forum's categories and tags become tables that moderators edit in Manage → Forum, filled here with the ones the
forum has had so far. A thread's category is a foreign key to its category: a category that threads use can't be
deleted, only retired (it stops being offered and its threads keep it).

Site settings gain Home's blocks for a new student, the tour's steps, and search's nicknames and suggestions; the
Career Navigator's document gains the page's intro and the note under the employers. Documents saved before this get
them as they start (app/seed/data/site.json and career.json); unsaved site settings read the seed anyway.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op

revision: str = "0033"
down_revision: str | None = "0030"
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

SITE_ADDITIONS: dict[str, Any] = {
    "homeBlocks": [
        "start_here",
        "results_day",
        "coming_up",
        "todo",
        "continue",
        "modules",
        "files",
        "forum",
        "daily",
        "noora",
    ],
    "tour": [
        {
            "id": "search",
            "art": "search",
            "title": "Search everything",
            "body": "Press `{mod}``K` or `/` from any page to find a module, a past paper, a thread or an exam date.",
        },
        {
            "id": "library",
            "art": "library",
            "title": "Files open right here",
            "body": "Notes, past papers and study guides open in the library\u2019s reader, and download in one click. Share yours, too: a student rep checks each one first.",
        },
        {
            "id": "forum",
            "art": "forum",
            "title": "Ask your cohort",
            "body": "The forum is for questions, answers and study groups. When there is news from the programme, you will find it in The DSBA Newsletter.",
        },
    ],
    "searchNicknames": [
        {"id": "stats", "word": "stats", "finds": "statistic"},
        {"id": "stat", "word": "stat", "finds": "statistic"},
        {"id": "maths", "word": "maths", "finds": "mathemat"},
        {"id": "math", "word": "math", "finds": "mathemat"},
        {"id": "metrics", "word": "metrics", "finds": "econometric"},
        {"id": "ml", "word": "ml", "finds": "machine learning"},
        {"id": "ai", "word": "ai", "finds": "machine learning"},
        {"id": "coding", "word": "coding", "finds": "programming"},
        {"id": "python", "word": "python", "finds": "programming"},
        {"id": "sql", "word": "sql", "finds": "programming"},
        {"id": "ba", "word": "ba", "finds": "business analytics"},
    ],
    "searchSuggestions": ["Econometrics", "Past papers", "Regression", "ST2133"],
}

CAREER_ADDITIONS = {
    "intro": "Graduate programmes, internships and careers pages at employers in Bahrain.",
    "employersNote": (
        "Every button opens the employer\u2019s own careers or programme page in a new tab. Programmes open and close "
        "during the year and each sets its own entry rules, so check the page for current dates. The track tags are "
        "our guide to the kind of work, not a list of vacancies. Logos belong to their owners and are shown only to "
        "identify each organisation; DSBA Hub is not affiliated with or endorsed by any of them."
    ),
}


def _add(key: str, marker: str, additions: dict[str, Any]) -> None:
    """Gives a saved document the parts it lacks, as they start."""
    op.execute(
        sa.text(
            "UPDATE content_docs SET data = CAST(:extra AS jsonb) || data WHERE key = :key AND data->:marker IS NULL"
        ).bindparams(extra=json.dumps(additions, ensure_ascii=False), key=key, marker=marker)
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
    _add("site", "homeBlocks", SITE_ADDITIONS)
    _add("career", "intro", CAREER_ADDITIONS)


def downgrade() -> None:
    op.execute("UPDATE content_docs SET data = data - 'intro' - 'employersNote' WHERE key = 'career'")
    op.execute(
        "UPDATE content_docs SET data = data - 'homeBlocks' - 'tour' - 'searchNicknames' - 'searchSuggestions' "
        "WHERE key = 'site'"
    )
    op.drop_constraint(op.f("fk_forum_threads_category_forum_categories"), "forum_threads", type_="foreignkey")
    op.drop_table("forum_tags")
    op.drop_table("forum_categories")
