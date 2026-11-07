"""Time stamps in lessons' recordings switched off

Revision ID: 0059
Revises: 0058
Create Date: 2026-11-08 12:00:00

A simpler module page: the switch is off, on every install, until an admin switches it on in Manage, Access. The code
and the data stay as they are. Going back leaves it off, its first setting.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0059"
down_revision: str | None = "0058"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FEATURE = "modules.time-stamps"


def upgrade() -> None:
    """Sets the switch off, with no setter and no roles, as a change from the command line does."""
    op.execute(
        sa.text(
            "UPDATE feature_switches SET mode = 'off', updated_by = NULL, updated_at = now() WHERE feature = :feature"
        ).bindparams(feature=FEATURE)
    )
    op.execute(sa.text("DELETE FROM feature_switch_roles WHERE feature = :feature").bindparams(feature=FEATURE))


def downgrade() -> None:
    pass
