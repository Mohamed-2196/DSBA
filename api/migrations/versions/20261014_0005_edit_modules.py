"""edit modules in the app: hidden flags for modules, chapters and lessons, and a module's version

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-14 09:00:00

Content managers now edit modules, chapters and lessons (R-9). `hidden` leaves a module, a chapter or a lesson out
of students' views; `version` lets two editors' saves not overwrite each other (409 module_changed).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0005"
down_revision: str | None = "0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("modules", sa.Column("hidden", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("modules", sa.Column("version", sa.Integer(), server_default="1", nullable=False))
    op.add_column("chapters", sa.Column("hidden", sa.Boolean(), server_default="false", nullable=False))
    op.add_column("lessons", sa.Column("hidden", sa.Boolean(), server_default="false", nullable=False))


def downgrade() -> None:
    op.drop_column("lessons", "hidden")
    op.drop_column("chapters", "hidden")
    op.drop_column("modules", "version")
    op.drop_column("modules", "hidden")
