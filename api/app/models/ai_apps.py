"""AI apps a student connected to the Hub through its MCP server (app/services/ai_apps): the apps that registered
themselves, each student's connections, and the codes and tokens behind them (stored as SHA-256 hashes, like
sessions). Nothing an AI app asks the Hub is stored: a call leaves only its time, for the rate limit."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import Boolean, ForeignKey, Index, String, Text
from sqlalchemy.dialects.postgresql import INET
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, check_in, created_ts, uuid_pk

TOKEN_KINDS = ("access", "refresh", "spent")  # spent: a refresh token already exchanged


class AiAppClient(Base):
    """An AI app that registered itself (OAuth dynamic client registration): what it sent, as the MCP SDK reads it
    (`info`: OAuthClientInformationFull, its secret included when it has one). Anyone may register, so nothing here
    is trusted: a student sees the app's name next to where it sends them back."""

    __tablename__ = "ai_app_clients"
    __table_args__ = (Index("ix_ai_app_clients_ip_created", "ip", "created_at"),)

    client_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    info: Mapped[dict[str, Any]]
    ip: Mapped[str | None] = mapped_column(INET)  # who registered it: registrations per address per hour
    created_at: Mapped[datetime] = created_ts()


class AiAppConnection(Base):
    """A student let an AI app read the Hub as them (Settings, Connected AI apps). One per student and app; removing
    it removes its codes and tokens, so the app is signed out at once."""

    __tablename__ = "ai_app_connections"
    __table_args__ = (Index("ix_ai_app_connections_user_client", "user_id", "client_id", unique=True),)

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    client_id: Mapped[str] = mapped_column(ForeignKey("ai_app_clients.client_id", ondelete="CASCADE"))
    app_name: Mapped[str] = mapped_column(String(100))  # as the app named itself
    redirect_host: Mapped[str] = mapped_column(String(255))  # where it sends the student back: who the app really is
    created_at: Mapped[datetime] = created_ts()
    last_used_at: Mapped[datetime | None]


class AiAppCode(Base):
    """A one-time authorization code, for the minutes between the student's yes and the app's token request."""

    __tablename__ = "ai_app_codes"

    code_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    connection_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("ai_app_connections.id", ondelete="CASCADE"), index=True
    )
    code_challenge: Mapped[str] = mapped_column(String(128))  # PKCE, S256
    redirect_uri: Mapped[str] = mapped_column(Text)
    redirect_uri_explicit: Mapped[bool] = mapped_column(Boolean)
    scopes: Mapped[str] = mapped_column(String(200))  # space-separated
    expires_at: Mapped[datetime]


class AiAppToken(Base):
    """An access token (short-lived) or a refresh token (rotated on every use) of a connection."""

    __tablename__ = "ai_app_tokens"
    __table_args__ = (check_in("kind", TOKEN_KINDS),)

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    connection_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("ai_app_connections.id", ondelete="CASCADE"), index=True
    )
    kind: Mapped[str] = mapped_column(String(10))
    scopes: Mapped[str] = mapped_column(String(200))  # space-separated
    expires_at: Mapped[datetime]
    created_at: Mapped[datetime] = created_ts()


class AiAppCall(Base):
    """One call an AI app made as a student: its time only, never what it asked (the per-student rate limit)."""

    __tablename__ = "ai_app_calls"
    __table_args__ = (Index("ix_ai_app_calls_user_created", "user_id", "created_at"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = created_ts()
