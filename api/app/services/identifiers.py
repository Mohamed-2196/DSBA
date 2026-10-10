"""Email addresses and phone numbers as account identifiers. Owner: accounts agent (complete as needed)."""

from __future__ import annotations

from typing import Literal

import phonenumbers
from email_validator import EmailNotValidError, validate_email

from app.config import get_settings
from app.core.errors import invalid

Kind = Literal["email", "phone"]


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
