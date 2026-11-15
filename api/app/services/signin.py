"""Signing up and in: with an email address and a password, or with Google; adding a password or Google to an account;
confirming it's you; and the one-time reset links admins make for a forgotten password.

Trust: an address typed at sign-up is never checked by email, so an account's email counts as confirmed
(`users.email_confirmed_at`) only once Google vouches for it. Only confirmed accounts hold staff roles
(roles.set_user_roles), DSBA_ADMIN_IDENTIFIERS gives Admin only on a Google sign-in, and when someone signs in with
Google for an address that Google owns and an unconfirmed account uses, the Google account's owner takes it over:
confirmed, the old password cleared, every session ended, and the takeover in the activity log.

A takeover, a reset link and a password change also end the account's access that needs no session (SEC-66): the
private calendar and widget links stop working and AI apps are disconnected. Linking Google disconnects AI apps."""

from __future__ import annotations

import uuid
from datetime import timedelta

from sqlalchemy import delete, select, update
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.access import ADMIN, STUDENT
from app.core.errors import ApiError, conflict, forbidden, invalid
from app.core.security import hash_token, new_token
from app.core.time import utcnow
from app.models import AiAppConnection, AttemptKind, CalendarPrefs, PasswordReset, User, UserSession
from app.schemas.auth import PasswordChange, PasswordResetRequest, ResetLinkOut, SignInRequest, SignUpRequest
from app.services import access, outbox, passwords, sessions
from app.services.audit import record
from app.services.google import GoogleFlowError, GoogleIdentity
from app.services.identifiers import admin_identifiers, destination_hint, normalize_email
from app.services.notify import notify

RESET_TTL = timedelta(hours=1)
NOTICE_SUBJECT = "Your DSBA Hub account changed"
SIGNED_OUT = (
    "Your other devices were signed out, and your calendar link, widget link and AI apps disconnected. You can make "
    "new links and connect apps again at any time."
)


def find_user(db: Session, email: str) -> User | None:
    return db.scalar(select(User).where(User.email == email))


def _email_taken() -> ApiError:
    return conflict("email_taken", "An account already uses this email address. Sign in instead.")


def _create(db: Session, email: str, *, password_hash: str | None = None, google_sub: str | None = None) -> User | None:
    """A new account holding Student, or None when another request created one for `email` a moment ago."""
    now = utcnow()
    user = User(
        id=uuid.uuid4(),
        email=email,
        password_hash=password_hash,
        google_sub=google_sub,
        email_confirmed_at=now if google_sub is not None else None,
        preferences={},
        created_at=now,
    )
    try:
        with db.begin_nested():
            db.add(user)
    except IntegrityError:
        return None
    access.give(db, user, STUDENT)
    return user


def queue_notice(db: Session, user: User, text: str) -> None:
    """A security notice by email (always sent, no switch), only to an address Google confirmed: an address typed at
    sign-up may be someone else's. The caller commits."""
    if user.email_confirmed_at is None:
        return
    base = get_settings().web_base_url.rstrip("/")
    body = (
        f"{text} If this wasn't you, sign in to DSBA Hub and check Your account: {base}/account\n\nDSBA Hub\n{base}\n"
    )
    outbox.queue(db, to=user.email, subject=NOTICE_SUBJECT, body=body, kind=outbox.ACCOUNT_NOTICE, user_id=user.id)


def _end_ai_apps(db: Session, user: User) -> None:
    """Disconnects the account's AI apps; their codes and tokens go with them, so each app is signed out at once."""
    db.execute(delete(AiAppConnection).where(AiAppConnection.user_id == user.id))


def end_other_access(db: Session, user: User) -> None:
    """Ends the account's access that needs no session (SEC-66): the private calendar and widget links stop working
    (the student can make new ones) and AI apps are disconnected. Sessions are the caller's. The caller commits.

    It takes the account's lock first, the one sessions.hold_live takes before making a link or connecting an app: a
    request already making one finishes before this clears it, and one that comes later finds its session ended."""
    sessions.lock_account(db, user.id)
    _end_ai_apps(db, user)
    db.execute(
        update(CalendarPrefs)
        .where(CalendarPrefs.user_id == user.id)
        .values(feed_salt=None, feed_hash=None, widget_salt=None, widget_hash=None, updated_at=utcnow())
    )


# ── with a password ─────────────────────────────────────────────────────────────────────────


def sign_up(db: Session, body: SignUpRequest, ip: str | None) -> User:
    """A new account with a password. The caller renews the session and commits. Errors: invalid_email,
    weak_password (422), email_taken (409), rate_limited (429: sign-ups from this network, each try counted)."""
    email = normalize_email(body.email)
    passwords.check_new(body.password, email)
    passwords.check_sign_up(db, ip)
    passwords.record(db, AttemptKind.sign_up, email, ip)
    user = (
        None
        if find_user(db, email) is not None
        else _create(db, email, password_hash=passwords.hash_password(body.password))
    )
    if user is None:
        db.commit()  # the try counts
        raise _email_taken()
    user.last_seen_at = utcnow()
    return user


def sign_in(db: Session, body: SignInRequest, ip: str | None) -> User:
    """The account for this email address and password. An unknown address, an account without a password and a
    wrong password answer the same, after the same work. Errors: invalid_email, invalid_credentials (422),
    rate_limited (429)."""
    email = normalize_email(body.email)
    passwords.check_sign_in(db, email, ip)
    user = find_user(db, email)
    right = passwords.matches(user.password_hash if user is not None else None, body.password)  # the work, always
    if user is None or not right:
        passwords.record(db, AttemptKind.sign_in_failed, email, ip)
        db.commit()  # the failure counts, whatever happens next
        message = "This email address and password don't match. Try again, or continue with Google."
        raise ApiError(422, "invalid_credentials", message)
    passwords.record(db, AttemptKind.sign_in, email, ip)
    user.last_seen_at = utcnow()
    return user


def confirm_password(db: Session, user: User, password: str, ip: str | None, field: str = "password") -> None:
    """Checks the signed-in account's own password (confirming it's you, changing it), under the same limits as
    signing in. Errors: wrong_password (422 on `field`), rate_limited (429), forbidden (403: no password)."""
    if user.password_hash is None:
        raise forbidden("Your account has no password. Continue with Google to confirm it's you.")
    passwords.check_sign_in(db, user.email, ip)
    if not passwords.matches(user.password_hash, password):
        passwords.record(db, AttemptKind.sign_in_failed, user.email, ip)
        db.commit()
        raise invalid(field, "That isn't your current password. Try again.", code="wrong_password")


def set_password(db: Session, user: User, sess: UserSession | None, body: PasswordChange, ip: str | None) -> None:
    """Adds or changes the account's password, then signs out its other sessions and sends a notice. Changing one
    needs the current password; adding one (an account that signs in with Google) needs a recent sign-in. The caller
    commits. Errors: step_up_required (403), wrong_password, weak_password (422), rate_limited (429)."""
    if user.password_hash is not None:
        if body.current_password is None:
            raise invalid("currentPassword", "Enter your current password.", code="wrong_password")
        confirm_password(db, user, body.current_password, ip, field="currentPassword")
    else:
        sessions.require_step_up(sess)
    passwords.check_new(body.new_password, user.email, field="newPassword")
    added = user.password_hash is None
    user.password_hash = passwords.hash_password(body.new_password)
    sessions.revoke_others(db, user.id, keep=sess)
    end_other_access(db, user)
    what = "A password was added to your DSBA Hub account." if added else "Your DSBA Hub password changed."
    queue_notice(db, user, f"{what} {SIGNED_OUT}")


# ── with Google ─────────────────────────────────────────────────────────────────────────────


def _bootstraps_admin(db: Session, user: User) -> bool:
    """DSBA_ADMIN_IDENTIFIERS gives Admin to a listed, confirmed account only while the hub has no active admin at
    all: it starts the hub, and never gives Admin back to someone it was taken from (SEC-54)."""
    if user.email_confirmed_at is None or user.email not in admin_identifiers() or access.access_of(user, db).admin:
        return False
    return not access.has_active_admin(db)


def _take_over(db: Session, user: User, identity: GoogleIdentity, ip: str | None) -> None:
    """The Google account's owner takes over an unconfirmed account with their address: whoever typed it at sign-up
    loses it (the password goes, every session ends with its other access, open reset links stop working)."""
    sessions.lock_account(db, user.id)  # before its reset links, as everywhere (sessions.lock_account)
    had_password = user.password_hash is not None
    user.password_hash = None
    user.google_sub = identity.sub
    user.email_confirmed_at = utcnow()
    for live in sessions.live(db, user.id):
        sessions.revoke(live)
    end_other_access(db, user)
    db.execute(
        update(PasswordReset)
        .where(PasswordReset.user_id == user.id, PasswordReset.used_at.is_(None))
        .values(used_at=utcnow())
    )
    change = {
        "via": "google",
        "hadPassword": had_password,
        "targetName": user.display_name or destination_hint(user.email),
    }
    record(db, None, "user.takeover", "user", user.id, change, ip)


def google_sign_in(db: Session, identity: GoogleIdentity, ip: str | None) -> tuple[User, bool]:
    """The account Google vouches for, created when there is none. -> (user, created). The caller renews the session
    and commits. Raises GoogleFlowError email_taken when a confirmed account has the address under another Google
    account."""
    now = utcnow()
    created = False
    user = db.scalar(select(User).where(User.google_sub == identity.sub))
    if user is None:
        user = find_user(db, identity.email)
        if user is None:
            user = _create(db, identity.email, google_sub=identity.sub)
            if user is None:  # created a moment ago by a parallel sign-in
                user = find_user(db, identity.email)
                if user is None or user.google_sub != identity.sub:
                    raise GoogleFlowError("google_failed", "a parallel sign-in made the account")
            else:
                created = True
        elif user.email_confirmed_at is not None and user.google_sub not in (None, identity.sub):
            raise GoogleFlowError("email_taken", "another Google account confirmed this address")
        elif user.email_confirmed_at is None:
            if not identity.google_owns_address:  # SEC-68: only Google's word on its own addresses counts
                raise GoogleFlowError("email_taken", "an unconfirmed account has an address Google doesn't own")
            _take_over(db, user, identity, ip)
        else:
            user.google_sub = identity.sub
    elif user.email != identity.email and find_user(db, identity.email) is None:
        user.email = identity.email  # the Google account's address changed: follow it
    if user.email_confirmed_at is None:
        user.email_confirmed_at = now
    if _bootstraps_admin(db, user):
        name = user.display_name or destination_hint(user.email)  # a new account has no name yet (UX-15)
        before = access.role_names(user)
        access.give(db, user, ADMIN)
        change = {"from": before, "to": access.role_names(user), "via": "bootstrap", "targetName": name}
        record(db, None, "user.roles", "user", user.id, change, ip)
    user.last_seen_at = now
    return user, created


def link_google(db: Session, user: User, sess: UserSession | None, identity: GoogleIdentity) -> None:
    """Adds Google to the signed-in account: it signs in with Google from now on, and its email address becomes the
    Google account's, confirmed. Other sessions are signed out and AI apps disconnected. The caller commits. Raises
    GoogleFlowError: google_taken (the Google account signs in to another account), email_taken (another account uses
    its address)."""
    other = db.scalar(select(User).where(User.google_sub == identity.sub))
    if other is not None and other.id != user.id:
        raise GoogleFlowError("google_taken")
    owner = find_user(db, identity.email)
    if owner is not None and owner.id != user.id:
        raise GoogleFlowError("email_taken")
    user.email = identity.email
    user.google_sub = identity.sub
    user.email_confirmed_at = utcnow()
    try:
        with db.begin_nested():
            db.flush()
    except IntegrityError:  # taken a moment ago by a parallel request
        raise GoogleFlowError("email_taken") from None
    sessions.revoke_others(db, user.id, keep=sess)
    sessions.lock_account(db, user.id)  # as end_other_access: an app being connected finishes first
    _end_ai_apps(db, user)
    queue_notice(
        db,
        user,
        "Google sign-in was added to your DSBA Hub account. Your other devices were signed out and your AI apps were "
        "disconnected. You can connect apps again at any time.",
    )


# ── reset links ─────────────────────────────────────────────────────────────────────────────


def issue_reset_link(db: Session, admin: User, target: User, ip: str | None) -> ResetLinkOut:
    """A one-time link for `target` to set a new password, for the admin to pass on. Retires the account's older
    links; audited, and the person is told. The caller commits. Errors: cannot_change_self (409), forbidden (403: an
    account holding Admin)."""
    if target.id == admin.id:
        raise conflict("cannot_change_self", "You can't make a reset link for yourself. Use Your account.")
    if access.access_of(target, db).admin:
        raise forbidden("An admin's password can't be reset here. They continue with Google.")
    now = utcnow()
    sessions.lock_account(db, target.id)  # before its reset links, as everywhere (sessions.lock_account)
    db.execute(
        update(PasswordReset)
        .where(PasswordReset.user_id == target.id, PasswordReset.used_at.is_(None))
        .values(used_at=now)
    )
    token = new_token()
    expires_at = now + RESET_TTL
    db.add(
        PasswordReset(
            user_id=target.id, token_hash=hash_token(token), created_by=admin.id, created_at=now, expires_at=expires_at
        )
    )
    record(db, admin, "user.reset_link", "user", target.id, {"expiresAt": expires_at.isoformat()}, ip)
    notify(
        db,
        target.id,
        "system",
        "An admin made a link to reset your password",
        body="If you didn't ask for it, tell a student rep.",
        actor=admin,
    )
    url = f"{get_settings().web_base_url.rstrip('/')}/reset-password#token={token}"
    return ResetLinkOut(url=url, expires_at=expires_at)


def use_reset_link(db: Session, body: PasswordResetRequest, ip: str | None) -> User:
    """Sets the new password through a reset link: the link is used up, every session of the account ends with its
    other access (end_other_access), and it's audited. The caller signs this browser in and commits. Errors:
    reset_link_invalid (410), weak_password (422), rate_limited (429: many links that didn't work from this network)."""
    passwords.check_reset(db, ip)
    now = utcnow()
    open_link = (PasswordReset.token_hash == hash_token(body.token), PasswordReset.used_at.is_(None))
    # The account's lock comes before its reset links (sessions.lock_account), so: find whose link it is, lock the
    # account, then lock the link and read it again (a takeover or a newer link may have retired it meanwhile).
    owner = db.scalar(select(PasswordReset.user_id).where(*open_link))
    if owner is not None:
        sessions.lock_account(db, owner)
    link = db.scalar(select(PasswordReset).where(*open_link).with_for_update())
    user = db.get(User, link.user_id) if link is not None else None
    if link is None or user is None or link.expires_at <= now or access.access_of(user, db).admin:
        passwords.record(db, AttemptKind.reset_failed, None, ip)
        db.commit()
        raise ApiError(
            410, "reset_link_invalid", "This link has expired or was already used. Ask an admin for a new one."
        )
    passwords.check_new(body.new_password, user.email, field="newPassword")
    link.used_at = now
    user.password_hash = passwords.hash_password(body.new_password)
    for live in sessions.live(db, user.id):
        sessions.revoke(live)
    end_other_access(db, user)
    record(db, user, "user.password_reset", "user", user.id, {"via": "reset link"}, ip)
    queue_notice(db, user, f"Your DSBA Hub password was reset with a link from an admin. {SIGNED_OUT}")
    user.last_seen_at = now
    return user
