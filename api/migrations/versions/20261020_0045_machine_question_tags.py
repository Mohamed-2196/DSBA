"""past questions tagged by Claude

Revision ID: 0045
Revises: 0042
Create Date: 2026-10-20 09:00:00

- `paper_questions.tagged_by_model`: the model that tagged a question (`python -m app.cli tag-questions`), None for
  a student's tag. A tag has one tagger: a student or a model, never both.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0045"
down_revision: str | None = "0042"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("paper_questions", sa.Column("tagged_by_model", sa.String(40), nullable=True))
    op.create_check_constraint(
        op.f("ck_paper_questions_one_tagger"), "paper_questions", "tagged_by IS NULL OR tagged_by_model IS NULL"
    )


def downgrade() -> None:
    op.drop_constraint(op.f("ck_paper_questions_one_tagger"), "paper_questions", type_="check")
    op.drop_column("paper_questions", "tagged_by_model")
