"""The signed-in user's account. Owner: accounts agent."""

from __future__ import annotations

from typing import Literal
from uuid import UUID

from fastapi import Request, Response, status
from sqlalchemy.exc import IntegrityError

from app.core.errors import ApiError, conflict, forbidden, invalid, not_found
from app.core.security import DB, CurrentSession, CurrentUser, clear_session_cookie, is_moderator
from app.models import OtpPurpose, UserSession, UserStatus
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
from app.schemas.common import ErrorResponse
from app.services import accounts, otp, sessions
from app.services.identifiers import Kind, destination_hint
from app.services.ratelimit import request_ip
from app.services.storage import get_storage

router = router_for("me")

LABELS: dict[Kind, str] = {"email": "email address", "phone": "phone number"}


@router.get("/me", response_model=Me)
def get_me(user: CurrentUser) -> Me:
    """The signed-in user (401 when signed out: the web app treats that as a guest)."""
    return accounts.me_out(user)


@router.patch("/me", response_model=Me)
def update_me(body: MeUpdate, user: CurrentUser, db: DB) -> Me:
    """Display name, cohort year and notification preferences. Only the fields sent change; `year: null` clears it.

    Errors: invalid_display_name (422), forbidden (403: a suspended account can't change its name)."""
    sent = body.model_fields_set
    if "display_name" in sent:
        if body.display_name is None:
            raise invalid("displayName", "Enter a display name.", code="invalid_display_name")
        name = accounts.clean_display_name(body.display_name, staff=is_moderator(user))
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


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT, responses={503: {"model": ErrorResponse}})
def delete_me(user: CurrentUser, db: DB) -> Response:
    """Delete the account: personal data goes, posts stay as 'deleted user', uploads stay unattributed.

    Errors: storage_unavailable (503: files could not be deleted, nothing changed; try again)."""
    accounts.delete_account(db, user, get_storage())
    resp = Response(status_code=status.HTTP_204_NO_CONTENT)
    clear_session_cookie(resp)
    return resp


@router.get("/me/export", response_model=AccountExport)
def export_me(user: CurrentUser, sess: CurrentSession, db: DB) -> AccountExport:
    """Everything the Hub stores about the signed-in user, as JSON."""
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


def _taken(kind: Kind) -> ApiError:
    return conflict("identifier_taken", f"Another account already uses this {LABELS[kind]}.")


@router.post(
    "/me/identifiers/otp",
    response_model=OtpChallengeOut,
    status_code=status.HTTP_202_ACCEPTED,
    responses={503: {"model": ErrorResponse}},
)
def start_add_identifier(body: OtpStartRequest, request: Request, user: CurrentUser, db: DB) -> OtpChallengeOut:
    """Add the other kind of identifier (a phone number to an email account, or the reverse), or change it.

    The answer is the same whether or not another account uses the identifier: if one does, the address gets a
    message saying so instead of a code (so nobody can test which addresses have accounts), and
    /me/identifiers/verify answers identifier_taken. Errors: identifier_unchanged (409) when it is already this
    account's, plus those of POST /auth/otp."""
    kind, identifier = otp.prepare(body.identifier)
    if (user.email if kind == "email" else user.phone) == identifier:
        raise conflict("identifier_unchanged", f"This {LABELS[kind]} is already on your account.")

    def taken() -> bool:
        other = accounts.find_user(db, kind, identifier)
        return other is not None and other.id != user.id

    return otp.start(
        db,
        kind=kind,
        identifier=identifier,
        purpose=OtpPurpose.add_identifier,
        ip=request_ip(request),
        user=user,
        taken=taken,
    )


@router.post("/me/identifiers/verify", response_model=Me, responses={410: {"model": ErrorResponse}})
def verify_add_identifier(body: OtpVerifyRequest, user: CurrentUser, sess: CurrentSession, db: DB) -> Me:
    """Check the code sent by POST /me/identifiers/otp and put the identifier on the account. The account's other
    sessions are signed out, and the identifier it replaces (or, for an addition, the other one) gets a notice.

    Errors: invalid_code (422), code_expired (410), too_many_attempts (429), identifier_taken (409)."""
    verified = otp.verify(
        db, challenge_id=body.challenge_id, code=body.code, purpose=OtpPurpose.add_identifier, user_id=user.id
    )
    kind, identifier = verified.kind, verified.identifier
    other = accounts.find_user(db, kind, identifier)
    if other is not None and other.id != user.id:
        raise _taken(kind)
    other_kind: Kind = "phone" if kind == "email" else "email"
    previous = user.email if kind == "email" else user.phone
    other_value = user.phone if kind == "email" else user.email
    if kind == "email":
        user.email = identifier
    else:
        user.phone = identifier
    try:
        with db.begin_nested():
            db.flush()
    except IntegrityError:  # taken a moment ago by a parallel request
        raise _taken(kind) from None
    sessions.revoke_others(db, user.id, keep=sess)
    db.commit()
    hint = destination_hint(kind, identifier)
    if previous is not None and previous != identifier:
        otp.send_notice(kind, previous, f"The {LABELS[kind]} on your DSBA Hub account was changed to {hint}.")
    elif previous is None and other_value is not None:
        article = "An" if kind == "email" else "A"
        otp.send_notice(
            other_kind, other_value, f"{article} {LABELS[kind]} ({hint}) was added to your DSBA Hub account."
        )
    return accounts.me_out(user)


@router.delete("/me/identifiers/{kind}", response_model=Me)
def remove_identifier(kind: Literal["email", "phone"], user: CurrentUser, sess: CurrentSession, db: DB) -> Me:
    """Remove the email or the phone number; the account must keep at least one (last_identifier, 409).
    The account's other sessions are signed out and the removed identifier gets a notice."""
    current, other = (user.email, user.phone) if kind == "email" else (user.phone, user.email)
    if current is None:
        return accounts.me_out(user)
    if other is None:
        raise conflict("last_identifier", "You need at least one way to sign in. Add the other one first.")
    if kind == "email":
        user.email = None
    else:
        user.phone = None
    sessions.revoke_others(db, user.id, keep=sess)
    db.commit()
    otp.send_notice(kind, current, f"This {LABELS[kind]} was removed from your DSBA Hub account.")
    return accounts.me_out(user)
