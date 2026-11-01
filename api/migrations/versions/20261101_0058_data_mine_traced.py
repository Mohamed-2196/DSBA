"""Data Mine becomes DSBA Daily's game: words traced through a grid they fill exactly, instead of a word search

Revision ID: 0058
Revises: 0056
Create Date: 2026-11-01 12:00:00

- An item of the game `search` is now a whole puzzle (a clue, the theme's name, the spangram, the other words and their
  grid), where it was one word to hide. The word-search items can't make the new puzzles, so they go, with the days
  made from them (`daily_sets`, whose revisions and item links follow by cascade) and the plays of those days: their
  moves were lines on a word search. New puzzles come from Manage → Daily puzzles or a content file.
- Nothing changes in the tables themselves. The downgrade can't bring the removed rows back, and leaves them gone.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0058"
down_revision: str | None = "0056"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    for table in ("daily_plays", "daily_sets", "daily_items"):
        op.execute(sa.text(f"DELETE FROM {table} WHERE game = 'search'"))  # noqa: S608 - fixed table names


def downgrade() -> None:
    pass
