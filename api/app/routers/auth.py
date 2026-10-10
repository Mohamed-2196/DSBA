"""Sign-in with a one-time code sent by email or SMS. Owner: accounts agent."""

from __future__ import annotations

from fastapi import Request, Response, status

from app.core.security import DB, CurrentSession
from app.routers._base import router_for
from app.schemas.auth import OtpChallengeOut, OtpStartRequest, OtpVerifyRequest, SignInResult

router = router_for("auth")


@router.get("/auth/csrf", status_code=status.HTTP_204_NO_CONTENT)
def csrf() -> Response:
    """Sets the dsba_csrf cookie (the middleware does it for any response without one). Call once at start-up."""
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/auth/otp", response_model=OtpChallengeOut, status_code=status.HTTP_202_ACCEPTED)
def start_sign_in(body: OtpStartRequest, request: Request, db: DB) -> OtpChallengeOut:
    """Send a 6-digit code to an email address or phone number. The same answer whether or not an account exists.

    Errors: invalid_identifier (422), rate_limited (429, with retryAfter)."""
    raise NotImplementedError


@router.post("/auth/otp/verify", response_model=SignInResult)
def verify_sign_in(body: OtpVerifyRequest, request: Request, response: Response, db: DB) -> SignInResult:
    """Check the code; on success the account is created if needed and the session cookie is set.

    Errors: invalid_code (422, with attempts left in the message), code_expired (410), too_many_attempts (429)."""
    raise NotImplementedError


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(response: Response, sess: CurrentSession, db: DB) -> Response:
    """End this browser's session (no error when not signed in)."""
    raise NotImplementedError
