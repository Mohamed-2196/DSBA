"""Signing up and in with an email address and a password, or with Google; reset links; the session state. Owner:
accounts."""

from __future__ import annotations

import logging

from fastapi import Request, Response, status
from fastapi.responses import RedirectResponse

from app.config import get_settings
from app.core.security import DB, CurrentSession, OptionalUser, clear_session_cookie, client_ip
from app.models import GoogleIntent, User
from app.routers._base import router_for
from app.schemas.auth import (
    GoogleRedirect,
    GoogleStart,
    PasswordResetRequest,
    SessionState,
    SignInRequest,
    SignInResult,
    SignUpRequest,
)
from app.schemas.common import ErrorResponse
from app.services import accounts, google, sessions, signin
from app.services.google import GoogleFlowError

router = router_for("auth")
log = logging.getLogger("dsba.google")


@router.get("/auth/csrf", status_code=status.HTTP_204_NO_CONTENT)
def csrf() -> Response:
    """Sets the CSRF cookie (the middleware does it for any response without one). Call once at start-up."""
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/auth/session", response_model=SessionState)
def session_state(user: OptionalUser) -> SessionState:
    """Who is signed in: `{"me": Me}`, or `{"me": null}` for a guest, and whether "Continue with Google" is set up.
    Never 401, so a guest's page load logs no error (student test ST-10); GET /me still answers 401 when signed out."""
    return SessionState(
        me=accounts.me_out(user) if user is not None else None, google_sign_in=get_settings().google_enabled
    )


@router.post("/auth/sign-up", response_model=SignInResult, status_code=status.HTTP_201_CREATED)
def sign_up(body: SignUpRequest, request: Request, response: Response, sess: CurrentSession, db: DB) -> SignInResult:
    """A new account with an email address and a password (10 characters or more, not a common one); this browser is
    signed in to it (with a CSRF cookie bound to the new session: read it again before the next request). The address
    isn't checked by email.

    Errors: invalid_email, weak_password (422), email_taken (409), rate_limited (429: new accounts from this
    network)."""
    user = signin.sign_up(db, body, client_ip(request))
    sessions.renew(db, user, sess, request, response)
    db.commit()
    return SignInResult(user=accounts.me_out(user), is_new_user=True)


@router.post("/auth/sign-in", response_model=SignInResult)
def sign_in(body: SignInRequest, request: Request, response: Response, sess: CurrentSession, db: DB) -> SignInResult:
    """Sign in with an email address and a password. A wrong password and an address without an account (or without a
    password) answer the same: invalid_credentials (422). This browser's previous session ends; read the CSRF cookie
    again afterwards.

    Errors: invalid_email, invalid_credentials (422), rate_limited (429, with retryAfter)."""
    user = signin.sign_in(db, body, client_ip(request))
    sessions.renew(db, user, sess, request, response)
    db.commit()
    return SignInResult(user=accounts.me_out(user), is_new_user=False)


@router.post("/auth/google", response_model=GoogleRedirect)
def start_google(body: GoogleStart, request: Request, response: Response, db: DB) -> GoogleRedirect:
    """Start "Continue with Google": send the browser to `url`. Google brings it back to /auth/google/callback, which
    signs it in (creating the account, or taking over an unconfirmed one with the address) and returns to `returnTo`.

    Errors: not_found (404: not set up on this hub), rate_limited (429)."""
    url, state = google.start(
        db, intent=GoogleIntent.sign_in, user=None, return_to=body.return_to or "/", ip=client_ip(request)
    )
    db.commit()
    google.set_state_cookie(response, state)
    return GoogleRedirect(url=url)


@router.get(
    "/auth/google/callback",
    response_class=RedirectResponse,
    status_code=status.HTTP_303_SEE_OTHER,
    responses={303: {"description": "Back to the app: the page it started from, with ?authError=<code> on failure"}},
)
def google_callback(
    request: Request,
    sess: CurrentSession,
    db: DB,
    code: str | None = None,
    state: str | None = None,
    error: str | None = None,
) -> RedirectResponse:
    """Where Google sends the browser back (the OAuth client's redirect URI). Not for the web app to call."""
    return_to = "/"
    try:
        login = google.take_login(db, state, request.cookies.get(google.cookie_name()))
        return_to = login.return_to
        done = google.finish(db, login, code=code, error=error)
        resp = RedirectResponse(return_to, status_code=status.HTTP_303_SEE_OTHER)
        if done.intent == GoogleIntent.link:
            user = db.get(User, sess.user_id) if sess is not None else None
            if user is None or user.id != done.user_id:
                raise GoogleFlowError("google_failed", "this browser left the account linking Google")
            signin.link_google(db, user, sess, done.identity)
        else:
            user, _ = signin.google_sign_in(db, done.identity, client_ip(request))
            sessions.renew(db, user, sess, request, resp)
        db.commit()
    except GoogleFlowError as failure:
        db.rollback()
        log.info("Continue with Google didn't finish (%s): %s", failure.code, failure)
        resp = RedirectResponse(google.with_error(return_to, failure.code), status_code=status.HTTP_303_SEE_OTHER)
    google.clear_state_cookie(resp)
    return resp


@router.post("/auth/password-reset", response_model=SignInResult, responses={410: {"model": ErrorResponse}})
def reset_password(
    body: PasswordResetRequest, request: Request, response: Response, sess: CurrentSession, db: DB
) -> SignInResult:
    """Set a new password with a reset link an admin made. The link is used up, every session of the account ends,
    and this browser is signed in.

    Errors: reset_link_invalid (410), weak_password (422), rate_limited (429)."""
    user = signin.use_reset_link(db, body, client_ip(request))
    sessions.renew(db, user, sess, request, response)
    db.commit()
    return SignInResult(user=accounts.me_out(user), is_new_user=False)


@router.post("/auth/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(sess: CurrentSession, db: DB) -> Response:
    """End this browser's session (no error when not signed in). The CSRF cookie is replaced too."""
    if sess is not None:
        sessions.revoke(sess)
        db.commit()
    resp = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_session_cookie(resp)
    return resp
