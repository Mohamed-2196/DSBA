"""Passwords: hashing, the rules a new one meets, and the limits on sign-in attempts.

- Hashes are argon2id with argon2-cffi's defaults (RFC 9106, low-memory profile), salted per password. A password is
  NFKC-normalised first, so the same password typed on any device matches.
- A new password has PASSWORD_MIN characters or more, isn't one of the 1,000 most common passwords
  (common_passwords.txt), isn't the email address or its first part, and has more than two different characters.
- Checking a password does the same work whether or not the account exists or has a password (a dummy hash stands
  in), and a failure answers the same: nothing tells whether an address has an account.
- Limits (DSBA_SIGN_IN_*, DSBA_SIGN_UPS_*; decision D4), counted in sign_in_attempts under advisory locks, before
  the password is checked: wrong passwords for an address from one network (an IP address, or an IPv6 /64), wrong
  passwords for an address from anywhere, sign-in attempts from one network, and sign-ups from one network per hour
  and per day. An address is counted by its rate-limit key (name+tag@ and Gmail's dots fold together), stored as a
  keyed hash. The rows are swept after KEEP_ATTEMPTS."""

from __future__ import annotations

import secrets
import unicodedata
from datetime import timedelta
from functools import lru_cache
from pathlib import Path

from argon2 import PasswordHasher, profiles
from argon2.exceptions import InvalidHashError, VerificationError
from sqlalchemy import ColumnElement
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.errors import ApiError, invalid, rate_limited
from app.core.time import utcnow
from app.models import AttemptKind, SignInAttempt
from app.schemas.auth import PASSWORD_MIN
from app.services.identifiers import account_key
from app.services.ratelimit import human_wait, in_ip_bucket, ip_bucket, lock, window_wait

HOUR = timedelta(hours=1)
DAY = timedelta(days=1)
KEEP_ATTEMPTS = timedelta(days=2)  # older rows serve no limit any more: the sweep deletes them
RESET_FAILURES_PER_NETWORK_PER_HOUR = 20
COMMON_PASSWORDS = Path(__file__).with_name("common_passwords.txt")
TOO_MANY = "Too many tries. Try again in {}, or continue with Google."


# ── hashing ─────────────────────────────────────────────────────────────────────────────────


@lru_cache
def hasher() -> PasswordHasher:
    """argon2id. The tests use argon2's cheapest parameters, so hundreds of sign-ins stay fast; every other environment
    uses the defaults."""
    if get_settings().env == "test":
        return PasswordHasher.from_parameters(profiles.CHEAPEST)
    return PasswordHasher()


@lru_cache
def _stand_in() -> str:
    """The hash a password is checked against when the account doesn't exist or has no password: the same work."""
    return hasher().hash(secrets.token_urlsafe(24))


def normalized(password: str) -> str:
    return unicodedata.normalize("NFKC", password)


def hash_password(password: str) -> str:
    return hasher().hash(normalized(password))


def matches(stored: str | None, password: str) -> bool:
    """Whether `password` is the one `stored` hashes. With no stored hash it does the same work and answers False."""
    try:
        ok = hasher().verify(stored or _stand_in(), normalized(password))
    except (VerificationError, InvalidHashError):
        return False
    return ok and stored is not None


# ── rules ───────────────────────────────────────────────────────────────────────────────────


@lru_cache
def common_passwords() -> frozenset[str]:
    lines = COMMON_PASSWORDS.read_text(encoding="utf-8").splitlines()
    return frozenset(line.strip().casefold() for line in lines if line.strip() and not line.startswith("#"))


def _weak(message: str, field: str) -> ApiError:
    return invalid(field, message, code="weak_password")


def check_new(password: str, email: str, field: str = "password") -> None:
    """Raises weak_password (422 on `field`) unless `password` may be a new password for the account `email`."""
    pw = normalized(password)
    folded = pw.casefold()
    if len(pw) < PASSWORD_MIN:
        raise _weak(f"Use at least {PASSWORD_MIN} characters. A few words together are easy to remember.", field)
    if folded in common_passwords() or folded.strip() in common_passwords():
        raise _weak("This is one of the most common passwords. Choose another one.", field)
    local = email.rpartition("@")[0]
    if folded in (email.casefold(), local.casefold()):
        raise _weak("Don't use your email address as your password.", field)
    if len(set(pw)) <= 2:
        raise _weak("Use more than two different characters.", field)


# ── limits ──────────────────────────────────────────────────────────────────────────────────


def _wait(db: Session, where: list[ColumnElement[bool]], limit: int, window: timedelta) -> int:
    return window_wait(db, SignInAttempt.created_at, where, limit=limit, window=window, now=utcnow())


def check_sign_in(db: Session, email: str, ip: str | None) -> None:
    """Before a password is checked for `email` (signing in, confirming it's you, changing it): 429 rate_limited
    when this network tried too often, or too many wrong passwords were tried for the address. Takes the locks the
    attempt's row is then added under (record())."""
    s = get_settings()
    key = account_key(email)
    lock(db, f"sign-in:{key}")
    lock(db, f"sign-in-ip:{ip_bucket(ip)}")
    failed = SignInAttempt.kind == AttemptKind.sign_in_failed
    from_here = in_ip_bucket(SignInAttempt.ip, ip)
    tried = SignInAttempt.kind.in_([AttemptKind.sign_in, AttemptKind.sign_in_failed])
    wait = max(
        _wait(db, [tried, from_here], s.sign_ins_per_network_per_hour, HOUR),
        _wait(
            db,
            [failed, SignInAttempt.account_key == key, from_here],
            s.sign_in_failures_per_address_network_per_hour,
            HOUR,
        ),
        _wait(db, [failed, SignInAttempt.account_key == key], s.sign_in_failures_per_address_per_hour, HOUR),
    )
    if wait:
        raise rate_limited(wait, TOO_MANY.format(human_wait(wait)))


def check_sign_up(db: Session, ip: str | None) -> None:
    """Before a sign-up: 429 rate_limited when this network signed up (or tried to) too often."""
    s = get_settings()
    lock(db, f"sign-up-ip:{ip_bucket(ip)}")
    where = [SignInAttempt.kind == AttemptKind.sign_up, in_ip_bucket(SignInAttempt.ip, ip)]
    wait = max(
        _wait(db, where, s.sign_ups_per_network_per_hour, HOUR),
        _wait(db, where, s.sign_ups_per_network_per_day, DAY),
    )
    if wait:
        raise rate_limited(wait, f"Too many new accounts from this network. Try again in {human_wait(wait)}.")


def check_reset(db: Session, ip: str | None) -> None:
    """Before a reset link is tried: 429 rate_limited after many links that didn't work from this network."""
    lock(db, f"reset-ip:{ip_bucket(ip)}")
    where = [SignInAttempt.kind == AttemptKind.reset_failed, in_ip_bucket(SignInAttempt.ip, ip)]
    wait = _wait(db, where, RESET_FAILURES_PER_NETWORK_PER_HOUR, HOUR)
    if wait:
        raise rate_limited(wait, f"Too many tries. Try again in {human_wait(wait)}.")


def record(db: Session, kind: AttemptKind, email: str | None, ip: str | None) -> None:
    """Adds an attempt for the limits to count (the caller commits)."""
    db.add(SignInAttempt(kind=kind, account_key=account_key(email) if email else None, ip=ip, created_at=utcnow()))
