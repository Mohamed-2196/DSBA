"""a past question a day: its switch (off)

Revision ID: 0016
Revises: 0015
Create Date: 2026-10-14 23:00:00

Home shows one tagged past question a day from the module of your next exam (IDEA-27). The card lives in the web
app and reads the past questions the API already serves. It arrives switched off: an admin switches it on from the
Access screen.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0016"
down_revision: str | None = "0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FEATURE = "library.daily-question"


def upgrade() -> None:
    op.get_bind().execute(sa.text("INSERT INTO feature_switches (feature, mode) VALUES (:f, 'off')"), {"f": FEATURE})


def downgrade() -> None:
    conn = op.get_bind()
    conn.execute(sa.text("DELETE FROM feature_switch_roles WHERE feature = :f"), {"f": FEATURE})
    conn.execute(sa.text("DELETE FROM feature_switches WHERE feature = :f"), {"f": FEATURE})
