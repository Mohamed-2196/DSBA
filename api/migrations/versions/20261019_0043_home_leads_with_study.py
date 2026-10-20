"""Home's default leads with studying: Carry on and the Daily question in, Today's Daily out

Revision ID: 0043
Revises: 0044
Create Date: 2026-10-19 21:30:00

Site settings saved before (content_docs 'site') keep their own Home default, so the seed's new one (app/seed/data/
site.json) wouldn't reach them: this applies the same change to a saved one. "carry_on" goes before "coming_up" (a
phone reaches it before Up next's countdown), "daily_question" before "forum" (or at the end), and "daily" leaves the
default; a student who wants it turns it on in Customise Home. Students' own layouts are theirs and stay as they are.
"""

from __future__ import annotations

import json
from collections.abc import Callable, Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0043"
down_revision: str | None = "0044"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _insert(blocks: list[str], block: str, *, after: str | None = None, before: str | None = None) -> None:
    if block in blocks:
        return
    if after in blocks:
        blocks.insert(blocks.index(after) + 1, block)
    elif before in blocks:
        blocks.insert(blocks.index(before), block)
    else:
        blocks.append(block)


def _change(change: Callable[[list[str]], None]) -> None:
    db = op.get_bind()
    row = db.execute(sa.text("SELECT data FROM content_docs WHERE key = 'site'")).first()
    if row is None or not isinstance(row[0], dict) or not isinstance(row[0].get("homeBlocks"), list):
        return
    data = dict(row[0])
    blocks = [str(b) for b in data["homeBlocks"]]
    change(blocks)
    data["homeBlocks"] = blocks
    db.execute(
        sa.text("UPDATE content_docs SET data = CAST(:data AS jsonb) WHERE key = 'site'"), {"data": json.dumps(data)}
    )


def _study_first(blocks: list[str]) -> None:
    _insert(blocks, "carry_on", before="coming_up")
    _insert(blocks, "daily_question", before="forum")
    if "daily" in blocks and len(blocks) > 1:
        blocks.remove("daily")


def _as_before(blocks: list[str]) -> None:
    for block in ("carry_on", "daily_question"):
        if block in blocks and len(blocks) > 1:
            blocks.remove(block)
    _insert(blocks, "daily", before="noora")


def upgrade() -> None:
    _change(_study_first)


def downgrade() -> None:
    _change(_as_before)
