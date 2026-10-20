"""Fixtures for the accounts tests: captured emails, the mail worker, settings for one test, sign-in helpers, a fake
Google and a clock."""

from __future__ import annotations

import time
import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from datetime import timedelta
from typing import Any
from urllib.parse import parse_qs, urlsplit

import httpx
import httpx2
import jwt
import pytest
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient
from jwt.algorithms import RSAAlgorithm
from pydantic import SecretStr
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.models import Module, SignInAttempt, User, UserSession
from app.services import google, mailer
from app.services import outbox as mail_outbox
from tests.lessons import chapters

API = "/api/v1"
PASSWORD = "correct horse battery"  # passes the rules: long enough and not a common password


@dataclass
class Message:
    to: str
    subject: str | None
    text: str
    html: str | None = None


class Outbox(list[Message]):
    def to(self, address: str) -> list[Message]:
        return [m for m in self if m.to == address]


@pytest.fixture
def outbox(monkeypatch: pytest.MonkeyPatch) -> Outbox:
    """Every email the API sends during the test, instead of sending it."""
    box = Outbox()

    def send_email(to: str, subject: str, text: str, html: str | None = None) -> None:
        box.append(Message(to, subject, text, html))

    monkeypatch.setattr(mailer, "send_email", send_email)
    return box


Deliver = Callable[[], int]


@pytest.fixture
def deliver(db: Session, outbox: Outbox) -> Deliver:
    """deliver() runs the mail worker until nothing is due: the queued emails land in `outbox`. -> how many it
    handled (sent, cancelled or put off)."""

    @contextmanager
    def _session() -> Iterator[Session]:
        yield db  # the test's own session: rolled back afterwards

    return lambda: mail_outbox.drain(_session)


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


def sync_csrf(c: TestClient) -> None:
    """Signing in and out replaces the CSRF cookie; the web app reads it before each request, so do the same."""
    c.headers["X-CSRF-Token"] = c.cookies.get("dsba_csrf") or ""


def sign_up(c: TestClient, email: str, password: str = PASSWORD) -> httpx2.Response:
    r: httpx2.Response = c.post(f"{API}/auth/sign-up", json={"email": email, "password": password})
    sync_csrf(c)
    return r


def sign_in_with(c: TestClient, email: str, password: str = PASSWORD) -> httpx2.Response:
    r: httpx2.Response = c.post(f"{API}/auth/sign-in", json={"email": email, "password": password})
    sync_csrf(c)
    return r


def logout(c: TestClient) -> httpx2.Response:
    r: httpx2.Response = c.post(f"{API}/auth/logout")
    sync_csrf(c)
    return r


SignIn = Callable[..., tuple[TestClient, dict[str, Any]]]


@pytest.fixture
def sign_in(client_for: Callable[..., TestClient], db: Session) -> SignIn:
    """sign_in('a@b.com') -> (a browser signed in through the real flow, the SignInResult): it signs up when no
    account has the address, else signs in with `password`."""

    def _sign_in(
        email: str, client: TestClient | None = None, password: str = PASSWORD
    ) -> tuple[TestClient, dict[str, Any]]:
        c = client or client_for()
        known = db.scalar(select(User.id).where(User.email == email.lower())) is not None
        r = sign_in_with(c, email, password) if known else sign_up(c, email, password)
        assert r.status_code in (200, 201), r.text
        return c, r.json()

    return _sign_in


@pytest.fixture
def age(db: Session) -> Callable[..., None]:
    """age(seconds): moves every sign-in attempt that far into the past, as if the time had passed."""

    def _age(seconds: float) -> None:
        stmt = update(SignInAttempt).values(created_at=SignInAttempt.created_at - timedelta(seconds=seconds))
        db.execute(stmt.execution_options(synchronize_session="fetch"))
        db.commit()

    return _age


# ── a fake Google ─────────────────────────────────────────────────────────────────────────────

CLIENT_ID = "test-client.apps.googleusercontent.com"


@dataclass
class FakeGoogle:
    """Google's token endpoint and published keys, on a mock transport. `claims` go into the next ID token (with the
    nonce of the sign-in being finished); `token_status` and `token_body` replace the token endpoint's answer."""

    key: rsa.RSAPrivateKey = field(
        default_factory=lambda: rsa.generate_private_key(public_exponent=65537, key_size=2048)
    )
    kid: str = "test-key"
    claims: dict[str, Any] = field(default_factory=dict)
    token_status: int = 200
    token_body: dict[str, Any] | None = None
    token_requests: list[dict[str, list[str]]] = field(default_factory=list)
    key_fetches: int = 0
    nonce: str = ""

    def jwks(self) -> dict[str, Any]:
        public = RSAAlgorithm.to_jwk(self.key.public_key(), as_dict=True)
        return {"keys": [{**public, "kid": self.kid, "alg": "RS256", "use": "sig"}]}

    def id_token(self, key: rsa.RSAPrivateKey | None = None, **overrides: Any) -> str:
        now = int(time.time())
        claims: dict[str, Any] = {
            "iss": "https://accounts.google.com",
            "aud": CLIENT_ID,
            "sub": "google-sub-1",
            "email": "sara@gmail.com",
            "email_verified": True,
            "iat": now,
            "exp": now + 3600,
            "nonce": self.nonce,
            **self.claims,
            **overrides,
        }
        claims = {k: v for k, v in claims.items() if v is not None}
        return jwt.encode(claims, key or self.key, algorithm="RS256", headers={"kid": self.kid})

    def handle(self, request: httpx.Request) -> httpx.Response:
        if request.url == google.JWKS_URL:
            self.key_fetches += 1
            return httpx.Response(200, json=self.jwks())
        if request.url == google.TOKEN_URL:
            self.token_requests.append(parse_qs(request.content.decode()))
            body = self.token_body if self.token_body is not None else {"id_token": self.id_token()}
            return httpx.Response(self.token_status, json=body)
        return httpx.Response(404)


@pytest.fixture
def fake_google(monkeypatch: pytest.MonkeyPatch, settings: Settings) -> Iterator[FakeGoogle]:
    """ "Continue with Google" set up, with Google's endpoints faked."""
    fake = FakeGoogle()
    monkeypatch.setattr(settings, "google_client_id", CLIENT_ID)
    monkeypatch.setattr(settings, "google_client_secret", SecretStr("test-secret"))
    monkeypatch.setattr(google, "http_client", lambda: httpx.Client(transport=httpx.MockTransport(fake.handle)))
    google.KEYS.clear()
    yield fake
    google.KEYS.clear()


def google_start(c: TestClient, return_to: str = "/forum", path: str = "/auth/google") -> dict[str, str]:
    """POST /auth/google (or /me/google): -> the authorization URL's query (state, nonce, code_challenge...)."""
    r = c.post(f"{API}{path}", json={"returnTo": return_to})
    assert r.status_code == 200, r.text
    query = parse_qs(urlsplit(r.json()["url"]).query)
    return {k: v[0] for k, v in query.items()}


def google_callback(c: TestClient, state: str, code: str = "the-code", **extra: str) -> httpx2.Response:
    r: httpx2.Response = c.get(
        f"{API}/auth/google/callback", params={"state": state, "code": code, **extra}, follow_redirects=False
    )
    sync_csrf(c)
    return r


GoogleSignIn = Callable[..., httpx2.Response]


@pytest.fixture
def google_sign_in(fake_google: FakeGoogle, client_for: Callable[..., TestClient]) -> GoogleSignIn:
    """google_sign_in(c, sub=, email=, ...): the whole "Continue with Google" in browser `c`, with these claims in the
    ID token. -> the callback's answer (a 303 back to the app)."""

    def _go(c: TestClient, return_to: str = "/forum", path: str = "/auth/google", **claims: Any) -> httpx2.Response:
        query = google_start(c, return_to, path)
        fake_google.nonce = query["nonce"]
        fake_google.claims = claims
        return google_callback(c, query["state"])

    return _go


def unique_email() -> str:
    return f"student-{uuid.uuid4().hex[:8]}@example.com"


@pytest.fixture
def older_sessions(db: Session) -> Callable[..., None]:
    """older_sessions(minutes=11): makes every session that far older, past the step-up window (decision D2)."""

    def _older(minutes: float = 11) -> None:
        db.execute(
            update(UserSession)
            .values(created_at=UserSession.created_at - timedelta(minutes=minutes))
            .execution_options(synchronize_session="fetch")
        )
        db.commit()

    return _older


@pytest.fixture
def module(db: Session) -> Module:
    """A module with two chapters: two lessons, then one (tests.lessons.lesson_id(module, chapter, video))."""
    m_id = f"test-mod-{uuid.uuid4().hex[:6]}"
    m = Module(
        id=m_id,
        unit_code="TS1000",
        name="Test module",
        short_name="Test",
        year=1,
        description="",
        chapters=chapters(
            m_id,
            [
                {
                    "title": "One",
                    "videos": [{"kind": "youtube", "video_id": "a"}, {"kind": "youtube", "video_id": "b"}],
                },
                {"title": "Two", "videos": [{"kind": "youtube", "video_id": "c"}]},
            ],
        ),
    )
    db.add(m)
    db.commit()
    return m
