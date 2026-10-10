"""Email and text delivery backends, and what they may log."""

from __future__ import annotations

import base64
import email
import email.policy
import logging
import re
import smtplib
import socket
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from email.message import Message
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs

import httpx
import pytest
from pydantic import SecretStr

from app.models import OtpPurpose
from app.services import mailer, otp, sms
from app.services.mailer import DeliveryError

SetOption = Callable[[str, Any], None]


def _free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


# ── email ───────────────────────────────────────────────────────────────────────────────────


@pytest.fixture
def smtp_server() -> Iterator[tuple[int, list[Any]]]:
    """A real SMTP server on a free port; the envelopes it received."""
    from aiosmtpd.controller import Controller

    received: list[Any] = []

    class Handler:
        async def handle_DATA(self, server: Any, session: Any, envelope: Any) -> str:  # noqa: N802 - aiosmtpd's name
            received.append(envelope)
            return "250 OK"

    port = _free_port()
    controller = Controller(Handler(), hostname="127.0.0.1", port=port)
    controller.start()
    try:
        yield port, received
    finally:
        controller.stop()


def test_smtp_backend_sends_the_message(set_option: SetOption, smtp_server: tuple[int, list[Any]]) -> None:
    port, received = smtp_server
    set_option("email_backend", "smtp")
    set_option("smtp_host", "127.0.0.1")
    set_option("smtp_port", port)
    subject, text, html = otp.email_content("123456", OtpPurpose.sign_in)
    mailer.send_email("student@example.com", subject, text, html)
    [envelope] = received
    assert envelope.rcpt_tos == ["student@example.com"]
    msg: Message = email.message_from_bytes(envelope.original_content or envelope.content)
    assert msg["Subject"] == "Your DSBA Hub code: 123456"
    assert msg["From"] == "DSBA Hub <no-reply@dsba-hub.local>"
    assert msg["Auto-Submitted"] == "auto-generated"
    parts = {p.get_content_type(): p.get_payload(decode=True).decode() for p in msg.walk() if not p.is_multipart()}
    assert "Your DSBA Hub code is 123456." in parts["text/plain"]
    assert "123456" in parts["text/html"]


def test_smtp_backend_uses_starttls_and_login(set_option: SetOption, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[Any] = []

    class FakeSMTP:
        def __init__(self, host: str, port: int, timeout: float | None = None, **kw: Any) -> None:
            calls.append(("connect", host, port, timeout, type(self).__name__))

        def __enter__(self) -> FakeSMTP:
            return self

        def __exit__(self, *exc: object) -> None:
            calls.append("quit")

        def starttls(self, context: Any = None) -> None:
            calls.append("starttls")

        def login(self, user: str, password: str) -> None:
            calls.append(("login", user, password))

        def send_message(self, msg: Message) -> None:
            calls.append(("send", msg["To"]))

    class FakeSMTPSSL(FakeSMTP):
        pass

    monkeypatch.setattr(smtplib, "SMTP", FakeSMTP)
    monkeypatch.setattr(smtplib, "SMTP_SSL", FakeSMTPSSL)
    set_option("email_backend", "smtp")
    set_option("smtp_host", "smtp.example.com")
    set_option("smtp_port", 587)
    set_option("smtp_starttls", True)
    set_option("smtp_username", "apikey")
    set_option("smtp_password", SecretStr("s3cret"))
    mailer.send_email("a@example.com", "Hi", "Hello")
    assert calls == [
        ("connect", "smtp.example.com", 587, 10, "FakeSMTP"),
        "starttls",
        ("login", "apikey", "s3cret"),
        ("send", "a@example.com"),
        "quit",
    ]
    calls.clear()
    set_option("smtp_port", 465)
    mailer.send_email("a@example.com", "Hi", "Hello")
    assert calls[0] == ("connect", "smtp.example.com", 465, 10, "FakeSMTPSSL")
    assert "starttls" not in calls


def test_smtp_failure_is_a_delivery_error(set_option: SetOption, caplog: pytest.LogCaptureFixture) -> None:
    set_option("email_backend", "smtp")
    set_option("smtp_host", "127.0.0.1")
    set_option("smtp_port", _free_port())  # nothing listens there
    with caplog.at_level(logging.WARNING, logger="dsba.mail"), pytest.raises(DeliveryError):
        mailer.send_email("someone@example.com", "Your DSBA Hub code: 654321", "654321")
    assert "s•••@example.com" in caplog.text
    assert "654321" not in caplog.text
    assert "someone@example.com" not in caplog.text


def test_file_backend_writes_an_eml(set_option: SetOption, tmp_path: Path) -> None:
    set_option("email_backend", "file")
    set_option("email_file_dir", str(tmp_path / "mail"))
    mailer.send_email("ünïcode@example.com", "Your DSBA Hub code: 111111", "Your DSBA Hub code is 111111.", "<p>x</p>")
    [path] = list((tmp_path / "mail").iterdir())
    assert path.suffix == ".eml"
    msg = email.message_from_bytes(path.read_bytes(), policy=email.policy.default)
    assert msg["Subject"] == "Your DSBA Hub code: 111111"
    assert "ünïcode@example.com" in str(msg["To"])


@pytest.mark.parametrize(("env", "shows_message"), [("development", True), ("test", False), ("production", False)])
def test_console_backend_logs_codes_only_in_development(
    set_option: SetOption, caplog: pytest.LogCaptureFixture, env: str, shows_message: bool
) -> None:
    set_option("email_backend", "console")
    set_option("env", env)
    with caplog.at_level(logging.INFO, logger="dsba.mail"):
        mailer.send_email("dev@example.com", "Your DSBA Hub code: 222222", "Your DSBA Hub code is 222222.")
    assert ("222222" in caplog.text) is shows_message
    assert ("dev@example.com" in caplog.text) is shows_message
    assert "d•••@example.com" in caplog.text or shows_message


def test_header_injection_is_refused(set_option: SetOption) -> None:
    set_option("email_backend", "console")
    with pytest.raises(DeliveryError):
        mailer.send_email("a@example.com\nBcc: b@example.com", "Hi", "Hello")


# ── text messages ───────────────────────────────────────────────────────────────────────────


def test_sms_file_backend(set_option: SetOption, tmp_path: Path) -> None:
    set_option("sms_backend", "file")
    set_option("sms_file_dir", str(tmp_path / "sms"))
    sms.send_sms("+97333123456", "Your DSBA Hub code is 333333.")
    sms.send_sms("+97333123456", "Second")
    paths = sorted((tmp_path / "sms").iterdir())
    assert len(paths) == 2
    assert re.fullmatch(r"\d{8}T\d{12}Z-\+97333123456-[0-9a-f]{4}\.txt", paths[0].name)
    assert paths[0].read_text() == "Your DSBA Hub code is 333333.\n"


@pytest.mark.parametrize(("env", "shows_message"), [("development", True), ("production", False)])
def test_sms_console_backend(
    set_option: SetOption, caplog: pytest.LogCaptureFixture, env: str, shows_message: bool
) -> None:
    set_option("sms_backend", "console")
    set_option("env", env)
    with caplog.at_level(logging.INFO, logger="dsba.sms"):
        sms.send_sms("+97333123456", "Your DSBA Hub code is 444444.")
    assert ("444444" in caplog.text) is shows_message
    assert ("+97333123456" in caplog.text) is shows_message
    if not shows_message:
        assert "+973 •••• ••56" in caplog.text


@dataclass
class FakeTwilio:
    """What the Twilio backend sent, and how the fake answers (status and JSON, or a network error)."""

    requests: list[httpx.Request] = field(default_factory=list)
    status: int = 201
    body: dict[str, Any] = field(default_factory=lambda: {"sid": "SM123"})
    network_error: bool = False

    def handle(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.network_error:
            raise httpx.ConnectError("no route to host", request=request)
        return httpx.Response(self.status, json=self.body)


@pytest.fixture
def twilio(set_option: SetOption, monkeypatch: pytest.MonkeyPatch) -> FakeTwilio:
    fake = FakeTwilio()
    monkeypatch.setattr(sms, "http_client", lambda: httpx.Client(transport=httpx.MockTransport(fake.handle)))
    set_option("sms_backend", "twilio")
    set_option("twilio_account_sid", "AC0123456789")
    set_option("twilio_auth_token", SecretStr("token"))
    set_option("twilio_from", "+15005550006")
    return fake


def test_twilio_with_a_number(twilio: FakeTwilio) -> None:
    sms.send_sms("+97333123456", "Your DSBA Hub code is 555555.")
    [req] = twilio.requests
    assert req.method == "POST"
    assert str(req.url) == "https://api.twilio.com/2010-04-01/Accounts/AC0123456789/Messages.json"
    assert req.headers["Authorization"] == "Basic " + base64.b64encode(b"AC0123456789:token").decode()
    assert parse_qs(req.content.decode()) == {
        "To": ["+97333123456"],
        "Body": ["Your DSBA Hub code is 555555."],
        "From": ["+15005550006"],
    }


def test_twilio_with_a_messaging_service(twilio: FakeTwilio, set_option: SetOption) -> None:
    set_option("twilio_from", "MG0123456789abcdef")
    sms.send_sms("+97333123456", "Hi")
    form = parse_qs(twilio.requests[0].content.decode())
    assert form["MessagingServiceSid"] == ["MG0123456789abcdef"]
    assert "From" not in form


def test_twilio_refusal(twilio: FakeTwilio, caplog: pytest.LogCaptureFixture) -> None:
    twilio.status, twilio.body = 400, {"code": 21614, "message": "not a mobile number"}
    with caplog.at_level(logging.WARNING, logger="dsba.sms"), pytest.raises(DeliveryError):
        sms.send_sms("+97333123456", "Your DSBA Hub code is 666666.")
    assert "21614" in caplog.text
    assert "+973 •••• ••56" in caplog.text
    assert "+97333123456" not in caplog.text
    assert "666666" not in caplog.text


def test_twilio_network_error(twilio: FakeTwilio) -> None:
    twilio.network_error = True
    with pytest.raises(DeliveryError):
        sms.send_sms("+97333123456", "Hi")


def test_twilio_without_credentials(twilio: FakeTwilio, set_option: SetOption) -> None:
    set_option("twilio_auth_token", None)
    with pytest.raises(DeliveryError):
        sms.send_sms("+97333123456", "Hi")
    assert twilio.requests == []


def test_sms_text_mentions_the_expiry_and_the_web_otp_host(set_option: SetOption) -> None:
    set_option("otp_ttl_seconds", 60)
    set_option("web_base_url", "https://dsba-hub.example")
    assert (
        otp.sms_text("777777") == "Your DSBA Hub code is 777777. It expires in 1 minute.\n\n@dsba-hub.example #777777"
    )
