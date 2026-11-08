"""AI apps: the MCP server's clients, students' connections, codes, tokens and call times; the switch stored off

Revision ID: 0062
Revises: 0061
Create Date: 2026-11-08 20:00:00

The mcp switch is stored off on every install: admins see the feature (and can try it), students don't until an
admin switches it on in Manage, Access.
"""

from __future__ import annotations

from collections.abc import Sequence

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision: str = "0062"
down_revision: str | None = "0061"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

FEATURE = "mcp"


def upgrade() -> None:
    op.create_table(
        "ai_app_clients",
        sa.Column("client_id", sa.String(length=64), nullable=False),
        sa.Column("info", postgresql.JSONB(astext_type=sa.Text()), nullable=False),
        sa.Column("ip", postgresql.INET(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.PrimaryKeyConstraint("client_id", name=op.f("pk_ai_app_clients")),
    )
    op.create_index("ix_ai_app_clients_ip_created", "ai_app_clients", ["ip", "created_at"], unique=False)
    op.create_table(
        "ai_app_connections",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("client_id", sa.String(length=64), nullable=False),
        sa.Column("app_name", sa.String(length=100), nullable=False),
        sa.Column("redirect_host", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(
            ["client_id"],
            ["ai_app_clients.client_id"],
            name=op.f("fk_ai_app_connections_client_id_ai_app_clients"),
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_ai_app_connections_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ai_app_connections")),
    )
    op.create_index("ix_ai_app_connections_user_client", "ai_app_connections", ["user_id", "client_id"], unique=True)
    op.create_table(
        "ai_app_codes",
        sa.Column("code_hash", sa.String(length=64), nullable=False),
        sa.Column("connection_id", sa.UUID(), nullable=False),
        sa.Column("code_challenge", sa.String(length=128), nullable=False),
        sa.Column("redirect_uri", sa.Text(), nullable=False),
        sa.Column("redirect_uri_explicit", sa.Boolean(), nullable=False),
        sa.Column("scopes", sa.String(length=200), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(
            ["connection_id"],
            ["ai_app_connections.id"],
            name=op.f("fk_ai_app_codes_connection_id_ai_app_connections"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("code_hash", name=op.f("pk_ai_app_codes")),
    )
    op.create_index(op.f("ix_ai_app_codes_connection_id"), "ai_app_codes", ["connection_id"], unique=False)
    op.create_table(
        "ai_app_tokens",
        sa.Column("token_hash", sa.String(length=64), nullable=False),
        sa.Column("connection_id", sa.UUID(), nullable=False),
        sa.Column("kind", sa.String(length=10), nullable=False),
        sa.Column("scopes", sa.String(length=200), nullable=False),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.CheckConstraint("kind IN ('access', 'refresh')", name=op.f("ck_ai_app_tokens_kind")),
        sa.ForeignKeyConstraint(
            ["connection_id"],
            ["ai_app_connections.id"],
            name=op.f("fk_ai_app_tokens_connection_id_ai_app_connections"),
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("token_hash", name=op.f("pk_ai_app_tokens")),
    )
    op.create_index(op.f("ix_ai_app_tokens_connection_id"), "ai_app_tokens", ["connection_id"], unique=False)
    op.create_table(
        "ai_app_calls",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("user_id", sa.UUID(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(
            ["user_id"], ["users.id"], name=op.f("fk_ai_app_calls_user_id_users"), ondelete="CASCADE"
        ),
        sa.PrimaryKeyConstraint("id", name=op.f("pk_ai_app_calls")),
    )
    op.create_index("ix_ai_app_calls_user_created", "ai_app_calls", ["user_id", "created_at"], unique=False)
    op.execute(
        sa.text(
            "INSERT INTO feature_switches (feature, mode, updated_by, updated_at) VALUES (:feature, 'off', NULL, now()) "
            "ON CONFLICT (feature) DO NOTHING"
        ).bindparams(feature=FEATURE)
    )


def downgrade() -> None:
    op.execute(sa.text("DELETE FROM feature_switch_roles WHERE feature = :feature").bindparams(feature=FEATURE))
    op.execute(sa.text("DELETE FROM feature_switches WHERE feature = :feature").bindparams(feature=FEATURE))
    op.drop_index("ix_ai_app_calls_user_created", table_name="ai_app_calls")
    op.drop_table("ai_app_calls")
    op.drop_index(op.f("ix_ai_app_tokens_connection_id"), table_name="ai_app_tokens")
    op.drop_table("ai_app_tokens")
    op.drop_index(op.f("ix_ai_app_codes_connection_id"), table_name="ai_app_codes")
    op.drop_table("ai_app_codes")
    op.drop_index("ix_ai_app_connections_user_client", table_name="ai_app_connections")
    op.drop_table("ai_app_connections")
    op.drop_index("ix_ai_app_clients_ip_created", table_name="ai_app_clients")
    op.drop_table("ai_app_clients")
