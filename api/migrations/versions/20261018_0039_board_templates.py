"""a board starts from one of the five templates students are offered

Revision ID: 0039
Revises: 0036
Create Date: 2026-10-18 16:00:00

Drops the "revision" template: three renamed Study columns, whose name promises the revision plan that "Plan my
revision" makes. Boards made from it keep their columns and are marked as made from Study.
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0039"
down_revision: str | None = "0036"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

TEMPLATES = ("study", "assignment", "weekly", "personal", "blank")
WITH_REVISION = ("study", "revision", "assignment", "weekly", "personal", "blank")


def _templates(values: Sequence[str]) -> None:
    op.drop_constraint(op.f("ck_boards_template"), "boards", type_="check")
    op.create_check_constraint(
        op.f("ck_boards_template"), "boards", f"template IN ({', '.join(repr(v) for v in values)})"
    )


def upgrade() -> None:
    op.execute("UPDATE boards SET template = 'study' WHERE template = 'revision'")
    _templates(TEMPLATES)


def downgrade() -> None:
    _templates(WITH_REVISION)
