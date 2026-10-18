"""A person's bug reports go with their account

Deleting an account deletes the bug reports it sent (their screenshots are deleted first, objects and rows, by
`accounts.delete_account()`), instead of keeping them without a reporter: what a student wrote, the page and their
browser are their personal data. `bug_reports.user_id` is then NULL only for a guest's report.

Revision ID: 0031
Revises: 0028
Create Date: 2026-10-17 12:00:00
"""

from __future__ import annotations

from collections.abc import Sequence

from alembic import op

revision: str = "0031"
down_revision: str | None = "0028"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FK = "fk_bug_reports_user_id_users"


def _reporter_fk(on_delete: str) -> None:
    op.drop_constraint(op.f(FK), "bug_reports", type_="foreignkey")
    op.create_foreign_key(op.f(FK), "bug_reports", "users", ["user_id"], ["id"], ondelete=on_delete)


def upgrade() -> None:
    _reporter_fk("CASCADE")


def downgrade() -> None:
    _reporter_fk("SET NULL")
