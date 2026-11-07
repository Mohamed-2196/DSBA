"""Plan my revision switched off

Revision ID: 0060
Revises: 0059
Create Date: 2026-11-08 18:00:00

Students plan their own revision: the switch is stored off, on every install, until an admin switches it on in Manage,
Access. The plans made so far go, with their cards not done yet; cards done stay on their boards. Going back removes
the switch, which that code doesn't know, and doesn't bring the plans back.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0060"
down_revision: str | None = "0059"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FEATURE = "board.plan"


def upgrade() -> None:
    """Stores the switch off, with no setter and no roles, as a change from the command line does."""
    op.execute(
        sa.text(
            "INSERT INTO feature_switches (feature, mode, updated_by, updated_at) VALUES (:feature, 'off', NULL, now()) "
            "ON CONFLICT (feature) DO UPDATE SET mode = 'off', updated_by = NULL, updated_at = now()"
        ).bindparams(feature=FEATURE)
    )
    op.execute(sa.text("DELETE FROM feature_switch_roles WHERE feature = :feature").bindparams(feature=FEATURE))
    # As removing a plan does (services/board/plans.py delete_plan); the cards done keep, plan_id SET NULL.
    op.execute(sa.text("DELETE FROM board_cards WHERE plan_id IS NOT NULL AND done_at IS NULL"))
    op.execute(sa.text("DELETE FROM board_plans"))


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM feature_switch_roles WHERE feature = :feature").bindparams(feature=FEATURE))
    op.execute(sa.text("DELETE FROM feature_switches WHERE feature = :feature").bindparams(feature=FEATURE))
