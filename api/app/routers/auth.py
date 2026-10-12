"""Sign-in with a one-time code sent by email or SMS, and the session state. Owner: accounts."""

from __future__ import annotations

from fastapi import Request, Response, status

from app.core.security import DB, CurrentSession, OptionalUser, clear_session_cookie, client_ip
from app.routers._base import router_for
from app.schemas.auth import OtpChallengeOut, OtpStartRequest, OtpVerifyRequest, SessionState, SignInResult
from app.schemas.common import ErrorResponse
from app.services import accounts, otp, sessions

router = router_for("auth")


@router.get("/auth/csrf", status_code=status.HTTP_204_NO_CONTENT)
def csrf() -> Response:
    """Sets the CSRF cookie (the middleware does it for any response without one). Call once at start-up."""
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/auth/session", response_model=SessionState)
def session_state(user: OptionalUser) -> SessionState:
    """Who is signed in: `{"me": Me}`, or `{"me": null}` for a guest. Never 401, so a guest's page load logs no
    error (student test ST-10); GET /me still answers 401 when signed out."""
    return SessionState(me=accounts.me_out(user) if user is not None else None)


@router.post(
    "/auth/otp",
    response_model=OtpChallengeOut,
    status_code=status.HTTP_202_ACCEPTED,
    responses={503: {"model": ErrorResponse}},
)
def start_sign_in(body: OtpStartRequest, request: Request, db: DB) -> OtpChallengeOut:
    """Send a code to an email address or phone number. The same answer whether or not an account exists.

    The code is 6 digits; after many wrong codes for an address it is 10 letters and digits instead
    (`codeFormat: "long"`, written 'ABCDE-FGH23'), which nobody can guess.

    Errors: invalid_identifier (422), sms_unavailable (422: a number we don't text; 429: texts paused), rate_limited
    (429, with retryAfter), delivery_failed (503: try again or use the other method)."""
    kind, identifier = otp.prepare(body.identifier)
    return otp.start(db, kind=kind, identifier=identifier, flow="sign_in", ip=client_ip(request))


@router.post("/auth/otp/verify", response_model=SignInResult, responses={410: {"model": ErrorResponse}})
def verify_sign_in(
    body: OtpVerifyRequest, request: Request, response: Response, sess: CurrentSession, db: DB
) -> SignInResult:
    """Check the code; on success the account is created if needed and the session cookie is set (with a CSRF
    cookie bound to it: read it again before the next request).

    Errors: invalid_code (422, with attempts left in the message), code_expired (410), too_many_attempts (429)."""
    verified = otp.verify(db, challenge_id=body.challenge_id, code=body.code, flow="sign_in")
    user, created = accounts.user_for_sign_in(db, verified.kind, verified.identifier, client_ip(request))
    sessions.renew(db, user, sess, request, response)  # whatever session this browser had ends here
    db.commit()
    return SignInResult(user=accounts.me_out(user), is_new_user=created)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(sess: CurrentSession, db: DB) -> Response:
    """End this browser's session (no error when not signed in). The CSRF cookie is replaced too."""
    if sess is not None:
        sessions.revoke(sess)
        db.commit()
    resp = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_session_cookie(resp)
    return resp
