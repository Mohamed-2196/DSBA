"""Notifications on phones and computers stored on for everyone

Revision ID: 0067
Revises: 0066
Create Date: 2026-11-10 09:00:00

The push switch is on for everyone on every install where no admin has set it yet, so "Notifications on your devices"
shows on Your account without a trip to Access. A switch an admin already set stays as it is. Each device still asks
first: nothing comes to a phone or computer until its browser allows the Hub's notifications.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0067"
down_revision: str | None = "0066"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FEATURE = "push"


def upgrade() -> None:
    op.execute(
        sa.text(
            "INSERT INTO feature_switches (feature, mode, updated_by, updated_at) "
            "VALUES (:feature, 'everyone', NULL, now()) ON CONFLICT (feature) DO NOTHING"
        ).bindparams(feature=FEATURE)
    )


def downgrade() -> None:
    op.execute(
        sa.text(
            "DELETE FROM feature_switches WHERE feature = :feature AND mode = 'everyone' AND updated_by IS NULL"
        ).bindparams(feature=FEATURE)
    )
