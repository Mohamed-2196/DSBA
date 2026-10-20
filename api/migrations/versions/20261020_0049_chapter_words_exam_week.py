"""chapters have words for search; site settings choose what leads Home in exam week

Revision ID: 0049
Revises: 0046
Create Date: 2026-10-20 18:00:00

- `chapters.keywords`: other words search finds a chapter by ('mle', 'cramer rao'), lower case. The seed's words
  reach a catalogue loaded before them with `python -m app.cli seed --only chapter-words`.
- Site settings saved before (content_docs 'site') get the seed's `examWeek` (app/seed/data/site.json): on, from
  seven days before, the countdown, practice, papers and dates.
"""

from __future__ import annotations

import json
from collections.abc import Sequence
from typing import Any

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0049"
down_revision: str | None = "0046"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

EXAM_WEEK = {"on": True, "daysBefore": 7, "lead": ["countdown", "practice", "papers", "dates"]}


def _site(change: Any) -> None:
    db = op.get_bind()
    row = db.execute(sa.text("SELECT data FROM content_docs WHERE key = 'site'")).first()
    if row is None or not isinstance(row[0], dict):
        return
    data = dict(row[0])
    change(data)
    db.execute(
        sa.text("UPDATE content_docs SET data = CAST(:data AS jsonb) WHERE key = 'site'"), {"data": json.dumps(data)}
    )


def upgrade() -> None:
    op.add_column(
        "chapters",
        sa.Column("keywords", postgresql.ARRAY(sa.String(40)), server_default="{}", nullable=False),
    )
    _site(lambda data: data.setdefault("examWeek", EXAM_WEEK))


def downgrade() -> None:
    _site(lambda data: data.pop("examWeek", None))
    op.drop_column("chapters", "keywords")
