"""notes know their module

Revision ID: 0042
Revises: 0041
Create Date: 2026-10-19 21:00:00

- `notes.module_id`: the module a note is about, set from where it was started and changeable (IDEA-41). A note in a
  module's notebook is about that module, so existing notes take their notebook's module.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0042"
down_revision: str | None = "0041"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("notes", sa.Column("module_id", sa.String(64), nullable=True))
    op.create_foreign_key("fk_notes_module_id_modules", "notes", "modules", ["module_id"], ["id"], ondelete="SET NULL")
    op.execute(
        "UPDATE notes SET module_id = notebooks.module_id FROM notebooks "
        "WHERE notebooks.id = notes.notebook_id AND notebooks.module_id IS NOT NULL"
    )
    op.create_index("ix_notes_user_module", "notes", ["user_id", "module_id"])
    op.create_index("ix_notes_module", "notes", ["module_id"])


def downgrade() -> None:
    op.drop_index("ix_notes_module", table_name="notes")
    op.drop_index("ix_notes_user_module", table_name="notes")
    op.drop_constraint("fk_notes_module_id_modules", "notes", type_="foreignkey")
    op.drop_column("notes", "module_id")
