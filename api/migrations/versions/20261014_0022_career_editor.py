"""career editor: the document's version, and logos uploaded for Career Navigator

Revision ID: 0022
Revises: 0018
Create Date: 2026-10-14 23:50:00

`content_docs.version` goes up with every save of the Career Navigator, so an editor working from an older one gets a
conflict instead of overwriting someone's changes. Uploads gain the `career_logo` purpose: an employer's or a
certificate's logo, uploaded by an editor.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0022"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

PURPOSES = ("library", "forum_image")


def _purposes(purposes: Sequence[str]) -> None:
    op.drop_constraint(op.f("ck_uploads_uploadpurpose"), "uploads", type_="check")
    op.create_check_constraint(
        op.f("ck_uploads_uploadpurpose"), "uploads", f"purpose IN ({', '.join(repr(p) for p in purposes)})"
    )


def upgrade() -> None:
    op.add_column("content_docs", sa.Column("version", sa.Integer(), server_default="1", nullable=False))
    _purposes((*PURPOSES, "career_logo"))


def downgrade() -> None:
    op.execute("DELETE FROM uploads WHERE purpose = 'career_logo'")
    _purposes(PURPOSES)
    op.drop_column("content_docs", "version")
