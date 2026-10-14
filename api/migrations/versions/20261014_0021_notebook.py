"""notebook: notebooks, notes with typed text, ink, files and PDFs to write over

Revision ID: 0021
Revises: 0018
Create Date: 2026-10-14 23:50:00

Notes move into notebooks (one per module by default). A note's Markdown body becomes a ProseMirror document
(`doc`) with its plain text (`text`); its module becomes its notebook's. Each sheet's handwriting is a row of
`note_ink`; a note's pictures and files are uploads with purpose note_file and `note_id`. The notes already
written move into a notebook per module (or "My notebook"), each line of their text a paragraph.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0021"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "notebooks",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("title", sa.String(length=120), nullable=False),
        sa.Column("module_id", sa.String(length=64), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["module_id"], ["modules.id"], name=op.f("fk_notebooks_module_id_modules"), ondelete="SET NULL"
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_notebooks_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_notebooks")),
    )
    op.create_index("ix_notebooks_module", "notebooks", ["module_id"], unique=False)
    op.create_index("ix_notebooks_user_created", "notebooks", ["user_id", "created_at"], unique=False)
    op.create_index(
        "ix_notebooks_user_module",
        "notebooks",
        ["user_id", "module_id"],
        unique=True,
        postgresql_where=sa.text("module_id IS NOT NULL"),
    )

    op.add_column("notes", sa.Column("notebook_id", sa.UUID(), nullable=True))
    op.add_column(
        "notes",
        sa.Column(
            "doc", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False
        ),
    )
    op.add_column("notes", sa.Column("text", sa.Text(), server_default="", nullable=False))
    op.add_column("notes", sa.Column("paper", sa.String(length=8), server_default="lined", nullable=False))
    op.add_column("notes", sa.Column("sheets", sa.Integer(), server_default="1", nullable=False))
    op.add_column("notes", sa.Column("library_item_id", sa.UUID(), nullable=True))
    op.add_column("notes", sa.Column("pdf_upload_id", sa.UUID(), nullable=True))

    # The notes already written: a notebook per module (or one of the student's own), and their text as paragraphs.
    op.execute(
        """
        INSERT INTO notebooks (id, user_id, title, module_id)
        SELECT gen_random_uuid(), n.user_id,
               COALESCE(NULLIF(TRIM(COALESCE(m.unit_code, '') || ' ' || m.name), ''), 'My notebook'), n.module_id
        FROM (SELECT DISTINCT user_id, module_id FROM notes) n
        LEFT JOIN modules m ON m.id = n.module_id
        """
    )
    op.execute(
        """
        UPDATE notes SET
          notebook_id = (
            SELECT b.id FROM notebooks b
            WHERE b.user_id = notes.user_id AND b.module_id IS NOT DISTINCT FROM notes.module_id
          ),
          text = body,
          doc = jsonb_build_object('type', 'doc', 'content', (
            SELECT COALESCE(jsonb_agg(
              CASE WHEN line = '' THEN '{"type": "paragraph"}'::jsonb
              ELSE jsonb_build_object('type', 'paragraph', 'content',
                     jsonb_build_array(jsonb_build_object('type', 'text', 'text', line))) END
              ORDER BY ord), '[]'::jsonb)
            FROM unnest(string_to_array(body, E'\\n')) WITH ORDINALITY AS t(line, ord)
          ))
        """
    )
    op.alter_column("notes", "notebook_id", nullable=False)

    op.drop_constraint(op.f("ck_notes_lesson_module"), "notes", type_="check")
    op.drop_index("ix_notes_user_module", table_name="notes")
    op.drop_index("ix_notes_module", table_name="notes")
    op.drop_constraint(op.f("fk_notes_module_id_modules"), "notes", type_="foreignkey")
    op.drop_column("notes", "module_id")
    op.drop_column("notes", "body")

    op.create_check_constraint(op.f("ck_notes_paper"), "notes", "paper IN ('blank', 'lined', 'grid', 'dotted')")
    op.create_foreign_key(
        op.f("fk_notes_notebook_id_notebooks"), "notes", "notebooks", ["notebook_id"], ["id"], ondelete="CASCADE"
    )
    op.create_foreign_key(
        op.f("fk_notes_library_item_id_library_items"),
        "notes",
        "library_items",
        ["library_item_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        op.f("fk_notes_pdf_upload_id_uploads"), "notes", "uploads", ["pdf_upload_id"], ["id"], ondelete="SET NULL"
    )
    op.create_index("ix_notes_notebook_updated", "notes", ["notebook_id", "updated_at"], unique=False)
    op.create_index("ix_notes_user_lesson", "notes", ["user_id", "lesson_id"], unique=False)
    op.create_index("ix_notes_library_item", "notes", ["library_item_id"], unique=False)
    op.create_index("ix_notes_pdf_upload", "notes", ["pdf_upload_id"], unique=False)
    op.create_index(
        "ix_notes_user_library_item",
        "notes",
        ["user_id", "library_item_id"],
        unique=True,
        postgresql_where=sa.text("library_item_id IS NOT NULL"),
    )

    op.create_table(
        "note_ink",
        sa.Column("note_id", sa.UUID(), nullable=False),
        sa.Column("sheet", sa.Integer(), nullable=False),
        sa.Column(
            "strokes", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'[]'::jsonb"), nullable=False
        ),
        sa.Column("size_bytes", sa.Integer(), server_default="0", nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["note_id"], ["notes.id"], name=op.f("fk_note_ink_note_id_notes"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("note_id", "sheet", name=op.f("pk_note_ink")),
    )

    op.add_column("uploads", sa.Column("note_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        op.f("fk_uploads_note_id_notes"), "uploads", "notes", ["note_id"], ["id"], ondelete="SET NULL"
    )
    op.create_index("ix_uploads_note", "uploads", ["note_id"], unique=False)
    op.drop_constraint(op.f("ck_uploads_uploadpurpose"), "uploads", type_="check")
    op.create_check_constraint(
        op.f("ck_uploads_uploadpurpose"), "uploads", "purpose IN ('library', 'forum_image', 'note_file')"
    )


def downgrade() -> None:
    op.execute("DELETE FROM uploads WHERE purpose = 'note_file'")
    op.drop_constraint(op.f("ck_uploads_uploadpurpose"), "uploads", type_="check")
    op.create_check_constraint(op.f("ck_uploads_uploadpurpose"), "uploads", "purpose IN ('library', 'forum_image')")
    op.drop_index("ix_uploads_note", table_name="uploads")
    op.drop_constraint(op.f("fk_uploads_note_id_notes"), "uploads", type_="foreignkey")
    op.drop_column("uploads", "note_id")
    op.drop_table("note_ink")

    op.add_column("notes", sa.Column("module_id", sa.String(length=64), nullable=True))
    op.add_column("notes", sa.Column("body", sa.Text(), server_default="", nullable=False))
    op.execute(
        "UPDATE notes SET body = text, module_id = (SELECT b.module_id FROM notebooks b WHERE b.id = notes.notebook_id)"
    )
    op.execute("UPDATE notes SET lesson_id = NULL WHERE module_id IS NULL")
    op.drop_index("ix_notes_user_library_item", table_name="notes")
    op.drop_index("ix_notes_pdf_upload", table_name="notes")
    op.drop_index("ix_notes_library_item", table_name="notes")
    op.drop_index("ix_notes_user_lesson", table_name="notes")
    op.drop_index("ix_notes_notebook_updated", table_name="notes")
    op.drop_constraint(op.f("fk_notes_pdf_upload_id_uploads"), "notes", type_="foreignkey")
    op.drop_constraint(op.f("fk_notes_library_item_id_library_items"), "notes", type_="foreignkey")
    op.drop_constraint(op.f("fk_notes_notebook_id_notebooks"), "notes", type_="foreignkey")
    op.drop_constraint(op.f("ck_notes_paper"), "notes", type_="check")
    for column in ("pdf_upload_id", "library_item_id", "sheets", "paper", "text", "doc", "notebook_id"):
        op.drop_column("notes", column)
    op.create_foreign_key(
        op.f("fk_notes_module_id_modules"), "notes", "modules", ["module_id"], ["id"], ondelete="SET NULL"
    )
    op.create_check_constraint(op.f("ck_notes_lesson_module"), "notes", "lesson_id IS NULL OR module_id IS NOT NULL")
    op.create_index("ix_notes_module", "notes", ["module_id"], unique=False)
    op.create_index("ix_notes_user_module", "notes", ["user_id", "module_id", "lesson_id"], unique=False)

    op.drop_index("ix_notebooks_user_module", table_name="notebooks")
    op.drop_index("ix_notebooks_user_created", table_name="notebooks")
    op.drop_index("ix_notebooks_module", table_name="notebooks")
    op.drop_table("notebooks")
