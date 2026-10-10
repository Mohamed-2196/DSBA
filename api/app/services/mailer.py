"""Sending email (one-time codes, account notices). DSBA_EMAIL_BACKEND picks the backend:

  smtp     an SMTP server (Mailpit locally, the provider's relay in production); 10 s timeout
  file     one .eml per message in DSBA_EMAIL_FILE_DIR
  console  a log line; in development it includes the message so a developer can read the code

Nothing here logs a code outside development, and addresses only appear masked."""

from __future__ import annotations

import logging
import secrets
import smtplib
import ssl
from email.message import EmailMessage
from email.policy import SMTPUTF8
from email.utils import formatdate, make_msgid, parseaddr
from pathlib import Path

from app.config import get_settings
from app.core.time import utcnow
from app.services.identifiers import destination_hint

log = logging.getLogger("dsba.mail")
TIMEOUT_SECONDS = 10
SMTPS_PORT = 465  # TLS from the first byte (the other ports use STARTTLS when DSBA_SMTP_STARTTLS is set)


class DeliveryError(Exception):
    """An email or a text could not be handed over for delivery. Its message never holds the address or the code."""


def build_message(to: str, subject: str, text: str, html: str | None = None) -> EmailMessage:
    s = get_settings()
    sender_domain = parseaddr(s.email_from)[1].rpartition("@")[2] or "dsba-hub.local"
    msg = EmailMessage()
    msg["From"] = s.email_from
    msg["To"] = to
    msg["Subject"] = subject
    msg["Date"] = formatdate(usegmt=True)
    msg["Message-ID"] = make_msgid(domain=sender_domain)  # an explicit domain: no DNS lookup of our own name
    msg["Auto-Submitted"] = "auto-generated"  # RFC 3834: out-of-office replies stay away
    msg.set_content(text)
    if html is not None:
        msg.add_alternative(html, subtype="html")
    return msg


def send_email(to: str, subject: str, text: str, html: str | None = None) -> None:
    """Sends one email or raises DeliveryError."""
    try:
        msg = build_message(to, subject, text, html)
    except (TypeError, ValueError) as e:  # e.g. a line break in a header
        raise DeliveryError("The email could not be built.") from e
    backend = get_settings().email_backend
    if backend == "smtp":
        _send_smtp(msg, to)
    elif backend == "file":
        _write_file(msg)
    else:
        _log(to, subject, text)


def _send_smtp(msg: EmailMessage, to: str) -> None:
    s = get_settings()
    try:
        client: smtplib.SMTP
        if s.smtp_port == SMTPS_PORT:
            client = smtplib.SMTP_SSL(
                s.smtp_host, s.smtp_port, timeout=TIMEOUT_SECONDS, context=ssl.create_default_context()
            )
        else:
            client = smtplib.SMTP(s.smtp_host, s.smtp_port, timeout=TIMEOUT_SECONDS)
        with client:
            if s.smtp_starttls and s.smtp_port != SMTPS_PORT:
                client.starttls(context=ssl.create_default_context())
            if s.smtp_username:
                password = s.smtp_password.get_secret_value() if s.smtp_password else ""
                client.login(s.smtp_username, password)
            client.send_message(msg)
    except (smtplib.SMTPException, OSError) as e:  # OSError: refused, timed out, TLS failures
        smtp_code = getattr(e, "smtp_code", None)
        log.warning(
            "email to %s was not sent: %s%s",
            destination_hint("email", to),
            type(e).__name__,
            f" ({smtp_code})" if smtp_code else "",
        )
        raise DeliveryError("The email could not be sent.") from e


def _write_file(msg: EmailMessage) -> None:
    folder = Path(get_settings().email_file_dir)
    name = f"{utcnow():%Y%m%dT%H%M%S%fZ}-{secrets.token_hex(3)}.eml"
    try:
        folder.mkdir(parents=True, exist_ok=True)
        (folder / name).write_bytes(msg.as_bytes(policy=SMTPUTF8))
    except OSError as e:
        log.warning("email could not be written to %s: %s", folder, type(e).__name__)
        raise DeliveryError("The email could not be saved.") from e


def _log(to: str, subject: str, text: str) -> None:
    s = get_settings()
    if s.env == "development":
        log.info("email (console backend) to %s\nSubject: %s\n\n%s", to, subject, text)
        return
    log.info("email (console backend, not delivered) to %s", destination_hint("email", to))
    if s.is_production:
        log.warning("DSBA_EMAIL_BACKEND is 'console' in production: emails are not delivered")
