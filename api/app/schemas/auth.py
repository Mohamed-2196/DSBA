from __future__ import annotations

from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import Field, StringConstraints, WithJsonSchema

from app.schemas.common import ApiModel, Role, UserStatus, Year

Identifier = Annotated[str, StringConstraints(strip_whitespace=True, min_length=3, max_length=254)]
Code = Annotated[str, StringConstraints(strip_whitespace=True, pattern=r"^\d{6}$")]
# 2-40 characters after trimming: letters (any script), digits, spaces and . ' -. The documented schema says so;
# the rule itself is applied by PATCH /me, so that every bad name answers 422 invalid_display_name.
DisplayName = Annotated[str, WithJsonSchema({"type": "string", "maxLength": 40, "minLength": 2})]


class OtpStartRequest(ApiModel):
    """An email address or a phone number (local Bahraini numbers need no country code)."""

    identifier: Identifier


class OtpChallengeOut(ApiModel):
    challenge_id: UUID
    channel: Literal["email", "sms"]
    destination_hint: str  # 'm•••@gmail.com' / '+973 •••• ••12'
    expires_in: int  # seconds
    resend_after: int  # seconds until another code can be requested for this address


class OtpVerifyRequest(ApiModel):
    challenge_id: UUID
    code: Code


class Preferences(ApiModel):
    email_notifications: bool = True  # replies, accepted answers, upload reviews
    newsletter_emails: bool = True  # a new issue is out


class PreferencesUpdate(ApiModel):
    email_notifications: bool | None = None
    newsletter_emails: bool | None = None


class Me(ApiModel):
    id: UUID
    display_name: str | None
    year: Year | None
    role: Role
    status: UserStatus
    email: str | None
    phone: str | None
    needs_profile: bool  # True until a display name is set: the web app asks for it right after sign-in
    created_at: datetime
    preferences: Preferences


class SignInResult(ApiModel):
    user: Me
    is_new_user: bool


class MeUpdate(ApiModel):
    """Fields that are not sent stay as they are; `year: null` clears the cohort."""

    display_name: DisplayName | None = None
    year: Year | None = None
    preferences: PreferencesUpdate | None = None


class SessionInfo(ApiModel):
    id: UUID
    created_at: datetime
    last_seen_at: datetime | None
    user_agent: str | None
    ip: str | None
    current: bool


class AccountExport(ApiModel):
    """Everything the Hub stores about the signed-in user (GET /me/export)."""

    user: Me
    sessions: list[SessionInfo]
    threads: list[dict[str, object]]
    replies: list[dict[str, object]]
    library_items: list[dict[str, object]]
    stars: list[str]
    reactions: list[dict[str, object]]
    progress: dict[str, object]
    notifications: list[dict[str, object]]
    votes: list[dict[str, object]] = Field(default_factory=list)  # forum upvotes: {type: thread|reply, id, createdAt}
    reports: list[dict[str, object]] = Field(default_factory=list)  # reports this person filed
