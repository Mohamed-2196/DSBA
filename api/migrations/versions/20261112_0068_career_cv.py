"""Rate my CV, in Career Navigator

Revision ID: 0068
Revises: 0067
Create Date: 2026-11-12 12:00:00

- `cv_reviews`: the CVs a student keeps (app/services/career_cv.py), each with its upload, its latest rating and its
  text. They go with the upload, and with the student's account.
- `uploads.purpose` takes 'cv': a CV, a PDF or a Word file, seen by its owner only.
- The `career.cv` switch is stored on for everyone where no admin has set it: the rating is rules on the hub's own
  server, with no AI and no cost per CV. An admin can switch it off in Manage, Access.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0068"
down_revision: str | None = "0067"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FEATURE = "career.cv"
PURPOSES = (
    "library",
    "forum_image",
    "board",
    "note_file",
    "career_logo",
    "newsletter_image",
    "bug_screenshot",
    "module_art",
)


def _purposes(*values: str) -> None:
    op.drop_constraint(op.f("ck_uploads_uploadpurpose"), "uploads", type_="check")
    listed = ", ".join(f"'{v}'" for v in values)
    op.create_check_constraint(op.f("ck_uploads_uploadpurpose"), "uploads", f"purpose IN ({listed})")


def upgrade() -> None:
    _purposes(*PURPOSES, "cv")
    op.create_table(
        "cv_reviews",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("upload_id", sa.UUID(), nullable=False),
        sa.Column("role_id", sa.String(64), nullable=False),
        sa.Column("score", sa.SmallInteger(), nullable=False),
        sa.Column("fit", sa.SmallInteger(), nullable=False),
        sa.Column("result", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("pages", sa.SmallInteger(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("rated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_cv_reviews_user_id_users"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["upload_id"], ["uploads.id"], name=op.f("fk_cv_reviews_upload_id_uploads"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_cv_reviews")),
        sa.UniqueConstraint("upload_id", name=op.f("uq_cv_reviews_upload_id")),
    )
    op.create_index("ix_cv_reviews_user_created", "cv_reviews", ["user_id", "created_at"])
    op.execute(
        sa.text(
            "INSERT INTO feature_switches (feature, mode, updated_by, updated_at) "
            "VALUES (:feature, 'everyone', NULL, now()) ON CONFLICT (feature) DO NOTHING"
        ).bindparams(feature=FEATURE)
    )


def downgrade() -> None:
    """Drops the kept CVs' ratings and their upload rows; their files stay in the bucket until removed by hand."""
    op.execute(
        sa.text(
            "DELETE FROM feature_switches WHERE feature = :feature AND mode = 'everyone' AND updated_by IS NULL"
        ).bindparams(feature=FEATURE)
    )
    op.drop_index("ix_cv_reviews_user_created", table_name="cv_reviews")
    op.drop_table("cv_reviews")
    op.execute("DELETE FROM uploads WHERE purpose = 'cv'")
    _purposes(*PURPOSES)
