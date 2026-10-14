"""boards: many boards per student with their own columns, labels, checklists, files, comments and reminders

Revision ID: 0019
Revises: 0018
Create Date: 2026-10-14 20:00:00

Each card and revision plan now belongs to a board and a column of it, so the cards and plans made on the single
study board are deleted: the hub isn't released. Files on cards are uploads with purpose 'board' and a card_id;
reminders arrive as board_reminder notifications, so both CHECKs widen.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0019"
down_revision: str | None = "0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

COLORS = "('cobalt', 'teal', 'green', 'amber', 'coral', 'violet', 'slate')"
NOTIFICATION_KINDS = (
    "thread_reply",
    "reply_reply",
    "answer_accepted",
    "upload_published",
    "upload_rejected",
    "new_issue",
    "report_resolved",
    "request_update",
    "date_changed",
    "system",
    "followed_reply",
    "followed_answer",
    "senior_question",
    "video_suggestion",
)


def _kinds(kinds: Sequence[str]) -> None:
    op.drop_constraint(op.f("ck_notifications_kind"), "notifications", type_="check")
    op.create_check_constraint(
        op.f("ck_notifications_kind"), "notifications", f"kind IN ({', '.join(repr(k) for k in kinds)})"
    )


def _purposes(purposes: Sequence[str]) -> None:
    op.drop_constraint(op.f("ck_uploads_uploadpurpose"), "uploads", type_="check")
    op.create_check_constraint(
        op.f("ck_uploads_uploadpurpose"), "uploads", f"purpose IN ({', '.join(repr(p) for p in purposes)})"
    )


def upgrade() -> None:
    op.execute("DELETE FROM board_cards")
    op.execute("DELETE FROM board_plans")

    op.create_table(
        "boards",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=60), nullable=False),
        sa.Column("emoji", sa.String(length=16), nullable=True),
        sa.Column("color", sa.String(length=12), nullable=False),
        sa.Column("template", sa.String(length=12), nullable=False),
        sa.Column("position", sa.Double(), nullable=False),
        sa.Column("archived_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(f"color IN {COLORS}", name=op.f("ck_boards_color")),
        sa.CheckConstraint(
            "template IN ('study', 'revision', 'assignment', 'weekly', 'personal', 'blank')",
            name=op.f("ck_boards_template"),
        ),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name=op.f("fk_boards_user_id_users"), ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_boards")),
    )
    op.create_index("ix_boards_user_position", "boards", ["user_id", "position"], unique=False)
    op.create_table(
        "board_columns",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("board_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=40), nullable=False),
        sa.Column("done", sa.Boolean(), nullable=False),
        sa.Column("position", sa.Double(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["board_id"], ["boards.id"], name=op.f("fk_board_columns_board_id_boards"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_board_columns")),
    )
    op.create_index("ix_board_columns_board_position", "board_columns", ["board_id", "position"], unique=False)
    op.create_table(
        "board_labels",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("name", sa.String(length=30), nullable=False),
        sa.Column("color", sa.String(length=12), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint(f"color IN {COLORS}", name=op.f("ck_board_labels_color")),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_board_labels_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_board_labels")),
        sa.UniqueConstraint("user_id", "name", name="uq_board_labels_user_name"),
    )

    # cards: on a board, in one of its columns
    op.drop_index("ix_board_cards_user_lane_position", table_name="board_cards")
    op.drop_index("uq_board_cards_user_lesson", table_name="board_cards", postgresql_where="(lesson_id IS NOT NULL)")
    op.drop_index("uq_board_cards_user_link", table_name="board_cards", postgresql_where="(link_type IS NOT NULL)")
    op.drop_constraint(op.f("ck_board_cards_lane"), "board_cards", type_="check")
    op.drop_column("board_cards", "lane")
    op.alter_column("board_cards", "note", new_column_name="description")
    op.add_column("board_cards", sa.Column("board_id", sa.UUID(), nullable=False))
    op.add_column("board_cards", sa.Column("column_id", sa.UUID(), nullable=False))
    op.add_column("board_cards", sa.Column("due_time", sa.Time(), nullable=True))
    op.add_column("board_cards", sa.Column("remind_before", sa.SmallInteger(), nullable=True))
    op.add_column("board_cards", sa.Column("remind_at", sa.DateTime(timezone=True), nullable=True))
    op.add_column("board_cards", sa.Column("priority", sa.String(length=8), nullable=False))
    op.add_column(
        "board_cards",
        sa.Column(
            "checklist",
            postgresql.JSONB(astext_type=sa.Text()),
            server_default=sa.text("'[]'::jsonb"),
            nullable=False,
        ),
    )
    op.add_column("board_cards", sa.Column("cover_id", sa.UUID(), nullable=True))
    op.create_check_constraint(
        op.f("ck_board_cards_priority"), "board_cards", "priority IN ('none', 'low', 'medium', 'high')"
    )
    op.create_foreign_key(
        op.f("fk_board_cards_board_id_boards"), "board_cards", "boards", ["board_id"], ["id"], ondelete="CASCADE"
    )
    op.create_foreign_key(
        op.f("fk_board_cards_column_id_board_columns"),
        "board_cards",
        "board_columns",
        ["column_id"],
        ["id"],
        ondelete="CASCADE",
    )
    op.create_index("ix_board_cards_board", "board_cards", ["board_id"], unique=False)
    op.create_index("ix_board_cards_column_position", "board_cards", ["column_id", "position"], unique=False)
    op.create_index(
        "ix_board_cards_remind_at",
        "board_cards",
        ["remind_at"],
        unique=False,
        postgresql_where=sa.text("remind_at IS NOT NULL"),
    )
    op.create_index("ix_board_cards_user", "board_cards", ["user_id"], unique=False)
    op.create_index(
        "uq_board_cards_board_lesson",
        "board_cards",
        ["board_id", "lesson_id"],
        unique=True,
        postgresql_where=sa.text("lesson_id IS NOT NULL"),
    )
    op.create_index(
        "uq_board_cards_board_link",
        "board_cards",
        ["board_id", "link_type", "link_id"],
        unique=True,
        postgresql_where=sa.text("link_type IS NOT NULL"),
    )

    op.create_table(
        "board_card_labels",
        sa.Column("card_id", sa.UUID(), nullable=False),
        sa.Column("label_id", sa.UUID(), nullable=False),
        sa.ForeignKeyConstraint(
            ["card_id"], ["board_cards.id"], name=op.f("fk_board_card_labels_card_id_board_cards"), ondelete="CASCADE"
        ),
        sa.ForeignKeyConstraint(
            ["label_id"],
            ["board_labels.id"],
            name=op.f("fk_board_card_labels_label_id_board_labels"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("card_id", "label_id", name=op.f("pk_board_card_labels")),
    )
    op.create_index("ix_board_card_labels_label", "board_card_labels", ["label_id"], unique=False)
    op.create_table(
        "board_comments",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("card_id", sa.UUID(), nullable=False),
        sa.Column("body", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["card_id"], ["board_cards.id"], name=op.f("fk_board_comments_card_id_board_cards"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_board_comments")),
    )
    op.create_index("ix_board_comments_card", "board_comments", ["card_id", "created_at"], unique=False)

    op.add_column("board_plans", sa.Column("board_id", sa.UUID(), nullable=False))
    op.create_foreign_key(
        op.f("fk_board_plans_board_id_boards"), "board_plans", "boards", ["board_id"], ["id"], ondelete="CASCADE"
    )
    op.create_index("ix_board_plans_board", "board_plans", ["board_id"], unique=False)

    op.add_column("uploads", sa.Column("card_id", sa.UUID(), nullable=True))
    op.create_foreign_key(
        op.f("fk_uploads_card_id_board_cards"), "uploads", "board_cards", ["card_id"], ["id"], ondelete="SET NULL"
    )
    op.create_index("ix_uploads_card", "uploads", ["card_id"], unique=False)
    _purposes(("library", "forum_image", "board"))
    _kinds((*NOTIFICATION_KINDS, "board_reminder"))


def downgrade() -> None:
    op.execute("DELETE FROM notifications WHERE kind = 'board_reminder'")
    _kinds(NOTIFICATION_KINDS)
    op.execute("DELETE FROM uploads WHERE purpose = 'board'")
    _purposes(("library", "forum_image"))
    op.drop_index("ix_uploads_card", table_name="uploads")
    op.drop_constraint(op.f("fk_uploads_card_id_board_cards"), "uploads", type_="foreignkey")
    op.drop_column("uploads", "card_id")

    op.execute("DELETE FROM board_cards")
    op.execute("DELETE FROM board_plans")
    op.drop_index("ix_board_plans_board", table_name="board_plans")
    op.drop_constraint(op.f("fk_board_plans_board_id_boards"), "board_plans", type_="foreignkey")
    op.drop_column("board_plans", "board_id")

    op.drop_index("ix_board_comments_card", table_name="board_comments")
    op.drop_table("board_comments")
    op.drop_index("ix_board_card_labels_label", table_name="board_card_labels")
    op.drop_table("board_card_labels")

    op.drop_index(
        "uq_board_cards_board_link", table_name="board_cards", postgresql_where=sa.text("link_type IS NOT NULL")
    )
    op.drop_index(
        "uq_board_cards_board_lesson", table_name="board_cards", postgresql_where=sa.text("lesson_id IS NOT NULL")
    )
    op.drop_index("ix_board_cards_user", table_name="board_cards")
    op.drop_index(
        "ix_board_cards_remind_at", table_name="board_cards", postgresql_where=sa.text("remind_at IS NOT NULL")
    )
    op.drop_index("ix_board_cards_column_position", table_name="board_cards")
    op.drop_index("ix_board_cards_board", table_name="board_cards")
    op.drop_constraint(op.f("fk_board_cards_column_id_board_columns"), "board_cards", type_="foreignkey")
    op.drop_constraint(op.f("fk_board_cards_board_id_boards"), "board_cards", type_="foreignkey")
    op.drop_constraint(op.f("ck_board_cards_priority"), "board_cards", type_="check")
    for column in ("cover_id", "checklist", "priority", "remind_at", "remind_before", "due_time"):
        op.drop_column("board_cards", column)
    op.drop_column("board_cards", "column_id")
    op.drop_column("board_cards", "board_id")
    op.alter_column("board_cards", "description", new_column_name="note")
    op.add_column("board_cards", sa.Column("lane", sa.String(length=12), nullable=False))
    op.create_check_constraint(op.f("ck_board_cards_lane"), "board_cards", "lane IN ('todo', 'doing', 'done')")
    op.create_index("ix_board_cards_user_lane_position", "board_cards", ["user_id", "lane", "position"], unique=False)
    op.create_index(
        "uq_board_cards_user_link",
        "board_cards",
        ["user_id", "link_type", "link_id"],
        unique=True,
        postgresql_where=sa.text("link_type IS NOT NULL"),
    )
    op.create_index(
        "uq_board_cards_user_lesson",
        "board_cards",
        ["user_id", "lesson_id"],
        unique=True,
        postgresql_where=sa.text("lesson_id IS NOT NULL"),
    )

    op.drop_table("board_labels")
    op.drop_index("ix_board_columns_board_position", table_name="board_columns")
    op.drop_table("board_columns")
    op.drop_index("ix_boards_user_position", table_name="boards")
    op.drop_table("boards")
