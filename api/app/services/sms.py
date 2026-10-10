"""Sending text messages (one-time codes). DSBA_SMS_BACKEND picks the backend:

  console  a log line; in development it includes the text so a developer can read the code
  file     one .txt per message in DSBA_SMS_FILE_DIR, named '<timestamp>-<number>-<random>.txt'
  twilio   Twilio's Messages API (From, or MessagingServiceSid when DSBA_TWILIO_FROM starts with 'MG'); 10 s timeout

Failures raise DeliveryError. Logs never hold a code (outside development) or a full phone number."""

from __future__ import annotations

import logging
import re
import secrets
from pathlib import Path
from urllib.parse import quote

import httpx

from app.config import get_settings
from app.core.time import utcnow
from app.services.identifiers import destination_hint
from app.services.mailer import DeliveryError

__all__ = ["DeliveryError", "send_sms"]

log = logging.getLogger("dsba.sms")
TIMEOUT_SECONDS = 10.0
TWILIO_MESSAGES_URL = "https://api.twilio.com/2010-04-01/Accounts/{sid}/Messages.json"


def send_sms(to_e164: str, text: str) -> None:
    """Sends one text message to an E.164 number or raises DeliveryError."""
    backend = get_settings().sms_backend
    if backend == "twilio":
        _send_twilio(to_e164, text)
    elif backend == "file":
        _write_file(to_e164, text)
    else:
        _log(to_e164, text)


def http_client() -> httpx.Client:
    """The HTTP client for the provider (tests swap in one with a mock transport)."""
    return httpx.Client(timeout=TIMEOUT_SECONDS)


def _send_twilio(to: str, text: str) -> None:
    s = get_settings()
    sid, token, sender = s.twilio_account_sid, s.twilio_auth_token, s.twilio_from
    if not sid or token is None or not sender:
        log.error("DSBA_SMS_BACKEND is 'twilio' but the Twilio account SID, auth token or sender is not set")
        raise DeliveryError("Text messages are not set up.")
    form = {"To": to, "Body": text}
    form["MessagingServiceSid" if sender.startswith("MG") else "From"] = sender
    url = TWILIO_MESSAGES_URL.format(sid=quote(sid, safe=""))
    try:
        with http_client() as client:
            r = client.post(url, data=form, auth=(sid, token.get_secret_value()))
    except httpx.HTTPError as e:
        log.warning("text to %s was not sent: %s", destination_hint("phone", to), type(e).__name__)
        raise DeliveryError("The text could not be sent.") from e
    if r.is_success:
        return
    log.warning(
        "text to %s was refused by Twilio: HTTP %s, error %s",
        destination_hint("phone", to),
        r.status_code,
        _twilio_error_code(r),
    )
    raise DeliveryError("The text could not be sent.")


def _twilio_error_code(r: httpx.Response) -> object:
    try:
        body = r.json()
    except ValueError:
        return None
    return body.get("code") if isinstance(body, dict) else None


def _write_file(to: str, text: str) -> None:
    folder = Path(get_settings().sms_file_dir)
    number = re.sub(r"[^0-9+]", "", to)
    name = f"{utcnow():%Y%m%dT%H%M%S%fZ}-{number}-{secrets.token_hex(2)}.txt"
    try:
        folder.mkdir(parents=True, exist_ok=True)
        (folder / name).write_text(text + "\n", encoding="utf-8")
    except OSError as e:
        log.warning("text could not be written to %s: %s", folder, type(e).__name__)
        raise DeliveryError("The text could not be saved.") from e


def _log(to: str, text: str) -> None:
    s = get_settings()
    if s.env == "development":
        log.info("text (console backend) to %s:\n%s", to, text)
        return
    log.info("text (console backend, not delivered) to %s", destination_hint("phone", to))
    if s.is_production:
        log.warning("DSBA_SMS_BACKEND is 'console' in production: texts are not delivered")
