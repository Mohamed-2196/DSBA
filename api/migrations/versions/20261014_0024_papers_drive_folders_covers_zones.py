"""papers: the Drive folders leave the library, covers, the same file once, zones checked

Revision ID: 0024
Revises: 0018
Create Date: 2026-10-14 19:29:48

- Students are never sent to Google Drive. The Drive folders the import copies from become rows of their own
  (`drive_folders`, which nothing shows), taken from the library's published links to Drive and Docs; those links
  leave the library. Each imported file points at its folder (`library_items.drive_folder_id`), found from the
  description the import gave it ("From the Drive folder <title> > ..."), which now reads "In <title> > ...". The
  modules' `resources` (the same links) go too.
- `library_texts.cover_key`: the first page of a PDF or Word file as a small picture, made by the text worker.
- `library_items.content_hash`: the SHA-256 of a file, so a second copy is shown once.
- `zone` on library items, users and requests may hold only the zones the API knows ('A', 'B', 'RTC').

Downgrading restores the schema; the links and resources it removed are not brought back (python -m app.cli seed
and the import rebuild what is needed).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0024"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

ZONES = "('A', 'B', 'RTC')"
GOOGLE = "(url LIKE 'https://drive.google.com/%' OR url LIKE 'https://docs.google.com/%')"
FROM_FOLDER = "From the Drive folder "


def upgrade() -> None:
    op.create_table(
        "drive_folders",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("module_id", sa.String(length=64), nullable=False),
        sa.Column("kind", sa.String(length=32), nullable=False),
        sa.Column("title", sa.String(length=200), nullable=False),
        sa.Column("url", sa.Text(), nullable=False),
        sa.Column("author_name", sa.String(length=120), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(
            "kind IN ('past-paper', 'examiners-report', 'exam-solutions', 'subject-guide', 'reading', 'study-guide', "
            "'exercises', 'notes', 'cheat-sheet', 'course-materials', 'vle-materials', 'other')",
            name=op.f("ck_drive_folders_kind"),
        ),
        sa.ForeignKeyConstraint(
            ["module_id"], ["modules.id"], name=op.f("fk_drive_folders_module_id_modules"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_drive_folders")),
    )
    op.create_index("ix_drive_folders_module_url", "drive_folders", ["module_id", "url"], unique=True)
    op.add_column("library_items", sa.Column("drive_folder_id", sa.UUID(), nullable=True))
    op.add_column("library_items", sa.Column("content_hash", sa.String(length=64), nullable=True))
    op.create_index("ix_library_items_content_hash", "library_items", ["content_hash"], unique=False)
    op.create_index("ix_library_items_drive_folder", "library_items", ["drive_folder_id"], unique=False)
    op.create_foreign_key(
        op.f("fk_library_items_drive_folder_id_drive_folders"),
        "library_items",
        "drive_folders",
        ["drive_folder_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.add_column("library_texts", sa.Column("cover_key", sa.Text(), nullable=True))

    conn = op.get_bind()
    # The folders: the published links to Drive and Docs that belong to a module, oldest first.
    conn.execute(
        sa.text(
            "INSERT INTO drive_folders (id, module_id, kind, title, url, author_name, created_at) "  # noqa: S608
            "SELECT gen_random_uuid(), module_id, kind, title, url, author_name, created_at FROM library_items "
            f"WHERE source = 'link' AND status = 'published' AND module_id IS NOT NULL AND {GOOGLE} "
            "ORDER BY created_at ON CONFLICT (module_id, url) DO NOTHING"
        )
    )
    # Each imported file's folder, by the description the import wrote: '<prefix><title>.' or '<prefix><title> > ...'.
    conn.execute(
        sa.text(
            "UPDATE library_items AS li SET drive_folder_id = df.id FROM drive_folders AS df "
            "WHERE li.import_key IS NOT NULL AND li.module_id = df.module_id "
            "AND (li.description = :prefix || df.title || '.' "
            "OR left(li.description, length(:prefix || df.title || :sep)) = :prefix || df.title || :sep)"
        ),
        {"prefix": FROM_FOLDER, "sep": " › "},  # noqa: RUF001
    )
    conn.execute(
        sa.text(
            "UPDATE library_items SET description = 'In ' || substr(description, length(:prefix) + 1) "
            "WHERE import_key IS NOT NULL AND left(description, length(:prefix)) = :prefix"
        ),
        {"prefix": FROM_FOLDER},
    )
    conn.execute(sa.text(f"DELETE FROM library_items WHERE source = 'link' AND {GOOGLE}"))  # noqa: S608
    op.drop_column("modules", "resources")

    for table in ("library_items", "users", "requests"):
        conn.execute(sa.text(f"UPDATE {table} SET zone = NULL WHERE zone NOT IN {ZONES}"))  # noqa: S608 - fixed names
        op.create_check_constraint(op.f(f"ck_{table}_zone"), table, f"zone IN {ZONES}")


def downgrade() -> None:
    for table in ("requests", "users", "library_items"):
        op.drop_constraint(op.f(f"ck_{table}_zone"), table, type_="check")
    op.add_column(
        "modules",
        sa.Column(
            "resources", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False
        ),
    )
    op.alter_column("modules", "resources", server_default=None)
    op.drop_column("library_texts", "cover_key")
    op.drop_constraint(op.f("fk_library_items_drive_folder_id_drive_folders"), "library_items", type_="foreignkey")
    op.drop_index("ix_library_items_drive_folder", table_name="library_items")
    op.drop_index("ix_library_items_content_hash", table_name="library_items")
    op.drop_column("library_items", "content_hash")
    op.drop_column("library_items", "drive_folder_id")
    op.drop_index("ix_drive_folders_module_url", table_name="drive_folders")
    op.drop_table("drive_folders")
