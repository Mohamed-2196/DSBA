"""Accounts: users, their sessions, and what signing in with a password or with Google keeps."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import ForeignKey, Index, SmallInteger, String, text
from sqlalchemy.dialects.postgresql import ARRAY, INET
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, check_in, created_ts, str_enum, uuid_pk, year_range
from app.schemas.library import ZONES, Zone


class UserStatus(enum.StrEnum):
    active = "active"
    suspended = "suspended"  # can sign in and read, cannot post, upload or react


class AttemptKind(enum.StrEnum):
    sign_in = "sign_in"  # a password sign-in that worked
    sign_in_failed = "sign_in_failed"  # a wrong password, or an address without a password
    sign_up = "sign_up"  # a new account with a password
    reset_failed = "reset_failed"  # a password reset link that didn't work


class GoogleIntent(enum.StrEnum):
    sign_in = "sign_in"
    link = "link"  # a signed-in account adds Google


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        check_in("zone", ZONES),
        year_range(),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    email: Mapped[str] = mapped_column(String(254), unique=True)  # lower-cased
    # When Google vouched for the address (a Google sign-in, or linking Google). None: typed at sign-up, unproven.
    # Only confirmed accounts hold staff roles, and an unconfirmed one goes to whoever signs in with Google for it.
    email_confirmed_at: Mapped[datetime | None]
    google_sub: Mapped[str | None] = mapped_column(String(255), unique=True)  # Google's id for the person
    password_hash: Mapped[str | None] = mapped_column(String(255))  # argon2id; None: signs in with Google only
    display_name: Mapped[str | None] = mapped_column(String(60))  # None until the profile step
    year: Mapped[int | None] = mapped_column(SmallInteger)  # cohort 1-3; None = not a current student
    status: Mapped[UserStatus] = mapped_column(
        str_enum(UserStatus), default=UserStatus.active, server_default=UserStatus.active.value
    )
    preferences: Mapped[dict[str, Any]] = mapped_column(default=dict, server_default=text("'{}'::jsonb"))
    # The papers this person sits, as module ids: their option and electives, and papers from other years.
    # Empty: every module of their year. Private: only /me and the export show it.
    papers: Mapped[list[str]] = mapped_column(ARRAY(String(64)), default=list, server_default="{}")
    zone: Mapped[Zone | None] = mapped_column(String(8))  # the zone whose papers they sit
    created_at: Mapped[datetime] = created_ts()
    last_seen_at: Mapped[datetime | None]


class SignInAttempt(Base):
    """One attempt that the sign-in limits count: password sign-ins (and failures), sign-ups, wrong current
    passwords and failed reset links. `account_key` is a keyed hash of the address's rate-limit key, never the
    address, so the rows hold nothing personal and outlive a deleted account; the sweep deletes them after two days."""

    __tablename__ = "sign_in_attempts"
    __table_args__ = (
        Index("ix_sign_in_attempts_key_created", "kind", "account_key", "created_at"),
        Index("ix_sign_in_attempts_ip_created", "kind", "ip", "created_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    kind: Mapped[AttemptKind] = mapped_column(str_enum(AttemptKind))
    account_key: Mapped[str | None] = mapped_column(String(64))
    ip: Mapped[str | None] = mapped_column(INET)
    created_at: Mapped[datetime] = created_ts()


class GoogleLogin(Base):
    """A "Continue with Google" in progress: from the redirect to Google until its callback, once, within minutes.
    The state travels in the URL and in a cookie of this browser, and only its SHA-256 is stored; the nonce must come
    back inside Google's ID token, and the PKCE verifier goes with the code to Google's token endpoint."""

    __tablename__ = "google_logins"
    __table_args__ = (Index("ix_google_logins_ip_created", "ip", "created_at"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    state_hash: Mapped[str] = mapped_column(String(64), unique=True)
    nonce: Mapped[str] = mapped_column(String(64))
    code_verifier: Mapped[str] = mapped_column(String(128))
    intent: Mapped[GoogleIntent] = mapped_column(str_enum(GoogleIntent, 10))
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))  # linking
    return_to: Mapped[str] = mapped_column(String(512))  # a path in the app
    ip: Mapped[str | None] = mapped_column(INET)
    created_at: Mapped[datetime] = created_ts()
    expires_at: Mapped[datetime]
    used_at: Mapped[datetime | None]


class PasswordReset(Base):
    """A one-time link to set a new password, made by an admin for someone who forgot theirs. Only the token's SHA-256
    is stored; it works once, within an hour, and a newer link retires it."""

    __tablename__ = "password_resets"
    __table_args__ = (Index("ix_password_resets_user", "user_id"), Index("ix_password_resets_created_by", "created_by"))

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = created_ts()
    expires_at: Mapped[datetime]
    used_at: Mapped[datetime | None]


class UserSession(Base):
    """A signed-in browser. The cookie holds a random token; only its SHA-256 is stored."""

    __tablename__ = "user_sessions"
    __table_args__ = (Index("ix_user_sessions_user", "user_id"),)

    id: Mapped[uuid.UUID] = uuid_pk()
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    created_at: Mapped[datetime] = created_ts()
    last_seen_at: Mapped[datetime | None]
    expires_at: Mapped[datetime]
    revoked_at: Mapped[datetime | None]
    ip: Mapped[str | None] = mapped_column(INET)
    user_agent: Mapped[str | None] = mapped_column(String(300))
