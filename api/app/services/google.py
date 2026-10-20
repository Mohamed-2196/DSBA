"""Continue with Google: OpenID Connect's authorization-code flow with PKCE, run by the server.

1. start() stores a GoogleLogin (the state's SHA-256, a nonce, a PKCE verifier, where to go back to) and answers with
   Google's authorization URL; the router also puts the state in a short-lived cookie of this browser.
2. Google sends the browser back to /auth/google/callback with `code` and `state`. finish() takes the login once
   (the state must match the cookie and an unused, unexpired row), swaps the code and the verifier for tokens at
   Google's token endpoint (with the client secret), and checks the ID token: its RS256 signature against Google's
   published keys (JWKS, cached), `iss`, `aud` (our client id), `exp` and `iat`, the nonce, and `email_verified`.

Every failure after the redirect is a GoogleFlowError carrying one of schemas.auth.GoogleError; nothing about it
reaches the browser but that code. The client secret and the tokens are never logged."""

from __future__ import annotations

import base64
import hashlib
import hmac
import logging
import threading
import time
import uuid
from dataclasses import dataclass
from datetime import timedelta
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit

import httpx
import jwt
from fastapi import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.config import HOST_PREFIX, get_settings
from app.core.errors import ApiError, not_found, rate_limited
from app.core.security import hash_token, new_token
from app.core.time import utcnow
from app.models import GoogleIntent, GoogleLogin, User
from app.schemas.auth import GoogleError
from app.services.identifiers import normalize_email
from app.services.ratelimit import human_wait, in_ip_bucket, ip_bucket, lock, window_wait

log = logging.getLogger("dsba.google")

AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth"
TOKEN_URL = "https://oauth2.googleapis.com/token"  # noqa: S105 - an endpoint, not a secret
JWKS_URL = "https://www.googleapis.com/oauth2/v3/certs"
ISSUERS = ("https://accounts.google.com", "accounts.google.com")
CALLBACK_PATH = "/api/v1/auth/google/callback"
HOUR = timedelta(hours=1)
LOGIN_TTL = timedelta(minutes=10)
STARTS_PER_NETWORK_PER_HOUR = 60
KEEP_LOGINS = timedelta(days=1)  # the sweep deletes older rows
JWKS_TTL_SECONDS = 3600
LEEWAY_SECONDS = 60  # clock skew allowed on exp and iat
TIMEOUT_SECONDS = 10
RETURN_MAX = 512
SECRET_PARAMS = frozenset({"token", "reset", "code", "state", "autherror"})


class GoogleFlowError(Exception):
    def __init__(self, code: GoogleError, detail: str = "") -> None:
        super().__init__(detail or code)
        self.code: GoogleError = code


@dataclass(frozen=True)
class GoogleIdentity:
    sub: str  # Google's stable id for the person
    email: str  # normalised, and verified by Google


@dataclass(frozen=True)
class Finished:
    identity: GoogleIdentity
    intent: GoogleIntent
    user_id: uuid.UUID | None  # linking: the account that started it
    return_to: str


# ── the state's cookie ──────────────────────────────────────────────────────────────────────


def cookie_name() -> str:
    """dsba_google, or __Host-dsba_google where the session cookie is a __Host- one (production)."""
    return f"{HOST_PREFIX}dsba_google" if get_settings().session_cookie.startswith(HOST_PREFIX) else "dsba_google"


def set_state_cookie(response: Response, state: str) -> None:
    """The state, for this browser only: HttpOnly, and SameSite=Lax, which Google's redirect back (a top-level GET)
    still carries."""
    s = get_settings()
    max_age = int(LOGIN_TTL.total_seconds())
    response.set_cookie(
        cookie_name(), state, max_age=max_age, httponly=True, secure=s.cookie_secure, samesite="lax", path="/"
    )


def clear_state_cookie(response: Response) -> None:
    response.delete_cookie(cookie_name(), path="/", secure=get_settings().cookie_secure, httponly=True)


# ── where to go back to ─────────────────────────────────────────────────────────────────────


def safe_return(raw: str | None) -> str:
    """A path in the app to go back to: only a same-origin relative path ('/forum?x=1'), never another site
    ('//evil.example', '/\\evil.example', 'https://...'), the API, or anything with control characters ('/'
    instead). The fragment and any secret-looking parameter (SECRET_PARAMS: a reset link's token, OAuth's code and
    state) are dropped, so nothing one-time travels to Google and back."""
    if not raw or len(raw) > RETURN_MAX or not raw.startswith("/") or raw.startswith(("//", "/\\")):
        return "/"
    if any(ord(ch) < 0x20 or ch in "\\\x7f" for ch in raw):
        return "/"
    parts = urlsplit(raw)
    if parts.scheme or parts.netloc or parts.path.startswith("/api/"):
        return "/"
    kept = [(k, v) for k, v in parse_qsl(parts.query, keep_blank_values=True) if k.lower() not in SECRET_PARAMS]
    return f"{parts.path}?{urlencode(kept)}" if kept else parts.path


def with_error(return_to: str, code: GoogleError) -> str:
    """`return_to` with ?authError=<code> added: the app shows what went wrong, then drops it from the address."""
    parts = urlsplit(return_to)
    query = f"{parts.query}&" if parts.query else ""
    fragment = f"#{parts.fragment}" if parts.fragment else ""
    return f"{parts.path}?{query}{urlencode({'authError': code})}{fragment}"


# ── starting ────────────────────────────────────────────────────────────────────────────────


def redirect_uri() -> str:
    return get_settings().web_base_url.rstrip("/") + CALLBACK_PATH


def _challenge(verifier: str) -> str:
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode("ascii")


def start(db: Session, *, intent: GoogleIntent, user: User | None, return_to: str, ip: str | None) -> tuple[str, str]:
    """Stores a login and returns (Google's authorization URL, the state for this browser's cookie). The caller
    commits. Errors: not_found (404: not set up on this hub), rate_limited (429: too many from this network)."""
    s = get_settings()
    if not s.google_enabled or s.google_client_id is None:
        raise not_found("Continue with Google isn't set up on this hub. Use your email address and password.")
    now = utcnow()
    lock(db, f"google-ip:{ip_bucket(ip)}")
    where = [in_ip_bucket(GoogleLogin.ip, ip)]
    wait = window_wait(db, GoogleLogin.created_at, where, limit=STARTS_PER_NETWORK_PER_HOUR, window=HOUR, now=now)
    if wait:
        raise rate_limited(wait, f"Too many tries from this network. Try again in {human_wait(wait)}.")
    state, nonce, verifier = new_token(), new_token(), new_token(48)
    db.add(
        GoogleLogin(
            state_hash=hash_token(state),
            nonce=nonce,
            code_verifier=verifier,
            intent=intent,
            user_id=user.id if user is not None else None,
            return_to=safe_return(return_to),
            ip=ip,
            created_at=now,
            expires_at=now + LOGIN_TTL,
        )
    )
    params = {
        "client_id": s.google_client_id,
        "redirect_uri": redirect_uri(),
        "response_type": "code",
        "scope": "openid email",
        "state": state,
        "nonce": nonce,
        "code_challenge": _challenge(verifier),
        "code_challenge_method": "S256",
        "prompt": "select_account",
    }
    if user is not None:
        params["login_hint"] = user.email
    return f"{AUTHORIZE_URL}?{urlencode(params)}", state


# ── finishing ───────────────────────────────────────────────────────────────────────────────


def take_login(db: Session, state: str | None, cookie_state: str | None) -> GoogleLogin:
    """The login this callback finishes, marked used (and committed) so it never works twice. Raises GoogleFlowError
    google_failed when the state is missing, isn't this browser's, is unknown, used or expired."""
    if (
        not state
        or not cookie_state
        or len(state) > 200
        or not hmac.compare_digest(state.encode(), cookie_state.encode())
    ):
        raise GoogleFlowError("google_failed", "the state doesn't match this browser's")
    login = db.scalar(select(GoogleLogin).where(GoogleLogin.state_hash == hash_token(state)).with_for_update())
    now = utcnow()
    if login is None or login.used_at is not None or login.expires_at <= now:
        raise GoogleFlowError("google_failed", "the state is unknown, used or expired")
    login.used_at = now
    db.commit()
    return login


def finish(db: Session, login: GoogleLogin, *, code: str | None, error: str | None) -> Finished:
    """Swaps the code for tokens and checks the ID token. Raises GoogleFlowError."""
    if error is not None:
        raise GoogleFlowError("google_cancelled" if error == "access_denied" else "google_failed", f"Google: {error}")
    if not code or len(code) > 2048:
        raise GoogleFlowError("google_failed", "no code")
    token = exchange(code, login.code_verifier)
    identity = verify_id_token(token, nonce=login.nonce)
    return Finished(identity=identity, intent=login.intent, user_id=login.user_id, return_to=login.return_to)


def http_client() -> httpx.Client:
    """The client for Google's endpoints (the tests replace it with one on a mock transport)."""
    return httpx.Client(timeout=TIMEOUT_SECONDS)


def exchange(code: str, verifier: str) -> str:
    """The ID token for this authorization code (Google's token endpoint)."""
    s = get_settings()
    if s.google_client_id is None or s.google_client_secret is None:
        raise GoogleFlowError("google_off", "the settings went away")
    data = {
        "code": code,
        "client_id": s.google_client_id,
        "client_secret": s.google_client_secret.get_secret_value(),
        "redirect_uri": redirect_uri(),
        "grant_type": "authorization_code",
        "code_verifier": verifier,
    }
    try:
        with http_client() as client:
            r = client.post(TOKEN_URL, data=data, headers={"Accept": "application/json"})
        body: Any = r.json()
    except (httpx.HTTPError, ValueError) as e:
        raise GoogleFlowError("google_failed", f"token endpoint: {type(e).__name__}") from e
    if r.status_code != httpx.codes.OK or not isinstance(body, dict) or not isinstance(body.get("id_token"), str):
        reason = body.get("error") if isinstance(body, dict) else None
        raise GoogleFlowError("google_failed", f"token endpoint answered {r.status_code} {reason or ''}".strip())
    token: str = body["id_token"]
    return token


class _Keys:
    """Google's signing keys, fetched when first needed and again after an hour or when a token names a key they
    don't hold (Google rotates them)."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._keys: dict[str, jwt.PyJWK] = {}
        self._fetched = 0.0

    def get(self, kid: str) -> jwt.PyJWK:
        with self._lock:
            stale = time.monotonic() - self._fetched > JWKS_TTL_SECONDS
            if stale or kid not in self._keys:
                self._keys = _fetch_keys()
                self._fetched = time.monotonic()
            key = self._keys.get(kid)
        if key is None:
            raise GoogleFlowError("google_failed", "the ID token names a key Google doesn't publish")
        return key

    def clear(self) -> None:
        with self._lock:
            self._keys, self._fetched = {}, 0.0


def _fetch_keys() -> dict[str, jwt.PyJWK]:
    try:
        with http_client() as client:
            r = client.get(JWKS_URL)
            r.raise_for_status()
        jwks = jwt.PyJWKSet.from_dict(r.json())
    except (httpx.HTTPError, ValueError, jwt.PyJWKSetError) as e:
        raise GoogleFlowError("google_failed", f"Google's keys: {type(e).__name__}") from e
    return {k.key_id: k for k in jwks.keys if k.key_id is not None}


KEYS = _Keys()


def verify_id_token(token: str, *, nonce: str) -> GoogleIdentity:
    """Checks Google's ID token and returns who it vouches for. Raises GoogleFlowError: google_failed (signature, iss,
    aud, exp, iat, nonce or claims), google_unverified (email_verified isn't true)."""
    client_id = get_settings().google_client_id
    try:
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        if header.get("alg") != "RS256" or not isinstance(kid, str):
            raise GoogleFlowError("google_failed", "the ID token isn't signed with RS256")
        claims: dict[str, Any] = jwt.decode(
            token,
            KEYS.get(kid),
            algorithms=["RS256"],
            audience=client_id,
            issuer=ISSUERS,
            leeway=LEEWAY_SECONDS,
            options={"require": ["exp", "iat", "iss", "aud", "sub"]},
        )
    except jwt.PyJWTError as e:
        raise GoogleFlowError("google_failed", f"ID token: {type(e).__name__}") from e
    sent = claims.get("nonce")
    if not isinstance(sent, str) or not hmac.compare_digest(sent.encode(), nonce.encode()):
        raise GoogleFlowError("google_failed", "the nonce doesn't match")
    sub, email = claims.get("sub"), claims.get("email")
    if not isinstance(sub, str) or not sub or not isinstance(email, str):
        raise GoogleFlowError("google_failed", "no sub or email")
    if claims.get("email_verified") is not True:
        raise GoogleFlowError("google_unverified")
    try:
        normalised = normalize_email(email)
    except ApiError as e:  # an address Google verified but we can't read
        raise GoogleFlowError("google_failed", "the email address can't be read") from e
    return GoogleIdentity(sub=sub, email=normalised)
