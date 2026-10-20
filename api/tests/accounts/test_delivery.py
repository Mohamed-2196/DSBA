"""Email delivery backends, and what they may log."""

from __future__ import annotations

import email
import email.policy
import logging
import smtplib
import socket
from collections.abc import Callable, Iterator
from email.message import Message
from pathlib import Path
from typing import Any, cast

import pytest
from pydantic import SecretStr

from app.services import mailer
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
    mailer.send_email("student@example.com", "A reply to your thread", "Sara replied.", "<p>Sara replied.</p>")
    [envelope] = received
    assert envelope.rcpt_tos == ["student@example.com"]
    msg: Message = email.message_from_bytes(envelope.original_content or envelope.content)
    assert msg["Subject"] == "A reply to your thread"
    assert msg["From"] == "DSBA Hub <no-reply@dsba-hub.local>"
    assert msg["Auto-Submitted"] == "auto-generated"
    parts = {
        p.get_content_type(): cast(bytes, p.get_payload(decode=True)).decode()
        for p in msg.walk()
        if not p.is_multipart()
    }
    assert "Sara replied." in parts["text/plain"]
    assert "<p>Sara replied.</p>" in parts["text/html"]


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
        mailer.send_email("someone@example.com", "A notice", "secret 654321")
    assert "s•••@example.com" in caplog.text
    assert "654321" not in caplog.text
    assert "someone@example.com" not in caplog.text


def test_file_backend_writes_an_eml(set_option: SetOption, tmp_path: Path) -> None:
    set_option("email_backend", "file")
    set_option("email_file_dir", str(tmp_path / "mail"))
    mailer.send_email("ünïcode@example.com", "A reply to your thread", "Someone replied.", "<p>x</p>")
    [path] = list((tmp_path / "mail").iterdir())
    assert path.suffix == ".eml"
    msg = email.message_from_bytes(path.read_bytes(), policy=email.policy.default)
    assert msg["Subject"] == "A reply to your thread"
    assert "ünïcode@example.com" in str(msg["To"])


@pytest.mark.parametrize(("env", "shows_message"), [("development", True), ("test", False), ("production", False)])
def test_console_backend_logs_messages_only_in_development(
    set_option: SetOption, caplog: pytest.LogCaptureFixture, env: str, shows_message: bool
) -> None:
    set_option("email_backend", "console")
    set_option("env", env)
    with caplog.at_level(logging.INFO, logger="dsba.mail"):
        mailer.send_email("dev@example.com", "A notice", "Message 222222.")
    assert ("222222" in caplog.text) is shows_message
    assert ("dev@example.com" in caplog.text) is shows_message
    assert "d•••@example.com" in caplog.text or shows_message


def test_header_injection_is_refused(set_option: SetOption) -> None:
    set_option("email_backend", "console")
    with pytest.raises(DeliveryError):
        mailer.send_email("a@example.com\nBcc: b@example.com", "Hi", "Hello")
