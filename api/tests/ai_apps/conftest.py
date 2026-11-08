"""Fixtures for AI apps: the mcp switch on, the catalogue of modules, and an AI app that goes through the whole
OAuth flow (register, authorize, the student's yes, token) and calls the MCP server as a JSON-RPC client would."""

from __future__ import annotations

import base64
import hashlib
import secrets
from collections.abc import Callable, Iterator
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import parse_qs, urlsplit

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Module, User

API = "/api/v1"
MCP = "/api/mcp"
RESOURCE = "http://127.0.0.1:5173/api/mcp"  # the tests' DSBA_WEB_BASE_URL + /api/mcp
REDIRECT = "https://claude.ai/api/mcp/auth_callback"
PROTOCOL = "2025-06-18"
ClientFor = Callable[..., TestClient]
MakeUser = Callable[..., User]


def pkce() -> tuple[str, str]:
    verifier = secrets.token_urlsafe(48)
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip("=")
    return verifier, challenge


def query(url: str) -> dict[str, str]:
    return {k: v[0] for k, v in parse_qs(urlsplit(url).query).items()}


@dataclass
class AiApp:
    """An AI app: its own HTTP client, with none of the Hub's cookies and no CSRF header."""

    c: TestClient
    client_id: str = ""
    secret: str | None = None
    verifier: str = ""
    ids: list[int] = field(default_factory=lambda: [0])

    def register(self, **fields: Any) -> Any:
        body = {
            "redirect_uris": [REDIRECT],
            "client_name": "Claude",
            "token_endpoint_auth_method": "none",
            "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"],
            **fields,
        }
        r = self.c.post(f"{MCP}/register", json=body)
        if r.status_code == 201:
            self.client_id = r.json()["client_id"]
            self.secret = r.json().get("client_secret")
        return r

    def authorize(self, *, scope: str | None = "hub:read", resource: str | None = RESOURCE, state: str = "st-1") -> Any:
        self.verifier, challenge = pkce()
        params = {
            "response_type": "code",
            "client_id": self.client_id,
            "redirect_uri": REDIRECT,
            "code_challenge": challenge,
            "code_challenge_method": "S256",
            "state": state,
        }
        if scope is not None:
            params["scope"] = scope
        if resource is not None:
            params["resource"] = resource
        return self.c.get(f"{MCP}/authorize", params=params, follow_redirects=False)

    def _auth(self) -> dict[str, str]:
        return {"client_id": self.client_id, **({"client_secret": self.secret} if self.secret else {})}

    def token(self, code: str, verifier: str | None = None) -> Any:
        data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": REDIRECT,
            "code_verifier": verifier or self.verifier,
            "resource": RESOURCE,
            **self._auth(),
        }
        return self.c.post(f"{MCP}/token", data=data)

    def refresh(self, refresh_token: str) -> Any:
        data = {"grant_type": "refresh_token", "refresh_token": refresh_token, **self._auth()}
        return self.c.post(f"{MCP}/token", data=data)

    def revoke(self, token: str) -> Any:
        # mcp 2.3's revocation request requires the client_secret field even from a public client: empty then
        return self.c.post(f"{MCP}/revoke", data={"token": token, "client_secret": "", **self._auth()})

    def rpc(self, token: str | None, method: str, params: dict[str, Any] | None = None) -> Any:
        self.ids[0] += 1
        headers = {"Accept": "application/json, text/event-stream", "MCP-Protocol-Version": PROTOCOL}
        if token is not None:
            headers["Authorization"] = f"Bearer {token}"
        body: dict[str, Any] = {"jsonrpc": "2.0", "id": self.ids[0], "method": method}
        if params is not None:
            body["params"] = params
        return self.c.post(MCP, json=body, headers=headers)

    def call(self, token: str, tool: str, **arguments: Any) -> dict[str, Any]:
        """The tool's result: {"isError": ..., "structuredContent": ..., "content": [...]}."""
        r = self.rpc(token, "tools/call", {"name": tool, "arguments": arguments})
        assert r.status_code == 200, r.text
        result: dict[str, Any] = r.json()["result"]
        return result


@pytest.fixture(autouse=True)
def mcp_on(set_feature: Callable[..., None]) -> None:
    set_feature("mcp", "everyone")


@pytest.fixture
def modules(db: Session) -> dict[str, Module]:
    from app.seed.loader import load_modules

    load_modules(db)
    db.commit()
    return {m.id: m for m in db.scalars(select(Module))}


@pytest.fixture
def ai_app(app: FastAPI) -> Iterator[Callable[[], AiApp]]:
    made: list[TestClient] = []

    def _make() -> AiApp:
        c = TestClient(app)
        c.__enter__()
        made.append(c)
        return AiApp(c)

    yield _make
    for c in made:
        c.__exit__(None, None, None)


Connect = Callable[..., tuple[AiApp, dict[str, Any]]]


@pytest.fixture
def connect(ai_app: Callable[[], AiApp], client_for: ClientFor) -> Connect:
    """connect(student) -> (the app, its tokens): registered, authorized, the student said yes, code exchanged."""

    def _connect(student: User, app: AiApp | None = None) -> tuple[AiApp, dict[str, Any]]:
        app = app or ai_app()
        if not app.client_id:
            assert app.register().status_code == 201
        r = app.authorize()
        assert r.status_code == 302, r.text
        request = query(r.headers["location"])["request"]
        browser = client_for(student)
        assert browser.get(f"{API}/ai-apps/consent", params={"request": request}).status_code == 200
        answer = browser.post(f"{API}/ai-apps/consent", json={"request": request, "allow": True})
        assert answer.status_code == 200, answer.text
        back = query(answer.json()["redirectUrl"])
        assert back["state"] == "st-1"
        tokens = app.token(back["code"])
        assert tokens.status_code == 200, tokens.text
        return app, tokens.json()

    return _connect
