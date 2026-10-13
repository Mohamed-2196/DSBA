"""library_items.import_key: where a file the Drive import brought in came from

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-13 09:35:00

`python -m app.cli import-drive` copies the files of the library's Google Drive folders into the bucket as library
files. Each one records 'drive/<module>/<Drive file id>', so a rerun skips it whatever became of the item since: a rep
may have edited, moved or removed it, and the daily sweep clears a removed file's storage key a week later. Unique:
one item per Drive file and module. Uploads and links have none.
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
    op.add_column("library_items", sa.Column("import_key", sa.String(length=200), nullable=True))
    op.create_unique_constraint(op.f("uq_library_items_import_key"), "library_items", ["import_key"])


def downgrade() -> None:
    op.drop_constraint(op.f("uq_library_items_import_key"), "library_items", type_="unique")
    op.drop_column("library_items", "import_key")
