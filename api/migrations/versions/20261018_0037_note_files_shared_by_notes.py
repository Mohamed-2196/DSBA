"""a note lists the files it shows, and a note file no note shows any more is released

Revision ID: 0037
Revises: 0034
Create Date: 2026-10-18 12:40:00

- A file belonged to one note (`uploads.note_id`), but a picture copied into a second note keeps its upload: deleting
  the first note, or the picture in it, freed the file and the sweep deleted it from under the second. Now each note
  lists the student's files it shows (`notes.uploads`, GIN-indexed to find the notes that show a file), filled here
  from the files' notes and the notes' own PDFs, and `uploads.note_id` goes.
- `released`: a note file that none of its owner's notes shows any more. It no longer counts against the student's
  room, and the sweep deletes it.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0037"
down_revision: str | None = "0034"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _statuses(*values: str) -> None:
    op.drop_constraint(op.f("ck_uploads_uploadstatus"), "uploads", type_="check")
    listed = ", ".join(f"'{v}'" for v in values)
    op.create_check_constraint(op.f("ck_uploads_uploadstatus"), "uploads", f"status IN ({listed})")


def upgrade() -> None:
    op.add_column(
        "notes",
        sa.Column("uploads", postgresql.ARRAY(sa.Uuid()), server_default=sa.text("'{}'"), nullable=False),
    )
    op.execute(
        "UPDATE notes SET uploads = ARRAY("
        "SELECT id FROM (SELECT u.id FROM uploads u WHERE u.note_id = notes.id "
        "UNION SELECT notes.pdf_upload_id WHERE notes.pdf_upload_id IS NOT NULL) shown ORDER BY id)"
    )
    op.create_index("ix_notes_uploads", "notes", ["uploads"], unique=False, postgresql_using="gin")
    _statuses("pending", "uploaded", "attached", "released")
    op.drop_index(op.f("ix_uploads_note"), table_name="uploads")
    op.drop_constraint(op.f("fk_uploads_note_id_notes"), "uploads", type_="foreignkey")
    op.drop_column("uploads", "note_id")


def downgrade() -> None:
    op.add_column("uploads", sa.Column("note_id", sa.UUID(), autoincrement=False, nullable=True))
    op.create_foreign_key(
        op.f("fk_uploads_note_id_notes"), "uploads", "notes", ["note_id"], ["id"], ondelete="SET NULL"
    )
    op.create_index(op.f("ix_uploads_note"), "uploads", ["note_id"], unique=False)
    # a file shown by several notes belongs to one of them again
    op.execute("UPDATE uploads SET note_id = notes.id FROM notes WHERE uploads.id = ANY(notes.uploads)")
    op.execute("UPDATE uploads SET status = 'uploaded' WHERE status = 'released'")
    _statuses("pending", "uploaded", "attached")
    op.drop_index("ix_notes_uploads", table_name="notes", postgresql_using="gin")
    op.drop_column("notes", "uploads")
