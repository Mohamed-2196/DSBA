"""search's spelling tolerance: the pg_trgm extension

Revision ID: 0044
Revises: 0041
Create Date: 2026-10-19 21:00:00

- `pg_trgm`: trigram similarity, which search uses to read "hypothisis" as "hypothesis" when a query finds nothing
  (app/services/search_spelling.py). It is a trusted extension: the database's owner may create it.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0044"
down_revision: str | None = "0041"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")


def downgrade() -> None:
    op.execute("DROP EXTENSION IF EXISTS pg_trgm")
