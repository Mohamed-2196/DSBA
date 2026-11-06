"""Mini Noora, her AI answers and the Daily puzzles switched off

Revision ID: 0058
Revises: 0056
Create Date: 2026-11-06 12:00:00

A simpler hub: these features' switches are off, on every install, until an admin switches them on in Manage, Access.
The code and the data stay as they are. Going back restores Mini Noora's first setting, on for everyone; the other two
start off, so they stay off.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0058"
down_revision: str | None = "0056"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

SWITCHED_OFF = ("noora", "noora.ai", "daily")


def _set(features: tuple[str, ...], mode: str) -> None:
    """Sets the switches, with no setter and no roles, as a change from the command line does."""
    chosen = sa.bindparam("features", features, expanding=True)
    op.execute(
        sa.text(
            "UPDATE feature_switches SET mode = :mode, updated_by = NULL, updated_at = now() WHERE feature IN :features"
        ).bindparams(chosen, mode=mode)
    )
    op.execute(sa.text("DELETE FROM feature_switch_roles WHERE feature IN :features").bindparams(chosen))


def upgrade() -> None:
    _set(SWITCHED_OFF, "off")


def downgrade() -> None:
    _set(("noora",), "everyone")
