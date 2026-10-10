"""uploads: the forum post an image belongs to, and an index for uploads per user

Revision ID: 0002
Revises: 0001
Create Date: 2026-10-10 20:00:00

Security review finding 8: /media serves a forum image only while the post that shows it is visible, so an upload
records that post (thread_id for a thread's body, reply_id for a reply's). Images already in posts are linked to
the post of their uploader that shows them.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("uploads", sa.Column("thread_id", sa.UUID(), nullable=True))
    op.add_column("uploads", sa.Column("reply_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        op.f("fk_uploads_thread_id_forum_threads"),
        "uploads",
        "forum_threads",
        ["thread_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        op.f("fk_uploads_reply_id_forum_replies"),
        "uploads",
        "forum_replies",
        ["reply_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_uploads_user_created", "uploads", ["user_id", "created_at"], unique=False)
    # Images already attached: the uploader's thread that shows the image, else the uploader's reply.
    op.execute(
        """
        UPDATE uploads AS u SET thread_id = t.id
        FROM forum_threads AS t
        WHERE u.purpose = 'forum_image' AND u.status = 'attached'
          AND u.thread_id IS NULL AND u.reply_id IS NULL
          AND t.author_id = u.user_id
          AND strpos(t.body, '/api/v1/media/' || u.id::text) > 0
        """
    )
    op.execute(
        """
        UPDATE uploads AS u SET reply_id = r.id
        FROM forum_replies AS r
        WHERE u.purpose = 'forum_image' AND u.status = 'attached'
          AND u.thread_id IS NULL AND u.reply_id IS NULL
          AND r.author_id = u.user_id
          AND strpos(r.body, '/api/v1/media/' || u.id::text) > 0
        """
    )


def downgrade() -> None:
    op.drop_index("ix_uploads_user_created", table_name="uploads")
    op.drop_constraint(op.f("fk_uploads_reply_id_forum_replies"), "uploads", type_="foreignkey")
    op.drop_constraint(op.f("fk_uploads_thread_id_forum_threads"), "uploads", type_="foreignkey")
    op.drop_column("uploads", "reply_id")
    op.drop_column("uploads", "thread_id")
