"""Email addresses as account identifiers: normalising, masking, the key the sign-in limits count by, and the
addresses DSBA_ADMIN_IDENTIFIERS lists."""

from __future__ import annotations

import hashlib
import hmac
import logging

from email_validator import EmailNotValidError, validate_email

from app.config import get_settings
from app.core.errors import ApiError, invalid

log = logging.getLogger("dsba.accounts")

BULLETS = "•••"
GMAIL_DOMAINS = ("gmail.com", "googlemail.com")


def normalize_email(raw: str, field: str = "email") -> str:
    """'Name@Example.com ' -> 'name@example.com'. Raises invalid_email (422) on `field`."""
    try:
        info = validate_email(raw.strip(), check_deliverability=False)
    except EmailNotValidError as e:
        raise invalid(field, "Enter a valid email address, like name@example.com.", code="invalid_email") from e
    return info.normalized.lower()


def rate_key(email: str) -> str:
    """The key the sign-in limits count an address by. It drops a '+tag' (and the dots Gmail ignores), so that
    name+1@gmail.com, name+2@gmail.com... share one inbox's limits (security review finding 20). Accounts keep the
    address as typed."""
    local, _, domain = email.rpartition("@")
    local = local.split("+", 1)[0]
    if domain in GMAIL_DOMAINS:
        local, domain = local.replace(".", ""), GMAIL_DOMAINS[0]
    return f"{local}@{domain}"


def account_key(email: str) -> str:
    """What the sign-in limits store for an address: a keyed hash of its rate_key(), never the address itself."""
    key = get_settings().secret_key.get_secret_value().encode()
    return hmac.new(key, f"sign-in:{rate_key(email)}".encode(), hashlib.sha256).hexdigest()


def destination_hint(email: str) -> str:
    """Enough to recognise an address without revealing it: 'm•••@gmail.com'. The only form in which addresses appear
    in logs."""
    local, _, domain = email.rpartition("@")
    return f"{local[:1]}{BULLETS}@{domain}" if local else f"{BULLETS}@{domain}"


def admin_identifiers() -> frozenset[str]:
    """DSBA_ADMIN_IDENTIFIERS, normalised the way sign-in normalises addresses."""
    out: set[str] = set()
    for raw in get_settings().admin_identifiers:
        try:
            out.add(normalize_email(raw))
        except ApiError:  # a typo in the setting must not break sign-in for everyone
            log.warning("DSBA_ADMIN_IDENTIFIERS has an entry that is not an email address")
    return frozenset(out)
