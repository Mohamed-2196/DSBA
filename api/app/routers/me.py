"""The signed-in user's account. Owner: accounts.

Changing how one signs in (adding, changing or removing an email address or phone number) and deleting the account
need a recent confirmation (decision D2, security review SEC-9): a session less than sessions.STEP_UP_WINDOW old.
Otherwise these answer 403 `step_up_required`; the web app then runs POST /me/step-up and /me/step-up/verify (a
code to an identifier the account already has) and repeats the request."""

from __future__ import annotations

from typing import Any, Literal
from uuid import UUID

from fastapi import Request, Response, status
from sqlalchemy.exc import IntegrityError

from app.core.errors import ApiError, conflict, forbidden, invalid, not_found
from app.core.security import DB, CurrentSession, CurrentUser, clear_session_cookie, client_ip
from app.models import UserSession, UserStatus
from app.routers._base import router_for
from app.schemas.auth import (
    AccountExport,
    Me,
    MeUpdate,
    OtpChallengeOut,
    OtpStartRequest,
    OtpVerifyRequest,
    SessionInfo,
    StepUpResult,
    StepUpStart,
)
from app.schemas.common import ErrorResponse
from app.services import access, accounts, otp, sessions
from app.services.identifiers import Kind
from app.services.storage import get_storage

router = router_for("me")

STEP_UP: dict[int | str, dict[str, Any]] = {
    403: {"model": ErrorResponse, "description": "step_up_required: confirm it's you first (POST /me/step-up)"}
}


@router.get("/me", response_model=Me)
def get_me(user: CurrentUser) -> Me:
    """The signed-in user (401 when signed out). GET /auth/session answers the same without a 401 for guests."""
    return accounts.me_out(user)


@router.patch("/me", response_model=Me)
def update_me(body: MeUpdate, user: CurrentUser, db: DB) -> Me:
    """Display name, cohort year and email switches. Only the fields sent change; `year: null` clears it.

    Errors: invalid_display_name (422), forbidden (403: a suspended account can't change its name)."""
    sent = body.model_fields_set
    if "display_name" in sent:
        if body.display_name is None:
            raise invalid("displayName", "Enter a display name.", code="invalid_display_name")
        name = accounts.clean_display_name(body.display_name, staff=access.access_of(user).badge is not None)
        if name != user.display_name:
            if user.status == UserStatus.suspended:
                raise forbidden("Your account is suspended, so your name can't change. Contact a student rep.")
            user.display_name = name
    if "year" in sent:
        user.year = body.year
    if "preferences" in sent and body.preferences is not None:
        accounts.update_preferences(user, body.preferences)
    db.commit()
    return accounts.me_out(user)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT, responses={**STEP_UP, 503: {"model": ErrorResponse}})
def delete_me(user: CurrentUser, sess: CurrentSession, db: DB) -> Response:
    """Delete the account: personal data goes, posts stay as 'deleted user', published files stay unattributed.

    Errors: step_up_required (403), storage_unavailable (503: files could not be deleted, nothing changed)."""
    sessions.require_step_up(sess)
    accounts.delete_account(db, user, get_storage())
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


# ── step-up: confirm it's you ────────────────────────────────────────────────────────────────


@router.post(
    "/me/step-up",
    response_model=OtpChallengeOut,
    status_code=status.HTTP_202_ACCEPTED,
    responses={503: {"model": ErrorResponse}},
)
def start_step_up(body: StepUpStart, request: Request, user: CurrentUser, db: DB) -> OtpChallengeOut:
    """Send a code to one of the account's own identifiers: `via` "email" or "phone" (by default the email
    address, else the phone number). Check it with POST /me/step-up/verify.

    Errors: invalid_input (422: the account has no such identifier), sms_unavailable, rate_limited,
    delivery_failed, as for POST /auth/otp."""
    kind, identifier = accounts.step_up_target(user, body.via)
    otp.check_textable(kind, identifier)
    return otp.start(db, kind=kind, identifier=identifier, flow="step_up", ip=client_ip(request), user=user)


@router.post("/me/step-up/verify", response_model=StepUpResult, responses={410: {"model": ErrorResponse}})
def verify_step_up(
    body: OtpVerifyRequest, request: Request, response: Response, user: CurrentUser, sess: CurrentSession, db: DB
) -> StepUpResult:
    """Check the code sent by POST /me/step-up. On success this browser gets a new session (and a new CSRF cookie:
    read it again), with which changing identifiers and deleting the account work for `expiresIn` seconds.

    Errors: invalid_code (422), code_expired (410), too_many_attempts (429)."""
    otp.verify(db, challenge_id=body.challenge_id, code=body.code, flow="step_up", user_id=user.id)
    renewed = sessions.renew(db, user, sess, request, response)
    db.commit()
    return StepUpResult(expires_in=sessions.step_up_left(renewed))


# ── identifiers ─────────────────────────────────────────────────────────────────────────────


def _taken(kind: Kind) -> ApiError:
    return conflict("identifier_taken", f"Another account already uses this {accounts.LABELS[kind]}.")


@router.post(
    "/me/identifiers/otp",
    response_model=OtpChallengeOut,
    status_code=status.HTTP_202_ACCEPTED,
    responses={**STEP_UP, 503: {"model": ErrorResponse}},
)
def start_add_identifier(
    body: OtpStartRequest, request: Request, user: CurrentUser, sess: CurrentSession, db: DB
) -> OtpChallengeOut:
    """Add the other kind of identifier (a phone number to an email account, or the reverse), or change one: a code
    goes to the new address.

    The answer is the same whether or not another account uses the identifier: if one does, the address gets a
    message saying so instead of a code (so nobody can test which addresses have accounts), and
    /me/identifiers/verify answers identifier_taken. Errors: identifier_unchanged (409) when it is already this
    account's, step_up_required (403), plus those of POST /auth/otp."""
    kind, identifier = otp.prepare(body.identifier)
    if (user.email if kind == "email" else user.phone) == identifier:
        raise conflict("identifier_unchanged", f"This {accounts.LABELS[kind]} is already on your account.")
    sessions.require_step_up(sess)

    def taken() -> bool:
        other = accounts.find_user(db, kind, identifier)
        return other is not None and other.id != user.id

    return otp.start(
        db, kind=kind, identifier=identifier, flow="add_identifier", ip=client_ip(request), user=user, taken=taken
    )


@router.post("/me/identifiers/verify", response_model=Me, responses={410: {"model": ErrorResponse}})
def verify_add_identifier(body: OtpVerifyRequest, user: CurrentUser, sess: CurrentSession, db: DB) -> Me:
    """Check the code sent by POST /me/identifiers/otp and put the identifier on the account. The account's other
    sessions are signed out, and the identifier it replaces (or, for an addition, the other one) gets a notice.

    Errors: invalid_code (422), code_expired (410), too_many_attempts (429), identifier_taken (409)."""
    verified = otp.verify(db, challenge_id=body.challenge_id, code=body.code, flow="add_identifier", user_id=user.id)
    kind, identifier = verified.kind, verified.identifier
    other = accounts.find_user(db, kind, identifier)
    if other is not None and other.id != user.id:
        raise _taken(kind)
    change = accounts.set_identifier(user, kind, identifier)
    try:
        with db.begin_nested():
            db.flush()
    except IntegrityError:  # taken a moment ago by a parallel request
        raise _taken(kind) from None
    sessions.revoke_others(db, user.id, keep=sess)
    text_notice = accounts.queue_identifier_notice(db, user, change)
    db.commit()
    if text_notice is not None:
        otp.send_text_notice(*text_notice)
    return accounts.me_out(user)


@router.delete("/me/identifiers/{kind}", response_model=Me, responses=STEP_UP)
def remove_identifier(kind: Literal["email", "phone"], user: CurrentUser, sess: CurrentSession, db: DB) -> Me:
    """Remove the email address or the phone number; the account must keep at least one (last_identifier, 409).
    The account's other sessions are signed out and the removed identifier gets a notice.

    Errors: step_up_required (403), last_identifier (409)."""
    current, other = (user.email, user.phone) if kind == "email" else (user.phone, user.email)
    if current is None:
        return accounts.me_out(user)
    if other is None:
        raise conflict("last_identifier", "You need at least one way to sign in. Add the other one first.")
    sessions.require_step_up(sess)
    change = accounts.set_identifier(user, kind, None)
    sessions.revoke_others(db, user.id, keep=sess)
    text_notice = accounts.queue_identifier_notice(db, user, change)
    db.commit()
    if text_notice is not None:
        otp.send_text_notice(*text_notice)
    return accounts.me_out(user)
