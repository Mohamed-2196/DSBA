"""one published newsletter issue per number

Revision ID: 0052
Revises: 0046
Create Date: 2026-10-20 15:30:00

- `newsletter_issues.number` is unique among published issues (a partial unique index); drafts may share a number
  until they are published (ST-68).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0052"
down_revision: str | None = "0046"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_index(
        "ix_newsletter_issues_published_number",
        "newsletter_issues",
        ["number"],
        unique=True,
        postgresql_where=sa.text("status = 'published'"),
    )


def downgrade() -> None:
    op.drop_index("ix_newsletter_issues_published_number", table_name="newsletter_issues")
