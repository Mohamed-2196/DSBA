"""The student's yes or no to an AI app, on the Hub's own page (/connect-ai), signed in with the Hub's cookie.

The app's /authorize request is checked by the MCP SDK (the app, its redirect URI, PKCE), then carried to the page
signed (HS256 with a key of its own drawn from the secret key) and valid for REQUEST_TTL, so nothing is stored until
the student answers. A yes makes the connection and its one-time code (store.connect); either answer sends the
student back to the app's redirect URI, as OAuth says."""

from __future__ import annotations

import hashlib
import hmac
from dataclasses import dataclass
from datetime import timedelta
from typing import Any
from urllib.parse import urlencode

import jwt
from mcp.server.auth.provider import AuthorizationParams, construct_redirect_uri
from mcp.shared.auth import OAuthClientInformationFull
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.errors import invalid
from app.core.time import utcnow
from app.models import User
from app.services.ai_apps import store

AUDIENCE = "dsba-ai-app-consent"
REQUEST_TTL = timedelta(minutes=15)
PAGE = "/connect-ai"
OUT_OF_DATE = "This link to connect an AI app is out of date. Start again from the AI app."


@dataclass(frozen=True)
class ConsentRequest:
    client_id: str
    redirect_uri: str
    redirect_uri_explicit: bool
    code_challenge: str
    state: str | None
    scopes: list[str]


def _key() -> bytes:
    secret = get_settings().secret_key.get_secret_value().encode()
    return hmac.new(secret, b"ai-app-consent", hashlib.sha256).digest()


def sign(client: OAuthClientInformationFull, params: AuthorizationParams) -> str:
    claims: dict[str, Any] = {
        "aud": AUDIENCE,
        "exp": utcnow() + REQUEST_TTL,
        "cid": client.client_id,
        "uri": str(params.redirect_uri),
        "exp_uri": params.redirect_uri_provided_explicitly,
        "pkce": params.code_challenge,
        "st": params.state,
        "sc": params.scopes or [store.SCOPE],
    }
    return jwt.encode(claims, _key(), algorithm="HS256")


def page_url(token: str) -> str:
    """Where /authorize sends the student: the Hub's page that asks them."""
    return f"{get_settings().web_base_url.rstrip('/')}{PAGE}?{urlencode({'request': token})}"


def read(token: str) -> ConsentRequest:
    """The signed request, or 422 invalid_input when it is out of date or not the Hub's."""
    try:
        c = jwt.decode(token, _key(), algorithms=["HS256"], audience=AUDIENCE)
    except jwt.PyJWTError:
        raise invalid("request", OUT_OF_DATE) from None
    return ConsentRequest(
        client_id=str(c["cid"]),
        redirect_uri=str(c["uri"]),
        redirect_uri_explicit=bool(c["exp_uri"]),
        code_challenge=str(c["pkce"]),
        state=c.get("st"),
        scopes=[str(s) for s in c["sc"]],
    )


@dataclass(frozen=True)
class Asking:
    request: ConsentRequest
    client: OAuthClientInformationFull


def asking(db: Session, token: str) -> Asking:
    """The request and the app behind it (422 when the app is gone)."""
    req = read(token)
    client = store.get_client(db, req.client_id)
    if client is None:
        raise invalid("request", OUT_OF_DATE)
    return Asking(req, client)


def answer(db: Session, user: User, token: str, *, allow: bool) -> str:
    """Where to send the student back: the app's redirect URI with a code (yes) or access_denied (no)."""
    a = asking(db, token)
    req = a.request
    if not allow:
        return construct_redirect_uri(
            req.redirect_uri,
            error="access_denied",
            error_description="The student said no.",
            state=req.state,
        )
    code = store.connect(
        db,
        user,
        a.client,
        redirect_uri=req.redirect_uri,
        redirect_uri_explicit=req.redirect_uri_explicit,
        code_challenge=req.code_challenge,
        scopes=req.scopes,
    )
    return construct_redirect_uri(req.redirect_uri, code=code, state=req.state)
