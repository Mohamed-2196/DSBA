"""Accounts: users, sign-in challenges (one-time codes) and sessions."""

from __future__ import annotations

import enum
import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import CheckConstraint, ForeignKey, Index, SmallInteger, String, text
from sqlalchemy.dialects.postgresql import ARRAY, INET
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, check_in, created_ts, str_enum, uuid_pk, year_range
from app.schemas.library import ZONES, Zone


class UserStatus(enum.StrEnum):
    active = "active"
    suspended = "suspended"  # can sign in and read, cannot post, upload or react


class Channel(enum.StrEnum):
    email = "email"
    sms = "sms"


class OtpPurpose(enum.StrEnum):
    sign_in = "sign_in"
    add_identifier = "add_identifier"  # a signed-in user adds a phone number or email to their account


class User(Base):
    __tablename__ = "users"
    __table_args__ = (
        CheckConstraint("email IS NOT NULL OR phone IS NOT NULL", name="has_identifier"),
        check_in("zone", ZONES),
        year_range(),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    email: Mapped[str | None] = mapped_column(String(254), unique=True)  # lower-cased
    phone: Mapped[str | None] = mapped_column(String(20), unique=True)  # E.164, e.g. +97333123456
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


class OtpChallenge(Base):
    """One one-time code sent to an email address or phone number. The code itself is never stored, only an HMAC."""

    __tablename__ = "otp_challenges"
    __table_args__ = (
        Index("ix_otp_challenges_identifier_created", "identifier", "created_at"),
        Index("ix_otp_challenges_ip_created", "ip", "created_at"),
        # a signed-in account's codes per hour (step-up, a new address), and anonymise() before a deletion
        Index("ix_otp_challenges_user_created", "user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = uuid_pk()
    purpose: Mapped[OtpPurpose] = mapped_column(str_enum(OtpPurpose))
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    channel: Mapped[Channel] = mapped_column(str_enum(Channel, 10))
    identifier: Mapped[str] = mapped_column(String(254))  # normalised email or E.164 phone number
    code_hash: Mapped[str] = mapped_column(String(64))
    attempts: Mapped[int] = mapped_column(SmallInteger, default=0, server_default="0")
    created_at: Mapped[datetime] = created_ts()
    expires_at: Mapped[datetime]
    consumed_at: Mapped[datetime | None]
    ip: Mapped[str | None] = mapped_column(INET)


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
