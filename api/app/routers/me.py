"""The signed-in user's account. Owner: accounts.

Adding a password to an account that signs in with Google, linking Google and deleting the account need a recent
confirmation (decision D2, security review SEC-9): a session less than sessions.STEP_UP_WINDOW old. Otherwise these
answer 403 `step_up_required`; the web app then confirms it's you (POST /me/step-up with the password, or Continue
with Google again) and repeats the request. Changing a password needs the current one instead."""

from __future__ import annotations

from typing import Any
from uuid import UUID

from fastapi import Request, Response, status

from app.core.errors import not_found
from app.core.security import DB, CurrentSession, CurrentUser, clear_session_cookie, client_ip
from app.models import GoogleIntent, UserSession
from app.routers._base import router_for
from app.schemas.auth import (
    AccountExport,
    GoogleRedirect,
    GoogleStart,
    Me,
    MeUpdate,
    PasswordChange,
    SessionInfo,
    StepUpRequest,
    StepUpResult,
)
from app.schemas.common import ErrorResponse
from app.services import accounts, google, sessions, signin
from app.services.storage import get_storage

router = router_for("me")

STEP_UP: dict[int | str, dict[str, Any]] = {
    403: {
        "model": ErrorResponse,
        "description": "step_up_required: confirm it's you first (POST /me/step-up, or Google)",
    }
}


@router.get("/me", response_model=Me)
def get_me(user: CurrentUser) -> Me:
    """The signed-in user (401 when signed out). GET /auth/session answers the same without a 401 for guests."""
    return accounts.me_out(user)


@router.patch("/me", response_model=Me)
def update_me(body: MeUpdate, user: CurrentUser, db: DB) -> Me:
    """Display name, cohort year, email switches, papers, zone and resits. Only the fields sent change; `year: null`
    clears it.

    Errors: invalid_display_name (422), forbidden (403: a suspended account can't change its name)."""
    accounts.update_profile(user, body)
    db.commit()
    return accounts.me_out(user)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT, responses={**STEP_UP, 503: {"model": ErrorResponse}})
def delete_me(user: CurrentUser, sess: CurrentSession, db: DB) -> Response:
    """Delete the account: personal data goes, posts stay as 'deleted user', published files stay unattributed.

    Errors: step_up_required (403), last_admin (409: the only active admin stays), storage_unavailable (503: files
    could not be deleted, nothing changed)."""
    sessions.require_step_up(sess)
    accounts.delete_account(db, user, get_storage())
    db.commit()
    resp = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_session_cookie(resp)
    return resp


@router.get("/me/export", response_model=AccountExport)
def export_me(user: CurrentUser, sess: CurrentSession, db: DB) -> AccountExport:
    """Everything the Hub stores about the signed-in user."""
    return accounts.export_account(db, user, sess)


@router.get("/me/sessions", response_model=list[SessionInfo])
def list_sessions(user: CurrentUser, sess: CurrentSession, db: DB) -> list[SessionInfo]:
    """Browsers signed in to this account, most recently used first."""
    return [sessions.info(s, sess) for s in sessions.live(db, user.id)]


@router.delete("/me/sessions/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def revoke_session(session_id: UUID, user: CurrentUser, sess: CurrentSession, db: DB) -> Response:
    """Sign out one browser (use /auth/logout for this one; if it is this one, its cookie is cleared too)."""
    target = db.get(UserSession, session_id)
    if target is None or target.user_id != user.id:
        raise not_found("This session doesn't exist.")
    sessions.revoke(target)
    db.commit()
    resp = Response(status_code=status.HTTP_204_NO_CONTENT)
    if sess is not None and sess.id == target.id:
        clear_session_cookie(resp)
    return resp


# ── signing in: confirm it's you, the password, Google ──────────────────────────────────────────


@router.post("/me/step-up", response_model=StepUpResult)
def step_up(
    body: StepUpRequest, request: Request, response: Response, user: CurrentUser, sess: CurrentSession, db: DB
) -> StepUpResult:
    """Confirm it's you with your password. This browser gets a new session (and a new CSRF cookie: read it again),
    with which the changes that need a recent confirmation work for `expiresIn` seconds. An account without a password
    confirms by continuing with Google again (POST /auth/google), which signs this browser in afresh.

    Errors: wrong_password (422), rate_limited (429), forbidden (403: the account has no password)."""
    signin.confirm_password(db, user, body.password, client_ip(request))
    renewed = sessions.renew(db, user, sess, request, response)
    db.commit()
    return StepUpResult(expires_in=sessions.step_up_left(renewed))


@router.put("/me/password", response_model=Me, responses=STEP_UP)
def set_password(body: PasswordChange, request: Request, user: CurrentUser, sess: CurrentSession, db: DB) -> Me:
    """Change your password (with `currentPassword`), or add one to an account that signs in with Google (within ten
    minutes of signing in, else step_up_required). Every other browser signed in to the account is signed out.

    Errors: wrong_password (422 on currentPassword), weak_password (422 on newPassword), step_up_required (403),
    rate_limited (429)."""
    signin.set_password(db, user, sess, body, client_ip(request))
    db.commit()
    return accounts.me_out(user)


@router.post("/me/google", response_model=GoogleRedirect, responses=STEP_UP)
def link_google(
    body: GoogleStart, request: Request, response: Response, user: CurrentUser, sess: CurrentSession, db: DB
) -> GoogleRedirect:
    """Add "Continue with Google" to your account: send the browser to `url`. When Google brings it back, the account
    signs in with Google from now on and its email address becomes the Google account's, confirmed; other browsers are
    signed out. It comes back to `returnTo` (with ?authError=google_taken or email_taken when another account has that
    Google account or its address).

    Errors: step_up_required (403), not_found (404: Google isn't set up on this hub), rate_limited (429)."""
    sessions.require_step_up(sess)
    url, state = google.start(
        db, intent=GoogleIntent.link, user=user, return_to=body.return_to or "/account", ip=client_ip(request)
    )
    db.commit()
    google.set_state_cookie(response, state)
    return GoogleRedirect(url=url)
