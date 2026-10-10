"""Sessions, the current user, roles, CSRF and the client's address.

A signed-in browser holds two cookies, named by DSBA_SESSION_COOKIE and DSBA_CSRF_COOKIE (in production
__Host-dsba_session and __Host-dsba_csrf: Secure, Path=/, no Domain, so no other host can set them):
  session  HttpOnly; a random token whose SHA-256 is a row in user_sessions.
  csrf     readable by the web app; every POST/PUT/PATCH/DELETE must echo it in X-CSRF-Token (double submit).
           With a session cookie the token must also be the one bound to that session,
           HMAC(secret, "csrf:" + SHA-256(session token)), so a cookie planted by someone else fails (finding 14).
           Without one (signing in), any matching pair passes.
CSRFMiddleware keeps the CSRF cookie in step: the bound token whenever a session cookie is sent or set (sign-in
rotates it), a fresh random one when the session cookie is cleared (sign-out). Both are SameSite=Lax."""

from __future__ import annotations

import hashlib
import hmac
import ipaddress
import secrets
from collections.abc import Sequence
from datetime import datetime, timedelta
from typing import Annotated

from fastapi import Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.datastructures import Headers
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import IPNetwork, Settings, get_settings
from app.core.errors import forbidden, unauthenticated
from app.core.time import utcnow
from app.db import get_db
from app.models import Role, User, UserSession, UserStatus

UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
CSRF_HEADER = "X-CSRF-Token"
CSRF_TOKEN_BYTES = 24  # random (unbound) tokens
TOUCH_EVERY = timedelta(minutes=5)  # how often last_seen_at is written

IPAddress = ipaddress.IPv4Address | ipaddress.IPv6Address


def new_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


# ── the client's address ─────────────────────────────────────────────────────────────────────


def _parse_ip(raw: str | None) -> IPAddress | None:
    """An IP address, or None for anything else. IPv4-mapped IPv6 comes back as IPv4; a zone ('%eth0') is dropped."""
    if not raw:
        return None
    try:
        addr = ipaddress.ip_address(raw.strip())
    except ValueError:
        return None
    if isinstance(addr, ipaddress.IPv6Address):
        if addr.ipv4_mapped is not None:
            return addr.ipv4_mapped
        if addr.scope_id:
            return ipaddress.IPv6Address(str(addr).split("%", 1)[0])
    return addr


def valid_ip(raw: str | None) -> str | None:
    """`raw` as a normalised IP address, or None when it isn't one (what an INET column may hold)."""
    addr = _parse_ip(raw)
    return str(addr) if addr is not None else None


def _trusted(addr: IPAddress, proxies: Sequence[IPNetwork]) -> bool:
    return any(addr in net for net in proxies)


def client_ip(request: Request) -> str | None:
    """The client's IP address (rate limits, sessions, the audit log), or None when it isn't known.

    The direct peer is the client, unless it is one of DSBA_TRUSTED_PROXIES (security review, finding 1). Then
    X-Forwarded-For is read from the right, since each proxy appends the address it got the request from, and the
    first address that isn't a trusted proxy is the client; whatever the client wrote further left is ignored. A
    value that isn't an IP address gives None, never a guess."""
    peer = _parse_ip(request.client.host if request.client else None)
    if peer is None:
        return None
    proxies = get_settings().trusted_proxies
    if not proxies or not _trusted(peer, proxies):
        return str(peer)
    hops = [h.strip() for h in ",".join(request.headers.getlist("x-forwarded-for")).split(",") if h.strip()]
    if not hops:
        return str(peer)
    for raw in reversed(hops):
        addr = _parse_ip(raw)
        if addr is None:
            return None
        if not _trusted(addr, proxies):
            return str(addr)
    return valid_ip(hops[0])  # every hop is a trusted proxy: the leftmost one is as far back as the chain goes


class ForwardedSchemeMiddleware:
    """Behind a trusted proxy that ends TLS, a request's scheme is the one the proxy received (X-Forwarded-Proto),
    so URLs the API builds itself (trailing-slash redirects) stay https. Only the scheme is taken from the proxy
    here; the client's address is client_ip()'s, read when needed."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] == "http":
            proxies = get_settings().trusted_proxies
            client = scope.get("client")
            peer = _parse_ip(client[0] if client else None)
            if proxies and peer is not None and _trusted(peer, proxies):
                proto = Headers(scope=scope).get("x-forwarded-proto", "").split(",")[-1].strip().lower()
                if proto in ("http", "https"):
                    scope = {**scope, "scheme": proto}
        await self.app(scope, receive, send)


# ── cookies ──────────────────────────────────────────────────────────────────────────────────


def set_session_cookie(response: Response, token: str, expires_at: datetime) -> None:
    """The session cookie (CSRFMiddleware sets the CSRF cookie bound to it on the same response)."""
    s = get_settings()
    response.set_cookie(
        s.session_cookie,
        token,
        max_age=max(0, int((expires_at - utcnow()).total_seconds())),
        httponly=True,
        secure=s.cookie_secure,
        samesite="lax",
        domain=s.cookie_domain,
        path="/",
    )


def clear_session_cookie(response: Response) -> None:
    """Deletes the session cookie (CSRFMiddleware puts a fresh, unbound CSRF cookie on the same response)."""
    s = get_settings()
    response.delete_cookie(s.session_cookie, path="/", domain=s.cookie_domain, secure=s.cookie_secure, httponly=True)


def _set_csrf_cookie(response: Response, token: str) -> None:
    s = get_settings()
    response.set_cookie(
        s.csrf_cookie,
        token,
        max_age=60 * 60 * 24 * 365,
        httponly=False,
        secure=s.cookie_secure,
        samesite="lax",
        domain=s.cookie_domain,
        path="/",
    )


def csrf_token_for(session_token: str) -> str:
    """The only CSRF token a request carrying this session cookie may send."""
    key = get_settings().secret_key.get_secret_value().encode()
    return hmac.new(key, b"csrf:" + hash_token(session_token).encode(), hashlib.sha256).hexdigest()


def csrf_matches(header: str, cookie: str | None, bound: str | None) -> bool:
    """Header and cookie are the same token, and, with a session, the session's own token."""
    if not header or not cookie or not hmac.compare_digest(header.encode(), cookie.encode()):
        return False
    return bound is None or hmac.compare_digest(header.encode(), bound.encode())


def _csrf_failed(cookie: str | None, bound: str | None) -> Response:
    resp: Response = JSONResponse(
        {"error": {"code": "csrf_failed", "message": "Refresh the page and try again."}}, status_code=403
    )
    # the right cookie comes with the refusal, so the web app can retry once
    if bound is not None and cookie != bound:
        _set_csrf_cookie(resp, bound)
    elif bound is None and not cookie:
        _set_csrf_cookie(resp, new_token(CSRF_TOKEN_BYTES))
    return resp


def _set_cookie_parts(value: bytes) -> tuple[str, str, str]:
    """'name=value; Max-Age=0; Path=/' -> ('name', 'value', 'max-age=0;path=/') (attributes lower-cased, no spaces)."""
    first, _, attrs = value.decode("latin-1").partition(";")
    name, _, cookie_value = first.partition("=")
    return name.strip(), cookie_value.strip(), attrs.lower().replace(" ", "")


def _csrf_header_value(token: str) -> bytes:
    resp = Response()
    _set_csrf_cookie(resp, token)
    return next(v for k, v in resp.raw_headers if k == b"set-cookie")


def _in_step(headers: list[tuple[bytes, bytes]], s: Settings, cookie: str | None, bound: str | None) -> None:
    """Makes the response's Set-Cookie headers leave the browser with the right CSRF cookie (edits `headers`)."""
    new_session: str | None = None  # the token a sign-in sets; "" when the response clears the cookie
    csrf_set = False
    for name, value in headers:
        if name.lower() != b"set-cookie":
            continue
        cname, cvalue, attrs = _set_cookie_parts(value)
        if cname == s.session_cookie:
            cleared = cvalue in ("", '""') or "max-age=0" in attrs
            new_session = "" if cleared else cvalue
        elif cname == s.csrf_cookie:
            csrf_set = True
    if new_session:  # signed in: the new session's own token, whatever the handler set
        headers[:] = [
            (k, v) for k, v in headers if not (k.lower() == b"set-cookie" and _set_cookie_parts(v)[0] == s.csrf_cookie)
        ]
        token: str | None = csrf_token_for(new_session)
    elif new_session == "" or csrf_set:  # signed out: a fresh random one, unless the handler set one
        token = None if csrf_set else new_token(CSRF_TOKEN_BYTES)
    elif bound is not None:
        token = bound if cookie != bound else None
    else:
        token = None if cookie else new_token(CSRF_TOKEN_BYTES)
    if token is not None:
        headers.append((b"set-cookie", _csrf_header_value(token)))


class CSRFMiddleware:
    """Rejects unsafe /api requests whose X-CSRF-Token header doesn't match the CSRF cookie (and, with a session
    cookie, the token bound to that session), and keeps the CSRF cookie in step with the session cookie."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        s = get_settings()
        request = Request(scope)
        cookie = request.cookies.get(s.csrf_cookie)
        session = request.cookies.get(s.session_cookie)
        bound = csrf_token_for(session) if session else None
        unsafe = request.method in UNSAFE_METHODS and request.url.path.startswith("/api/")
        if unsafe and not csrf_matches(request.headers.get(CSRF_HEADER, ""), cookie, bound):
            await _csrf_failed(cookie, bound)(scope, receive, send)
            return

        async def send_in_step(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = list(message.get("headers", []))
                _in_step(headers, s, cookie, bound)
                message["headers"] = headers
            await send(message)

        await self.app(scope, receive, send_in_step)


# ── the current user ─────────────────────────────────────────────────────────────────────────


def get_current_session(request: Request, db: Annotated[Session, Depends(get_db)]) -> UserSession | None:
    """The live session behind this request's cookie, or None. Touches last_seen_at at most every 5 minutes."""
    s = get_settings()
    token = request.cookies.get(s.session_cookie)
    if not token or len(token) > 200:
        return None
    now = utcnow()
    sess = db.scalar(select(UserSession).where(UserSession.token_hash == hash_token(token)))
    if sess is None or sess.revoked_at is not None or sess.expires_at <= now:
        return None
    if sess.last_seen_at is None or now - sess.last_seen_at > TOUCH_EVERY:
        sess.last_seen_at = now
        user = db.get(User, sess.user_id)
        if user is not None:
            user.last_seen_at = now
        db.commit()
    return sess


def get_optional_user(
    sess: Annotated[UserSession | None, Depends(get_current_session)], db: Annotated[Session, Depends(get_db)]
) -> User | None:
    return db.get(User, sess.user_id) if sess else None


def get_current_user(user: Annotated[User | None, Depends(get_optional_user)]) -> User:
    if user is None:
        raise unauthenticated()
    return user


def get_active_user(user: Annotated[User, Depends(get_current_user)]) -> User:
    """A signed-in user who may write (post, upload, react): not suspended, and with a profile."""
    if user.status == UserStatus.suspended:
        raise forbidden("Your account is suspended. Contact a student rep.")
    if not user.display_name:
        raise forbidden("Finish your profile first.")
    return user


def is_moderator(user: User | None) -> bool:
    """A student rep or an admin whose account is active. A suspended one has no powers left: they see and do
    what any student does (security review, finding 4)."""
    return user is not None and user.role in (Role.moderator, Role.admin) and user.status == UserStatus.active


def is_admin(user: User | None) -> bool:
    return user is not None and user.role == Role.admin and user.status == UserStatus.active


def get_moderator(user: Annotated[User, Depends(get_active_user)]) -> User:
    """A student rep or an admin, active and with a profile (403 otherwise)."""
    if not is_moderator(user):
        raise forbidden("Only student reps and admins can do this.")
    return user


def get_admin(user: Annotated[User, Depends(get_active_user)]) -> User:
    """An admin, active and with a profile (403 otherwise)."""
    if not is_admin(user):
        raise forbidden("Only admins can do this.")
    return user


# Shorthands for handler signatures
DB = Annotated[Session, Depends(get_db)]
OptionalUser = Annotated[User | None, Depends(get_optional_user)]
CurrentUser = Annotated[User, Depends(get_current_user)]
ActiveUser = Annotated[User, Depends(get_active_user)]
Moderator = Annotated[User, Depends(get_moderator)]
Admin = Annotated[User, Depends(get_admin)]
CurrentSession = Annotated[UserSession | None, Depends(get_current_session)]
