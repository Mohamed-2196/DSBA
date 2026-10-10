"""One-time codes: signing in, and adding an email address or phone number to an account.

The rules (ARCHITECTURE.md security baseline; docs/reviews/security-design.md findings 2, 3, 9, 15 and 20):

- A code is 6 digits from `secrets`. Only HMAC-SHA256(secret key, "<challenge id>:<code>") is stored.
- It expires after DSBA_OTP_TTL_SECONDS and works once. Each try is counted atomically BEFORE the comparison
  (and committed on its own), so parallel requests cannot get more than DSBA_OTP_MAX_ATTEMPTS tries.
- Only the newest code for an address works: a code that was sent retires the older ones, and a successful
  sign-in closes every other open code for that address.
- Limits, all from the database: a resend cooldown per address, codes per address per hour and per day, wrong
  codes per address per day, codes per IP (IPv6 by /64) per hour, codes per user per hour (adding an
  identifier), and a global hourly and daily budget of texts. Addresses are counted by their rate-limit key
  (name+tag@ and Gmail dots fold together). Advisory locks serialise count-then-insert.
- Texts only go to mobile numbers in the allowed regions.
- The answer never tells whether an account exists: starting a sign-in doesn't look at accounts, and adding an
  identifier that another account uses sends that address a notice instead of a code, with the same answer.

A challenge whose delivery failed is never usable (expires_at == created_at): it counts against the limits but
neither triggers the resend cooldown nor uses the text budget."""

from __future__ import annotations

import hashlib
import hmac
import logging
import math
import secrets
import uuid
from collections.abc import Callable, Sequence
from dataclasses import dataclass
from datetime import datetime, timedelta
from html import escape
from typing import cast
from urllib.parse import urlsplit

from sqlalchemy import ColumnElement, delete, select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.errors import ApiError, invalid, rate_limited
from app.core.time import utcnow
from app.models import Channel, OtpChallenge, OtpPurpose, User
from app.schemas.auth import OtpChallengeOut
from app.services import mailer, sms
from app.services.identifiers import (
    Kind,
    channel_for,
    destination_hint,
    email_rate_key_sql,
    kind_for,
    normalize_identifier,
    rate_key,
    sms_capable,
)
from app.services.mailer import DeliveryError
from app.services.ratelimit import human_wait, in_ip_bucket, ip_bucket, lock, window_wait

log = logging.getLogger("dsba.otp")

HOUR = timedelta(hours=1)
DAY = timedelta(days=1)
FAILED_CODES_PER_DAY = 15  # wrong codes for one address in 24 h before it is locked (finding 9)
KEEP_CHALLENGES = timedelta(days=2)  # older rows serve no limit any more and hold personal data: deleted

# Settings the security review asks the lead to add to config.py (finding 3). Until config.py defines them these
# values apply; once it does, the configured values win.
FALLBACK_SETTINGS: dict[str, object] = {
    "sms_allowed_regions": ["BH"],
    "sms_max_per_hour": 50,
    "sms_max_per_day": 300,
    "otp_max_per_identifier_per_day": 10,
}


def setting(name: str) -> object:
    return getattr(get_settings(), name, FALLBACK_SETTINGS[name])


def _int_setting(name: str) -> int:
    return int(cast(int, setting(name)))


def sms_regions() -> list[str]:
    value = setting("sms_allowed_regions")
    if isinstance(value, str):
        return [r.strip() for r in value.split(",") if r.strip()]
    return [str(r) for r in cast(Sequence[object], value)]


# ── codes ───────────────────────────────────────────────────────────────────────────────────


def new_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def code_hash(challenge_id: uuid.UUID, code: str) -> str:
    key = get_settings().secret_key.get_secret_value().encode()
    return hmac.new(key, f"{challenge_id}:{code}".encode(), hashlib.sha256).hexdigest()


def code_expired() -> ApiError:
    return ApiError(410, "code_expired", "This code has expired. Ask for a new one.")


def too_many_attempts() -> ApiError:
    return ApiError(429, "too_many_attempts", "Too many wrong tries for this code. Ask for a new one.")


# ── starting a challenge ─────────────────────────────────────────────────────────────────────


def prepare(raw: str) -> tuple[Kind, str]:
    """Normalises what the person typed (422 invalid_identifier) and refuses numbers we don't text (422
    sms_unavailable: landlines, toll-free and premium numbers, and countries outside the allowed regions)."""
    kind, identifier = normalize_identifier(raw)
    if kind == "phone" and not sms_capable(identifier, sms_regions()):
        raise invalid(
            "identifier",
            "We can't send a code to this number. Use your email address instead.",
            code="sms_unavailable",
        )
    return kind, identifier


def start(
    db: Session,
    *,
    kind: Kind,
    identifier: str,
    purpose: OtpPurpose,
    ip: str | None,
    user: User | None = None,
    taken: Callable[[], bool] | None = None,
) -> OtpChallengeOut:
    """Checks the limits, stores a challenge and sends its code. `user` is set when a signed-in user adds an
    identifier. When `taken()` says that another account uses the identifier, the address gets a notice instead
    of a code; everything else (the row, the limits, the answer) is the same."""
    s = get_settings()
    now = utcnow()
    channel = channel_for(kind)
    _check_limits(db, kind=kind, identifier=identifier, channel=channel, ip=ip, user=user, now=now)
    in_use = taken() if taken is not None else False
    db.execute(delete(OtpChallenge).where(OtpChallenge.created_at < now - KEEP_CHALLENGES))
    challenge, code = _add_challenge(db, purpose, channel, identifier, ip, user, now)
    db.commit()  # the row exists before the code can arrive
    try:
        if in_use:
            _deliver_in_use_notice(kind, identifier)
        else:
            _deliver(kind, identifier, code, purpose)
    except DeliveryError:
        challenge.expires_at = challenge.created_at  # never usable, and the next try needs no cooldown
        db.commit()
        other = "your phone number" if kind == "email" else "your email address"
        raise ApiError(503, "delivery_failed", f"We couldn't send the code. Try again, or use {other}.") from None
    db.execute(
        update(OtpChallenge)
        .where(
            OtpChallenge.identifier == identifier,
            OtpChallenge.id != challenge.id,
            OtpChallenge.consumed_at.is_(None),
            OtpChallenge.expires_at > now,
        )
        .values(expires_at=now)
    )
    db.commit()
    return OtpChallengeOut(
        challenge_id=challenge.id,
        channel=channel.value,
        destination_hint=destination_hint(kind, identifier),
        expires_in=s.otp_ttl_seconds,
        resend_after=s.otp_resend_seconds,
    )


def _add_challenge(
    db: Session,
    purpose: OtpPurpose,
    channel: Channel,
    identifier: str,
    ip: str | None,
    user: User | None,
    now: datetime,
) -> tuple[OtpChallenge, str]:
    cid = uuid.uuid4()
    code = new_code()
    challenge = OtpChallenge(
        id=cid,
        purpose=purpose,
        user_id=user.id if user is not None else None,
        channel=channel,
        identifier=identifier,
        code_hash=code_hash(cid, code),
        attempts=0,
        created_at=now,
        expires_at=now + timedelta(seconds=get_settings().otp_ttl_seconds),
        ip=ip,
    )
    db.add(challenge)
    return challenge, code


def same_address(kind: Kind, identifier: str) -> ColumnElement[bool]:
    """Challenges for this address, or for an address with the same rate-limit key."""
    if kind == "email":
        return email_rate_key_sql(OtpChallenge.identifier) == rate_key(kind, identifier)
    return OtpChallenge.identifier == identifier


def _check_limits(
    db: Session, *, kind: Kind, identifier: str, channel: Channel, ip: str | None, user: User | None, now: datetime
) -> None:
    s = get_settings()
    # Always in this order (address, IP, user, texts), so concurrent requests cannot deadlock.
    lock(db, f"otp:id:{rate_key(kind, identifier)}")
    lock(db, f"otp:ip:{ip_bucket(ip) or '-'}")
    if user is not None:
        lock(db, f"otp:user:{user.id}")
    if channel == Channel.sms:
        lock(db, "otp:sms")

    delivered = OtpChallenge.expires_at > OtpChallenge.created_at  # failed deliveries don't count here
    address = same_address(kind, identifier)
    created = OtpChallenge.created_at
    waits: list[tuple[int, str]] = []

    def check(where: Sequence[ColumnElement[bool]], limit: int, window: timedelta, message: str) -> None:
        wait = window_wait(db, created, where, limit=limit, window=window, now=now)
        if wait:
            waits.append((wait, message))

    check([address, delivered], 1, timedelta(seconds=s.otp_resend_seconds), "Wait {} before asking for another code.")
    too_many_here = "Too many codes were sent to this address. Try again in {}."
    check([address], s.otp_max_per_identifier_per_hour, HOUR, too_many_here)
    check([address], _int_setting("otp_max_per_identifier_per_day"), DAY, too_many_here)
    check(
        [in_ip_bucket(OtpChallenge.ip, ip)],
        s.otp_max_per_ip_per_hour,
        HOUR,
        "Too many codes were asked for from your network. Try again in {}.",
    )
    if user is not None:
        mine = [OtpChallenge.user_id == user.id, OtpChallenge.purpose == OtpPurpose.add_identifier]
        check(mine, s.otp_max_per_identifier_per_hour, HOUR, "You've asked for too many codes. Try again in {}.")
    wait = _failed_codes_wait(db, address, now)
    if wait:
        waits.append((wait, "Too many wrong codes were entered for this address. Try again in {}."))
    if waits:
        wait, message = max(waits)
        raise rate_limited(wait, message.format(human_wait(wait)))

    if channel == Channel.sms:
        texts = [OtpChallenge.channel == Channel.sms, delivered]
        for limit, window in ((_int_setting("sms_max_per_hour"), HOUR), (_int_setting("sms_max_per_day"), DAY)):
            if window_wait(db, created, texts, limit=limit, window=window, now=now):
                log.warning("SMS budget reached (%d per %s): codes by text are paused", limit, window)
                raise ApiError(429, "sms_unavailable", "We can't send texts right now. Use your email address instead.")


def _failed_codes_wait(db: Session, address: ColumnElement[bool], now: datetime) -> int:
    """Seconds this address stays locked after FAILED_CODES_PER_DAY wrong codes in 24 h (0 when it isn't).

    Tries on codes that were used to sign in don't count: a successful sign-in closes every open code."""
    rows = (
        db.execute(
            select(OtpChallenge.created_at, OtpChallenge.attempts)
            .where(
                address,
                OtpChallenge.consumed_at.is_(None),
                OtpChallenge.attempts > 0,
                OtpChallenge.created_at > now - DAY,
            )
            .order_by(OtpChallenge.created_at)
        )
        .tuples()
        .all()
    )
    total = sum(attempts for _, attempts in rows)
    if total < FAILED_CODES_PER_DAY:
        return 0
    for created_at, attempts in rows:  # oldest first: the address opens again once enough of them leave the window
        total -= attempts
        if total < FAILED_CODES_PER_DAY:
            return max(1, math.ceil((created_at + DAY - now).total_seconds()))
    return 0


# ── checking a code ─────────────────────────────────────────────────────────────────────────


@dataclass(frozen=True)
class Verified:
    kind: Kind
    identifier: str


def verify(
    db: Session, *, challenge_id: uuid.UUID, code: str, purpose: OtpPurpose, user_id: uuid.UUID | None = None
) -> Verified:
    """Checks a code. On success the challenge is consumed in the session (the caller commits with its change).

    Errors: invalid_code (422, attempts left in the message), code_expired (410: unknown, expired, used, retired,
    issued for another purpose or, when adding an identifier, for another user), too_many_attempts (429)."""
    s = get_settings()
    now = utcnow()
    conditions = [
        OtpChallenge.id == challenge_id,
        OtpChallenge.purpose == purpose,
        OtpChallenge.consumed_at.is_(None),
        OtpChallenge.expires_at > now,
        OtpChallenge.attempts < s.otp_max_attempts,
    ]
    if purpose == OtpPurpose.add_identifier:
        conditions.append(OtpChallenge.user_id == user_id)
    row = (
        db.execute(
            update(OtpChallenge)
            .where(*conditions)
            .values(attempts=OtpChallenge.attempts + 1)
            .returning(OtpChallenge.attempts, OtpChallenge.code_hash, OtpChallenge.identifier, OtpChallenge.channel)
        )
        .tuples()
        .one_or_none()
    )
    db.commit()  # the try counts even when what follows fails
    if row is None:
        raise _unusable(db, challenge_id, purpose, user_id, now)
    attempts, stored_hash, identifier, channel = row
    if not hmac.compare_digest(stored_hash, code_hash(challenge_id, code)):
        left = s.otp_max_attempts - attempts
        if left <= 0:
            raise too_many_attempts()
        raise invalid(
            "code", f"That code isn't right. {left} {'try' if left == 1 else 'tries'} left.", code="invalid_code"
        )
    used = db.execute(
        update(OtpChallenge)
        .where(OtpChallenge.id == challenge_id, OtpChallenge.consumed_at.is_(None))
        .values(consumed_at=now)
        .returning(OtpChallenge.id)
    ).one_or_none()
    if used is None:  # a parallel request with the same code got there first: one code, one session
        raise code_expired()
    db.execute(
        update(OtpChallenge)
        .where(OtpChallenge.identifier == identifier, OtpChallenge.consumed_at.is_(None))
        .values(consumed_at=now)
    )
    return Verified(kind=kind_for(Channel(channel)), identifier=identifier)


def _unusable(
    db: Session, challenge_id: uuid.UUID, purpose: OtpPurpose, user_id: uuid.UUID | None, now: datetime
) -> ApiError:
    found = (
        db.execute(
            select(
                OtpChallenge.purpose,
                OtpChallenge.user_id,
                OtpChallenge.consumed_at,
                OtpChallenge.expires_at,
                OtpChallenge.attempts,
            ).where(OtpChallenge.id == challenge_id)
        )
        .tuples()
        .one_or_none()
    )
    if found is None:
        return code_expired()
    found_purpose, owner, consumed_at, expires_at, attempts = found
    if found_purpose != purpose or (purpose == OtpPurpose.add_identifier and owner != user_id):
        return code_expired()
    if consumed_at is None and expires_at > now and attempts >= get_settings().otp_max_attempts:
        return too_many_attempts()
    return code_expired()


# ── messages ────────────────────────────────────────────────────────────────────────────────


def _minutes() -> str:
    n = max(1, round(get_settings().otp_ttl_seconds / 60))
    return f"{n} minute{'s' if n != 1 else ''}"


def email_content(code: str, purpose: OtpPurpose) -> tuple[str, str, str]:
    """-> (subject, text, html) of the email that carries a code."""
    s = get_settings()
    subject = f"Your DSBA Hub code: {code}"
    if purpose == OtpPurpose.sign_in:
        use = "Enter it on the sign-in page to continue."
        ignore = "If you didn't try to sign in, you can ignore this email."
    else:
        use = "Enter it to add this email address to your account."
        ignore = "If you didn't ask for this, you can ignore this email."
    expiry = f"It expires in {_minutes()}."
    text = f"Your DSBA Hub code is {code}.\n\n{use} {expiry}\n\n{ignore}\n\nDSBA Hub\n{s.web_base_url}\n"
    html = (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        f"<title>{escape(subject)}</title></head>"
        '<body style="margin:0;padding:24px;background:#f5f5f2;color:#1f2328;'
        "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif\">"
        '<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">'
        '<p style="margin:0 0 8px;font-size:15px">Your DSBA Hub code is</p>'
        '<p style="margin:0 0 20px;font-size:32px;font-weight:700;letter-spacing:6px;'
        f'font-family:ui-monospace,Menlo,Consolas,monospace">{escape(code)}</p>'
        f'<p style="margin:0 0 12px;font-size:15px;line-height:1.5">{escape(use)} {escape(expiry)}</p>'
        f'<p style="margin:0;font-size:13px;line-height:1.5;color:#59636e">{escape(ignore)}</p>'
        "</div>"
        '<p style="max-width:480px;margin:16px auto 0;font-size:12px;color:#59636e;text-align:center">'
        f"DSBA Hub &middot; {escape(s.web_base_url)}</p>"
        "</body></html>"
    )
    return subject, text, html


def sms_text(code: str) -> str:
    """The text that carries a code, ending with the WebOTP line browsers use to fill the code in."""
    text = f"Your DSBA Hub code is {code}. It expires in {_minutes()}."
    host = urlsplit(get_settings().web_base_url).hostname
    return f"{text}\n\n@{host} #{code}" if host else text


def _deliver(kind: Kind, identifier: str, code: str, purpose: OtpPurpose) -> None:
    if kind == "email":
        subject, text, html = email_content(code, purpose)
        mailer.send_email(identifier, subject, text, html)
    else:
        sms.send_sms(identifier, sms_text(code))


def _deliver_in_use_notice(kind: Kind, identifier: str) -> None:
    """Sent instead of a code when a signed-in user asks to add an address that another account uses."""
    if kind == "email":
        text = (
            "Someone signed in to DSBA Hub asked to add this email address to their account. Another DSBA Hub "
            "account already uses it, so nothing was changed.\n\n"
            "If that was you, sign in with this email address instead. If it wasn't you, you can ignore this "
            f"email.\n\nDSBA Hub\n{get_settings().web_base_url}\n"
        )
        mailer.send_email(identifier, "This email address already has a DSBA Hub account", text)
    else:
        sms.send_sms(
            identifier,
            "DSBA Hub: someone asked to add this number to their account, but another account already uses it, "
            "so nothing changed. If that was you, sign in with this number instead.",
        )


def send_notice(kind: Kind, to: str, text: str) -> None:
    """Best effort: tells an email address or phone number about a change to the account's sign-in details."""
    footer = "If this wasn't you, contact a student rep."
    try:
        if kind == "email":
            body = f"{text} {footer}\n\nDSBA Hub\n{get_settings().web_base_url}\n"
            mailer.send_email(to, "Your DSBA Hub account changed", body)
        elif sms_capable(to, sms_regions()):
            sms.send_sms(to, f"DSBA Hub: {text} {footer}")
    except DeliveryError:
        log.warning("an account notice to %s was not sent", destination_hint(kind, to))


def forget_identifiers(db: Session, identifiers: Sequence[str]) -> None:
    """Deletes the challenges of these addresses (account deletion: each row holds the address)."""
    if identifiers:
        db.execute(delete(OtpChallenge).where(OtpChallenge.identifier.in_(list(identifiers))))
