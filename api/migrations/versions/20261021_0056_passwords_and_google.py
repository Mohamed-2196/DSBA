"""sign in with a password or with Google instead of one-time codes

Revision ID: 0056
Revises: 0052
Create Date: 2026-10-21 10:00:00

- `users`: the phone number goes (it only served sign-in) and the email address is required; accounts with a phone
  number only can't sign in any more and are deleted. New: `password_hash` (argon2id), `google_sub` (Google's id for
  the person) and `email_confirmed_at` (when Google vouched for the address: only then may the account hold a staff
  role).
- `otp_challenges` goes. `sign_in_attempts` holds what the sign-in limits count (a keyed hash of the address, never
  the address), `google_logins` each "Continue with Google" between the redirect and its callback, and
  `password_resets` the one-time links admins make for a forgotten password (hashed).
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0056"
down_revision: str | None = "0052"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def _now(name: str) -> sa.Column[sa.DateTime]:
    return sa.Column(name, sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False)


def upgrade() -> None:
    op.drop_table("otp_challenges")
    op.execute("DELETE FROM users WHERE email IS NULL")
    op.drop_constraint(op.f("ck_users_has_identifier"), "users", type_="check")
    op.drop_constraint("uq_users_phone", "users", type_="unique")
    op.drop_column("users", "phone")
    op.alter_column("users", "email", existing_type=sa.String(254), nullable=False)
    op.add_column("users", sa.Column("email_confirmed_at", sa.DateTime(timezone=True)))
    op.add_column("users", sa.Column("google_sub", sa.String(255)))
    op.add_column("users", sa.Column("password_hash", sa.String(255)))
    op.create_unique_constraint("uq_users_google_sub", "users", ["google_sub"])

    op.create_table(
        "sign_in_attempts",
        sa.Column("id", sa.UUID()),
        sa.Column("kind", sa.String(20), nullable=False),
        sa.Column("account_key", sa.String(64)),
        sa.Column("ip", postgresql.INET()),
        _now("created_at"),
        sa.PrimaryKeyConstraint("id", name="pk_sign_in_attempts"),
        sa.CheckConstraint(
            "kind IN ('sign_in', 'sign_in_failed', 'sign_up', 'reset_failed')",
            name=op.f("ck_sign_in_attempts_attemptkind"),
        ),
    )
    op.create_index("ix_sign_in_attempts_key_created", "sign_in_attempts", ["kind", "account_key", "created_at"])
    op.create_index("ix_sign_in_attempts_ip_created", "sign_in_attempts", ["kind", "ip", "created_at"])

    op.create_table(
        "google_logins",
        sa.Column("id", sa.UUID()),
        sa.Column("state_hash", sa.String(64), nullable=False),
        sa.Column("nonce", sa.String(64), nullable=False),
        sa.Column("code_verifier", sa.String(128), nullable=False),
        sa.Column("intent", sa.String(10), nullable=False),
        sa.Column("user_id", sa.UUID()),
        sa.Column("return_to", sa.String(512), nullable=False),
        sa.Column("ip", postgresql.INET()),
        _now("created_at"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint("id", name="pk_google_logins"),
        sa.UniqueConstraint("state_hash", name="uq_google_logins_state_hash"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_google_logins_user_id_users", ondelete="CASCADE"),
        sa.CheckConstraint("intent IN ('sign_in', 'link')", name=op.f("ck_google_logins_googleintent")),
    )
    op.create_index("ix_google_logins_ip_created", "google_logins", ["ip", "created_at"])

    op.create_table(
        "password_resets",
        sa.Column("id", sa.UUID()),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("created_by", sa.UUID()),
        _now("created_at"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True)),
        sa.PrimaryKeyConstraint("id", name="pk_password_resets"),
        sa.UniqueConstraint("token_hash", name="uq_password_resets_token_hash"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_password_resets_user_id_users", ondelete="CASCADE"),
        sa.ForeignKeyConstraint(
            ["created_by"], ["users.id"], name="fk_password_resets_created_by_users", ondelete="SET NULL"
        ),
    )
    op.create_index("ix_password_resets_user", "password_resets", ["user_id"])
    op.create_index("ix_password_resets_created_by", "password_resets", ["created_by"])


def downgrade() -> None:
    op.drop_table("password_resets")
    op.drop_table("google_logins")
    op.drop_table("sign_in_attempts")
    op.drop_constraint("uq_users_google_sub", "users", type_="unique")
    op.drop_column("users", "password_hash")
    op.drop_column("users", "google_sub")
    op.drop_column("users", "email_confirmed_at")
    op.alter_column("users", "email", existing_type=sa.String(254), nullable=True)
    op.add_column("users", sa.Column("phone", sa.String(20)))
    op.create_unique_constraint("uq_users_phone", "users", ["phone"])
    op.create_check_constraint(op.f("ck_users_has_identifier"), "users", "email IS NOT NULL OR phone IS NOT NULL")

    op.create_table(
        "otp_challenges",
        sa.Column("id", sa.UUID()),
        sa.Column("purpose", sa.String(20), nullable=False),
        sa.Column("user_id", sa.UUID()),
        sa.Column("channel", sa.String(10), nullable=False),
        sa.Column("identifier", sa.String(254), nullable=False),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("attempts", sa.SmallInteger(), server_default="0", nullable=False),
        _now("created_at"),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("consumed_at", sa.DateTime(timezone=True)),
        sa.Column("ip", postgresql.INET()),
        sa.Column("suppressed", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.PrimaryKeyConstraint("id", name="pk_otp_challenges"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], name="fk_otp_challenges_user_id_users", ondelete="CASCADE"),
        sa.CheckConstraint("channel IN ('email', 'sms')", name=op.f("ck_otp_challenges_channel")),
        sa.CheckConstraint("purpose IN ('sign_in', 'add_identifier')", name=op.f("ck_otp_challenges_otppurpose")),
    )
    op.create_index("ix_otp_challenges_identifier_created", "otp_challenges", ["identifier", "created_at"])
    op.create_index("ix_otp_challenges_ip_created", "otp_challenges", ["ip", "created_at"])
    op.create_index("ix_otp_challenges_user_created", "otp_challenges", ["user_id", "created_at"])
