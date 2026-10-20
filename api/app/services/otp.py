"""One-time codes: signing in, confirming it's you (step-up), and adding an email address or phone number.

The rules (ARCHITECTURE.md security baseline; docs/reviews/security-design.md findings 2, 3, 9, 15 and 20;
docs/reviews/security.md SEC-2; decisions D2 and D4):

- A code is 6 digits from `secrets`. Only HMAC-SHA256(secret key, "<challenge id>:<code>") is stored.
- It expires after DSBA_OTP_TTL_SECONDS and works once. Each try is counted atomically BEFORE the comparison (and
  committed on its own), so parallel requests cannot get more than DSBA_OTP_MAX_ATTEMPTS tries.
- A code works only in the flow it was sent for (Flow): signing in (bound to no account), step-up (a sign-in code
  bound to the signed-in account) or adding an identifier (bound to the account).
- Only the newest code for an address works: a code that was sent retires the older ones, and a successful
  check closes every other open code for that address.
- Wrong codes never lock an address out for its owner (D4). FAILED_CODES_PER_DAY wrong codes for an address from
  one network (an IP address, or an IPv6 /64) in 24 h lock that network out of codes for that address. Once
  LONG_CODES_AFTER wrong codes were tried for an address from anywhere, its codes are long (10 letters and digits,
  about 50 bits): guessing is hopeless, and the owner still signs in.
- Every other limit only slows down: a resend cooldown and codes per hour for an address; codes per day for an
  address from one network; codes per network per hour; codes per user per hour (step-up, adding an identifier);
  and a global hourly and daily budget of texts. Addresses are counted by their rate-limit key (name+tag@ and Gmail
  dots fold together). Advisory locks serialise count-then-insert.
- Alarms (log warnings): a network locked out of an address, an address switching to long codes, and
  SPRAY_ALARM wrong codes across the site within an hour.
- Texts only go to mobile numbers in the allowed regions.
- The answer never tells whether an account exists: starting a sign-in doesn't look at accounts, and adding an
  identifier that another account uses sends that address a notice instead of a code, with the same answer.
- A challenge whose delivery failed is never usable (expires_at == created_at): it counts against the limits but
  neither triggers the resend cooldown nor uses the text budget.
- When an account is deleted its challenges stay, anonymised (anonymise()): the limits keep counting them, so
  deleting the account and signing up again refills nothing."""

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
from typing import Literal
from urllib.parse import urlsplit

from sqlalchemy import ColumnElement, and_, delete, func, or_, select, update
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.errors import ApiError, invalid, rate_limited
from app.core.time import utcnow
from app.models import Channel, OtpChallenge, OtpPurpose, User
from app.schemas.auth import OtpChallengeOut
from app.services import mailer, outbox, sms
from app.services.identifiers import (
    Kind,
    anon_identifier,
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

Flow = Literal["sign_in", "step_up", "add_identifier"]

HOUR = timedelta(hours=1)
DAY = timedelta(days=1)
FAILED_CODES_PER_DAY = 15  # wrong codes for an address from one network in 24 h before that network is locked out
LONG_CODES_AFTER = 15  # wrong codes for an address from anywhere in 24 h before its codes become long
SPRAY_ALARM = 200  # wrong codes across the site within an hour: someone is guessing at many addresses
KEEP_CHALLENGES = timedelta(days=2)  # older rows serve no limit any more and hold personal data: deleted
LONG_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"  # no 0/O, 1/I/L
LONG_CODE_LENGTH = 10


def sms_regions() -> list[str]:
    """DSBA_SMS_ALLOWED_REGIONS: the countries whose mobile numbers get codes by text (none: no texts)."""
    return list(get_settings().sms_allowed_regions)


# ── codes ───────────────────────────────────────────────────────────────────────────────────


def new_code() -> str:
    return f"{secrets.randbelow(1_000_000):06d}"


def new_long_code() -> str:
    return "".join(secrets.choice(LONG_CODE_ALPHABET) for _ in range(LONG_CODE_LENGTH))


def shown(code: str) -> str:
    """A code as people read it: '123456', or a long one as 'ABCDE-FGH23'."""
    return code if len(code) != LONG_CODE_LENGTH else f"{code[:5]}-{code[5:]}"


def canonical_code(typed: str) -> str:
    """What was typed, as codes are hashed: digits as they are; a long code in capitals without the dash or space."""
    return typed.strip().upper().replace("-", "").replace(" ", "")


def code_hash(challenge_id: uuid.UUID, code: str) -> str:
    key = get_settings().secret_key.get_secret_value().encode()
    return hmac.new(key, f"{challenge_id}:{code}".encode(), hashlib.sha256).hexdigest()


def code_expired() -> ApiError:
    return ApiError(410, "code_expired", "This code has expired. Ask for a new one.")


def too_many_attempts() -> ApiError:
    return ApiError(429, "too_many_attempts", "Too many wrong tries for this code. Ask for a new one.")


def _purpose(flow: Flow) -> OtpPurpose:
    return OtpPurpose.add_identifier if flow == "add_identifier" else OtpPurpose.sign_in


def _bound_to(flow: Flow, user_id: uuid.UUID | None) -> ColumnElement[bool]:
    """The challenges a flow may check: sign-in codes belong to no account; the others to the signed-in one."""
    purpose = OtpChallenge.purpose == _purpose(flow)
    if flow == "sign_in":
        return and_(purpose, OtpChallenge.user_id.is_(None))
    return and_(purpose, OtpChallenge.user_id == user_id)


# ── starting a challenge ─────────────────────────────────────────────────────────────────────


def prepare(raw: str) -> tuple[Kind, str]:
    """Normalises what the person typed (422 invalid_identifier) and refuses numbers we don't text (422
    sms_unavailable: landlines, toll-free and premium numbers, and countries outside the allowed regions)."""
    kind, identifier = normalize_identifier(raw)
    check_textable(kind, identifier)
    return kind, identifier


def check_textable(kind: Kind, identifier: str) -> None:
    if kind == "phone" and not sms_capable(identifier, sms_regions()):
        raise invalid(
            "identifier",
            "We can't send a code to this number. Use your email address instead.",
            code="sms_unavailable",
        )


def start(
    db: Session,
    *,
    kind: Kind,
    identifier: str,
    flow: Flow,
    ip: str | None,
    user: User | None = None,
    taken: Callable[[], bool] | None = None,
) -> OtpChallengeOut:
    """Checks the limits, stores a challenge and sends its code. `user` is the signed-in account (step-up, adding an
    identifier). When `taken()` says that another account uses the identifier, the address gets a notice instead
    of a code; everything else (the row, the limits, the answer) is the same."""
    if flow != "sign_in" and user is None:
        raise ValueError(f"the {flow} flow needs the signed-in user")
    s = get_settings()
    now = utcnow()
    channel = channel_for(kind)
    long_code = _check_limits(db, kind=kind, identifier=identifier, channel=channel, ip=ip, user=user, now=now)
    in_use = taken() if taken is not None else False
    db.execute(delete(OtpChallenge).where(OtpChallenge.created_at < now - KEEP_CHALLENGES))
    challenge, code = _add_challenge(db, _purpose(flow), channel, identifier, ip, user, now, long_code=long_code)
    db.commit()  # the row exists before the code can arrive
    try:
        if in_use:
            _deliver_in_use_notice(kind, identifier)
        else:
            _deliver(kind, identifier, code, flow)
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
        code_format="long" if long_code else "digits",
    )


def _add_challenge(
    db: Session,
    purpose: OtpPurpose,
    channel: Channel,
    identifier: str,
    ip: str | None,
    user: User | None,
    now: datetime,
    *,
    long_code: bool,
) -> tuple[OtpChallenge, str]:
    cid = uuid.uuid4()
    code = new_long_code() if long_code else new_code()
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
    """Challenges for this address, for an address with the same rate-limit key, and those a deleted account left
    behind for it (anonymised)."""
    anon = OtpChallenge.identifier == anon_identifier(kind, identifier)
    if kind == "email":
        return or_(email_rate_key_sql(OtpChallenge.identifier) == rate_key(kind, identifier), anon)
    return or_(OtpChallenge.identifier == identifier, anon)


def _check_limits(
    db: Session, *, kind: Kind, identifier: str, channel: Channel, ip: str | None, user: User | None, now: datetime
) -> bool:
    """Raises 429 rate_limited (or sms_unavailable) when a limit is reached. -> True when the code must be long."""
    s = get_settings()
    # Always in this order (address, IP, user, channel), so concurrent requests cannot deadlock.
    lock(db, f"otp:id:{rate_key(kind, identifier)}")
    lock(db, f"otp:ip:{ip_bucket(ip) or '-'}")
    if user is not None:
        lock(db, f"otp:user:{user.id}")
    lock(db, f"otp:{channel.value}")  # the site-wide budget of the channel

    delivered = OtpChallenge.expires_at > OtpChallenge.created_at  # failed deliveries don't count here
    address = same_address(kind, identifier)
    network = in_ip_bucket(OtpChallenge.ip, ip)
    created = OtpChallenge.created_at
    waits: list[tuple[int, str]] = []

    def check(where: Sequence[ColumnElement[bool]], limit: int, window: timedelta, message: str) -> None:
        wait = window_wait(db, created, where, limit=limit, window=window, now=now)
        if wait:
            waits.append((wait, message))

    # An address, from anywhere: these only slow down (an hour at most), so nobody can lock its owner out.
    check([address, delivered], 1, timedelta(seconds=s.otp_resend_seconds), "Wait {} before asking for another code.")
    check(
        [address], s.otp_max_per_identifier_per_hour, HOUR, "Too many codes were sent to this address. Try again in {}."
    )
    # An address from one network, and one network: what one place can do.
    from_here = "Too many codes were asked for this address from your network. Try again in {}."
    check([address, network], s.otp_max_per_identifier_per_day, DAY, from_here)
    check(
        [network], s.otp_max_per_ip_per_hour, HOUR, "Too many codes were asked for from your network. Try again in {}."
    )
    if user is not None:
        mine = [OtpChallenge.user_id == user.id]
        check(mine, s.otp_max_per_identifier_per_hour, HOUR, "You've asked for too many codes. Try again in {}.")
    wait = _locked_for(db, [address, network], now)
    if wait:
        waits.append((wait, "Too many wrong codes were entered for this address from your network. Try again in {}."))
    if waits:
        wait, message = max(waits)
        raise rate_limited(wait, message.format(human_wait(wait)))

    if channel == Channel.sms:
        texts = [OtpChallenge.channel == Channel.sms, delivered]
        for limit, window in ((s.sms_max_per_hour, HOUR), (s.sms_max_per_day, DAY)):
            if window_wait(db, created, texts, limit=limit, window=window, now=now):
                log.warning("SMS budget reached (%d per %s): codes by text are paused", limit, window)
                raise ApiError(429, "sms_unavailable", "We can't send texts right now. Use your email address instead.")
    else:
        emails = [OtpChallenge.channel == Channel.email, delivered]
        for limit, window in ((s.email_max_per_hour, HOUR), (s.email_max_per_day, DAY)):
            wait = window_wait(db, created, emails, limit=limit, window=window, now=now)
            if wait:
                log.warning("Sign-in email budget reached (%d per %s): codes by email are paused", limit, window)
                raise rate_limited(
                    wait,
                    f"The Hub has sent too many sign-in emails for now. Try again in {human_wait(wait)}, "
                    "or use your phone number.",
                )
    return _wrong_codes(db, [address], now) >= LONG_CODES_AFTER


def _failures(db: Session, where: Sequence[ColumnElement[bool]], now: datetime) -> list[tuple[datetime, int]]:
    """(created_at, attempts) of the open challenges matching `where` from the last 24 h, oldest first: their tries
    were all wrong (a right one closes every open code for the address)."""
    return list(
        db.execute(
            select(OtpChallenge.created_at, OtpChallenge.attempts)
            .where(
                *where,
                OtpChallenge.consumed_at.is_(None),
                OtpChallenge.attempts > 0,
                OtpChallenge.created_at > now - DAY,
            )
            .order_by(OtpChallenge.created_at)
        )
        .tuples()
        .all()
    )


def _wrong_codes(db: Session, where: Sequence[ColumnElement[bool]], now: datetime) -> int:
    return sum(attempts for _, attempts in _failures(db, where, now))


def _locked_for(db: Session, where: Sequence[ColumnElement[bool]], now: datetime) -> int:
    """Seconds left of the lock FAILED_CODES_PER_DAY wrong codes put on `where` (0: not locked)."""
    rows = _failures(db, where, now)
    total = sum(attempts for _, attempts in rows)
    if total < FAILED_CODES_PER_DAY:
        return 0
    for created_at, attempts in rows:  # oldest first: it opens again once enough of them leave the window
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
    db: Session, *, challenge_id: uuid.UUID, code: str, flow: Flow, user_id: uuid.UUID | None = None
) -> Verified:
    """Checks a code. On success the challenge is consumed in the session (the caller commits with its change).

    Errors: invalid_code (422, attempts left in the message), code_expired (410: unknown, expired, used, retired,
    or sent for another flow or another account), too_many_attempts (429)."""
    s = get_settings()
    now = utcnow()
    row = (
        db.execute(
            update(OtpChallenge)
            .where(
                OtpChallenge.id == challenge_id,
                _bound_to(flow, user_id),
                OtpChallenge.consumed_at.is_(None),
                OtpChallenge.expires_at > now,
                OtpChallenge.attempts < s.otp_max_attempts,
            )
            .values(attempts=OtpChallenge.attempts + 1)
            .returning(
                OtpChallenge.attempts,
                OtpChallenge.code_hash,
                OtpChallenge.identifier,
                OtpChallenge.channel,
                OtpChallenge.ip,
            )
        )
        .tuples()
        .one_or_none()
    )
    db.commit()  # the try counts even when what follows fails
    if row is None:
        raise _unusable(db, challenge_id, flow, user_id, now)
    attempts, stored_hash, identifier, channel, ip = row
    kind = kind_for(Channel(channel))
    if not hmac.compare_digest(stored_hash, code_hash(challenge_id, canonical_code(code))):
        _alarms(db, kind, identifier, str(ip) if ip is not None else None, now)
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
    return Verified(kind=kind, identifier=identifier)


def _unusable(db: Session, challenge_id: uuid.UUID, flow: Flow, user_id: uuid.UUID | None, now: datetime) -> ApiError:
    found = (
        db.execute(
            select(OtpChallenge.consumed_at, OtpChallenge.expires_at, OtpChallenge.attempts).where(
                OtpChallenge.id == challenge_id, _bound_to(flow, user_id)
            )
        )
        .tuples()
        .one_or_none()
    )
    if found is None:  # unknown, or another flow's or another account's: nothing to say about it
        return code_expired()
    consumed_at, expires_at, attempts = found
    if consumed_at is None and expires_at > now and attempts >= get_settings().otp_max_attempts:
        return too_many_attempts()
    return code_expired()


def _alarms(db: Session, kind: Kind, identifier: str, ip: str | None, now: datetime) -> None:
    """After a wrong code: warns when it locks a network out of the address, when it makes the address's codes long,
    and at every SPRAY_ALARM wrong codes across the site within an hour (someone guessing at many addresses)."""
    hint = destination_hint(kind, identifier)
    address = same_address(kind, identifier)
    if _wrong_codes(db, [address, in_ip_bucket(OtpChallenge.ip, ip)], now) == FAILED_CODES_PER_DAY:
        log.warning(
            "codes for %s are locked for one network (%s) after %d wrong codes",
            hint,
            ip_bucket(ip),
            FAILED_CODES_PER_DAY,
        )
    if _wrong_codes(db, [address], now) == LONG_CODES_AFTER:
        log.warning("codes for %s are long now: %d wrong codes in 24 hours", hint, LONG_CODES_AFTER)
    tried, signed_in = db.execute(
        select(func.coalesce(func.sum(OtpChallenge.attempts), 0), func.count(OtpChallenge.consumed_at)).where(
            OtpChallenge.created_at > now - HOUR
        )
    ).one()
    wrong = int(tried) - int(signed_in)
    if wrong > 0 and wrong % SPRAY_ALARM == 0:
        log.warning("%d wrong sign-in codes across the site in the last hour", wrong)


# ── what goes out ───────────────────────────────────────────────────────────────────────────


def _minutes() -> str:
    n = max(1, round(get_settings().otp_ttl_seconds / 60))
    return f"{n} minute{'s' if n != 1 else ''}"


LONG_NOTE = "This code is longer than usual because wrong codes were entered for this address recently."


def email_content(code: str, flow: Flow) -> tuple[str, str, str]:
    """-> (subject, text, html) of the email that carries a code."""
    s = get_settings()
    base = s.web_base_url.rstrip("/")
    written = shown(code)
    subject = f"Your DSBA Hub code: {written}"
    if flow == "sign_in":
        use = "Enter it on the sign-in page to continue."
        ignore = "If you didn't try to sign in, you can ignore this email."
    elif flow == "step_up":
        use = "Enter it to confirm it's you before you change how you sign in or delete your account."
        ignore = (
            "If you didn't ask for this, someone may be signed in to your account: open Your account and sign out "
            f"the devices you don't recognise ({base}/account)."
        )
    else:
        use = "Enter it to add this email address to your account."
        ignore = "If you didn't ask for this, you can ignore this email."
    expiry = f"It expires in {_minutes()}."
    note = f"\n\n{LONG_NOTE} Type it with or without the dash." if len(code) == LONG_CODE_LENGTH else ""
    text = f"Your DSBA Hub code is {written}.\n\n{use} {expiry}{note}\n\n{ignore}\n\nDSBA Hub\n{s.web_base_url}\n"
    note_html = f'<p style="margin:0 0 12px;font-size:14px;line-height:1.5">{escape(LONG_NOTE)}</p>' if note else ""
    html = (
        '<!doctype html><html lang="en"><head><meta charset="utf-8">'
        '<meta name="viewport" content="width=device-width, initial-scale=1">'
        f"<title>{escape(subject)}</title></head>"
        '<body style="margin:0;padding:24px;background:#f5f5f2;color:#1f2328;'
        "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif\">"
        '<div style="max-width:480px;margin:0 auto;background:#ffffff;border-radius:12px;padding:28px">'
        '<p style="margin:0 0 8px;font-size:15px">Your DSBA Hub code is</p>'
        '<p style="margin:0 0 20px;font-size:32px;font-weight:700;letter-spacing:6px;'
        f'font-family:ui-monospace,Menlo,Consolas,monospace">{escape(written)}</p>'
        f'<p style="margin:0 0 12px;font-size:15px;line-height:1.5">{escape(use)} {escape(expiry)}</p>'
        f"{note_html}"
        f'<p style="margin:0;font-size:13px;line-height:1.5;color:#59636e">{escape(ignore)}</p>'
        "</div>"
        '<p style="max-width:480px;margin:16px auto 0;font-size:12px;color:#59636e;text-align:center">'
        f"DSBA Hub &middot; {escape(s.web_base_url)}</p>"
        "</body></html>"
    )
    return subject, text, html


def sms_text(code: str) -> str:
    """The text that carries a code, ending with the WebOTP line browsers use to fill the code in."""
    written = shown(code)
    text = f"Your DSBA Hub code is {written}. It expires in {_minutes()}."
    host = urlsplit(get_settings().web_base_url).hostname
    return f"{text}\n\n@{host} #{written}" if host else text


def _deliver(kind: Kind, identifier: str, code: str, flow: Flow) -> None:
    if kind == "email":
        subject, text, html = email_content(code, flow)
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


ACCOUNT_NOTICE_SUBJECT = "Your DSBA Hub account changed"


def queue_notice(db: Session, kind: Kind, to: str, text: str, user_id: uuid.UUID) -> bool:
    """A security notice about the account (always sent, no switch). An email goes through the outbox, in the
    caller's transaction. -> True when it is a text, to send with send_text_notice() once the change is committed."""
    if kind == "phone":
        return sms_capable(to, sms_regions())
    base = get_settings().web_base_url.rstrip("/")
    body = (
        f"{text} If this wasn't you, sign in to DSBA Hub and check Your account: {base}/account\n\nDSBA Hub\n{base}\n"
    )
    outbox.queue(db, to=to, subject=ACCOUNT_NOTICE_SUBJECT, body=body, kind=outbox.ACCOUNT_NOTICE, user_id=user_id)
    return False


def send_text_notice(to: str, text: str) -> None:
    """Best effort: a security notice by text."""
    try:
        sms.send_sms(to, f"DSBA Hub: {text} If this wasn't you, sign in and check Your account.")
    except DeliveryError:
        log.warning("an account notice to %s was not sent", destination_hint("phone", to))


def anonymise(db: Session, user: User) -> int:
    """Before an account is deleted: its challenges, and those for its addresses, lose the address (replaced by
    anon_identifier()) and the link to the account, and stop working, but stay for the limits until the sweep.
    -> how many rows."""
    addresses = [a for a in (user.email, user.phone) if a]
    rows = (
        db.execute(
            select(OtpChallenge.id, OtpChallenge.identifier, OtpChallenge.channel).where(
                or_(OtpChallenge.user_id == user.id, OtpChallenge.identifier.in_(addresses))
            )
        )
        .tuples()
        .all()
    )
    now = utcnow()
    by_address: dict[tuple[str, Channel], list[uuid.UUID]] = {}
    for cid, identifier, channel in rows:
        by_address.setdefault((identifier, Channel(channel)), []).append(cid)
    for (identifier, channel), ids in by_address.items():
        db.execute(
            update(OtpChallenge)
            .where(OtpChallenge.id.in_(ids))
            .values(
                identifier=anon_identifier(kind_for(channel), identifier),
                user_id=None,
                expires_at=func.least(OtpChallenge.expires_at, now),
            )
        )
    return len(rows)
