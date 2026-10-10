"""Fixtures for the accounts tests: captured emails and texts, settings for one test, sign-in helpers and a clock."""

from __future__ import annotations

import re
import uuid
from collections.abc import Callable
from dataclasses import dataclass
from datetime import timedelta
from typing import Any

import httpx
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import update
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.models import Module, OtpChallenge
from app.services import mailer, sms

API = "/api/v1"


@dataclass
class Message:
    channel: str  # 'email' | 'sms'
    to: str
    subject: str | None
    text: str
    html: str | None = None

    @property
    def code(self) -> str:
        found = re.search(r"\b(\d{6})\b", self.text)
        assert found, f"no code in {self.text!r}"
        return found.group(1)


class Outbox(list[Message]):
    def to(self, address: str) -> list[Message]:
        return [m for m in self if m.to == address]


@pytest.fixture
def outbox(monkeypatch: pytest.MonkeyPatch) -> Outbox:
    """Every email and text the API sends during the test, instead of sending it."""
    box = Outbox()

    def send_email(to: str, subject: str, text: str, html: str | None = None) -> None:
        box.append(Message("email", to, subject, text, html))

    def send_sms(to: str, text: str) -> None:
        box.append(Message("sms", to, None, text))

    monkeypatch.setattr(mailer, "send_email", send_email)
    monkeypatch.setattr(sms, "send_sms", send_sms)
    return box


@pytest.fixture
def settings() -> Settings:
    return get_settings()


@pytest.fixture
def set_option(monkeypatch: pytest.MonkeyPatch, settings: Settings) -> Callable[[str, Any], None]:
    """Changes a setting for one test."""

    def _set(name: str, value: Any) -> None:
        assert name in type(settings).model_fields, f"no setting called {name}"
        monkeypatch.setattr(settings, name, value)

    return _set


def start(c: TestClient, identifier: str) -> httpx.Response:
    return c.post(f"{API}/auth/otp", json={"identifier": identifier})


def sync_csrf(c: TestClient) -> None:
    """Sign-in and sign-out replace the CSRF cookie; the web app reads it before each request, so do the same."""
    c.headers["X-CSRF-Token"] = c.cookies.get("dsba_csrf") or ""


def verify(c: TestClient, challenge_id: str, code: str) -> httpx.Response:
    r = c.post(f"{API}/auth/otp/verify", json={"challengeId": challenge_id, "code": code})
    sync_csrf(c)
    return r


def logout(c: TestClient) -> httpx.Response:
    r = c.post(f"{API}/auth/logout")
    sync_csrf(c)
    return r


def wrong(code: str) -> str:
    return f"{(int(code) + 1) % 1_000_000:06d}"


SignIn = Callable[..., tuple[TestClient, dict[str, Any]]]


@pytest.fixture
def sign_in(client_for: Callable[..., TestClient], outbox: Outbox) -> SignIn:
    """sign_in('a@b.com') -> (a browser signed in through the real flow, the SignInResult)."""

    def _sign_in(identifier: str, client: TestClient | None = None) -> tuple[TestClient, dict[str, Any]]:
        c = client or client_for()
        r = start(c, identifier)
        assert r.status_code == 202, r.text
        r2 = verify(c, r.json()["challengeId"], outbox[-1].code)
        assert r2.status_code == 200, r2.text
        return c, r2.json()

    return _sign_in


@pytest.fixture
def age(db: Session) -> Callable[..., None]:
    """age(seconds, identifier=None): moves challenges that far into the past, as if the time had passed."""

    def _age(seconds: float, identifier: str | None = None) -> None:
        delta = timedelta(seconds=seconds)
        stmt = update(OtpChallenge).values(
            created_at=OtpChallenge.created_at - delta, expires_at=OtpChallenge.expires_at - delta
        )
        if identifier is not None:
            stmt = stmt.where(OtpChallenge.identifier == identifier)
        db.execute(stmt.execution_options(synchronize_session="fetch"))
        db.commit()

    return _age


@pytest.fixture
def module(db: Session) -> Module:
    """A module with two chapters: lessons test-mod:0:0, test-mod:0:1 and test-mod:1:0."""
    m = Module(
        id=f"test-mod-{uuid.uuid4().hex[:6]}",
        unit_code="TS1000",
        name="Test module",
        short_name="Test",
        year=1,
        description="",
        resources={},
        chapters=[
            {"title": "One", "videos": [{"kind": "youtube", "id": "a"}, {"kind": "youtube", "id": "b"}]},
            {"title": "Two", "videos": [{"kind": "youtube", "id": "c"}]},
        ],
    )
    db.add(m)
    db.commit()
    return m
