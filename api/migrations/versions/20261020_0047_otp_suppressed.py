"""sign-in codes over the sign-up budget are kept but not sent

Revision ID: 0047
Revises: 0046
Create Date: 2026-10-20 18:00:00

- `otp_challenges.suppressed`: the code for an address without an account was not sent because the sign-up email
  budget was spent. It never verifies and doesn't count against the email budgets, but the per-address limits count
  it like any other, so the answers never say whether an account exists.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0047"
down_revision: str | None = "0046"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column(
        "otp_challenges", sa.Column("suppressed", sa.Boolean(), server_default=sa.text("false"), nullable=False)
    )


def downgrade() -> None:
    op.drop_column("otp_challenges", "suppressed")
