"""you asked, we did: the requests.done switch (off)

Revision ID: 0018
Revises: 0015
Create Date: 2026-10-14 23:30:00

The requests done in the last 30 days, on the requests page and in the newsletter's live section of them, arrive
switched off.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0018"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.get_bind().execute(sa.text("INSERT INTO feature_switches (feature, mode) VALUES ('requests.done', 'off')"))


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM feature_switch_roles WHERE feature = 'requests.done'"))
    conn.execute(sa.text("DELETE FROM feature_switches WHERE feature = 'requests.done'"))
