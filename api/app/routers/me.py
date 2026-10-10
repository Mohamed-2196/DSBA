"""The signed-in user's account. Owner: accounts agent."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import Request, Response, status

from app.core.security import DB, CurrentSession, CurrentUser
from app.routers._base import router_for
from app.schemas.auth import (
    AccountExport,
    Me,
    MeUpdate,
    OtpChallengeOut,
    OtpStartRequest,
    OtpVerifyRequest,
    SessionInfo,
)

router = router_for("me")


@router.get("/me", response_model=Me)
def get_me(user: CurrentUser) -> Me:
    """The signed-in user (401 when signed out: the web app treats that as a guest)."""
    raise NotImplementedError


@router.patch("/me", response_model=Me)
def update_me(body: MeUpdate, user: CurrentUser, db: DB) -> Me:
    """Display name, cohort year and notification preferences."""
    raise NotImplementedError


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(response: Response, user: CurrentUser, db: DB) -> Response:
    """Delete the account: personal data goes, posts stay as 'deleted user', uploads stay unattributed."""
    raise NotImplementedError


@router.get("/me/export", response_model=AccountExport)
def export_me(user: CurrentUser, db: DB) -> AccountExport:
    """Everything the Hub stores about the signed-in user, as JSON."""
    raise NotImplementedError


@router.get("/me/sessions", response_model=list[SessionInfo])
def list_sessions(user: CurrentUser, sess: CurrentSession, db: DB) -> list[SessionInfo]:
    """Browsers signed in to this account."""
    raise NotImplementedError


@router.delete("/me/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_session(session_id: UUID, user: CurrentUser, db: DB) -> Response:
    """Sign out one browser (use /auth/logout for this one)."""
    raise NotImplementedError


@router.post("/me/identifiers/otp", response_model=OtpChallengeOut, status_code=status.HTTP_202_ACCEPTED)
def start_add_identifier(body: OtpStartRequest, request: Request, user: CurrentUser, db: DB) -> OtpChallengeOut:
    """Add the other kind of identifier (a phone number to an email account, or the reverse), or change it.

    Errors: identifier_taken (409) when another account already uses it."""
    raise NotImplementedError


@router.post("/me/identifiers/verify", response_model=Me)
def verify_add_identifier(body: OtpVerifyRequest, user: CurrentUser, db: DB) -> Me:
    raise NotImplementedError


@router.delete("/me/identifiers/{kind}", response_model=Me)
def remove_identifier(kind: Literal["email", "phone"], user: CurrentUser, db: DB) -> Me:
    """Remove the email or the phone number; the account must keep at least one (last_identifier, 409)."""
    raise NotImplementedError
