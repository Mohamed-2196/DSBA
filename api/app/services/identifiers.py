"""Email addresses and phone numbers as account identifiers: normalising, masking and who may get a text."""

from __future__ import annotations

import logging
from collections.abc import Iterable
from typing import Literal

import phonenumbers
from email_validator import EmailNotValidError, validate_email
from sqlalchemy import ColumnElement, case, func
from sqlalchemy.orm import InstrumentedAttribute

from app.config import get_settings
from app.core.errors import ApiError, invalid
from app.models import Channel

log = logging.getLogger("dsba.accounts")

Kind = Literal["email", "phone"]
BULLETS = "•••"
# Numbers we text a code to: mobiles only (no landlines, toll-free or premium-rate ranges).
SMS_NUMBER_TYPES = frozenset({phonenumbers.PhoneNumberType.MOBILE, phonenumbers.PhoneNumberType.FIXED_LINE_OR_MOBILE})


def normalize_identifier(raw: str) -> tuple[Kind, str]:
    """-> ('email', 'name@example.com') or ('phone', '+97333123456'). Raises invalid_identifier (422)."""
    value = raw.strip()
    if "@" in value:
        try:
            info = validate_email(value, check_deliverability=False)
        except EmailNotValidError as e:
            raise invalid("identifier", "Enter a valid email address.", code="invalid_identifier") from e
        return "email", info.normalized.lower()
    try:
        num = phonenumbers.parse(value, get_settings().default_phone_region)
    except phonenumbers.NumberParseException as e:
        raise invalid("identifier", "Enter an email address or a phone number.", code="invalid_identifier") from e
    if not phonenumbers.is_valid_number(num):
        raise invalid("identifier", "This phone number doesn't look right.", code="invalid_identifier")
    return "phone", phonenumbers.format_number(num, phonenumbers.PhoneNumberFormat.E164)


GMAIL_DOMAINS = ("gmail.com", "googlemail.com")


def rate_key(kind: Kind, identifier: str) -> str:
    """The key rate limits count by. For email it drops a '+tag' (and the dots Gmail ignores), so that
    name+1@gmail.com, name+2@gmail.com... share one inbox's limits (security review finding 20). Accounts keep the
    address as typed."""
    if kind != "email":
        return identifier
    local, _, domain = identifier.rpartition("@")
    local = local.split("+", 1)[0]
    if domain in GMAIL_DOMAINS:
        local, domain = local.replace(".", ""), GMAIL_DOMAINS[0]
    return f"{local}@{domain}"


def email_rate_key_sql(column: ColumnElement[str] | InstrumentedAttribute[str]) -> ColumnElement[str]:
    """rate_key() of an email column, in SQL (keep the two in step)."""
    local = func.regexp_replace(func.split_part(column, "@", 1), r"\+.*$", "")
    domain = func.split_part(column, "@", 2)
    return case(
        (domain.in_(GMAIL_DOMAINS), func.replace(local, ".", "") + f"@{GMAIL_DOMAINS[0]}"),
        else_=local + "@" + domain,
    )


def channel_for(kind: Kind) -> Channel:
    return Channel.email if kind == "email" else Channel.sms


def kind_for(channel: Channel) -> Kind:
    return "email" if channel == Channel.email else "phone"


def destination_hint(kind: Kind, value: str) -> str:
    """Enough to recognise an address without revealing it: 'm•••@gmail.com', '+973 •••• ••56'.

    Also the only form in which identifiers appear in logs."""
    if kind == "email":
        local, _, domain = value.rpartition("@")
        return f"{local[:1]}{BULLETS}@{domain}" if local else f"{BULLETS}@{domain}"
    try:
        num = phonenumbers.parse(value, None)
        country, national = num.country_code, phonenumbers.national_significant_number(num)
    except phonenumbers.NumberParseException:
        return f"+{BULLETS}{value[-2:]}"
    masked = "•" * max(0, len(national) - 2) + national[-2:]
    groups: list[str] = []
    while masked:  # groups of four from the right, so the visible digits stay together
        groups.insert(0, masked[-4:])
        masked = masked[:-4]
    return f"+{country} " + " ".join(groups)


def sms_capable(e164: str, allowed_regions: Iterable[str]) -> bool:
    """True for a mobile number in one of the regions we text (security review, finding 3: SMS pumping)."""
    try:
        num = phonenumbers.parse(e164, None)
    except phonenumbers.NumberParseException:
        return False
    region = phonenumbers.region_code_for_number(num)
    allowed = {r.strip().upper() for r in allowed_regions}
    return region in allowed and phonenumbers.number_type(num) in SMS_NUMBER_TYPES


def admin_identifiers() -> frozenset[str]:
    """DSBA_ADMIN_IDENTIFIERS, normalised the way sign-in normalises what people type."""
    out: set[str] = set()
    for raw in get_settings().admin_identifiers:
        try:
            out.add(normalize_identifier(raw)[1])
        except ApiError:  # a typo in the setting must not break sign-in for everyone
            log.warning("DSBA_ADMIN_IDENTIFIERS has an entry that is not an email address or a phone number")
    return frozenset(out)
