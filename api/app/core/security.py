"""Sessions, the current user, roles and CSRF.

A signed-in browser holds two cookies:
  dsba_session  HttpOnly; a random token whose SHA-256 is a row in user_sessions.
  dsba_csrf     readable by the web app; every POST/PUT/PATCH/DELETE must echo it in X-CSRF-Token
                (double submit). The API sets it on any response that arrives without one.
Both are SameSite=Lax, and Secure in production (DSBA_COOKIE_SECURE=true)."""

from __future__ import annotations

import hashlib
import hmac
import secrets
from collections.abc import Awaitable, Callable
from datetime import datetime, timedelta
from typing import Annotated

from fastapi import Depends, Request, Response
from sqlalchemy import select
from sqlalchemy.orm import Session
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse
from starlette.types import ASGIApp

from app.config import Settings, get_settings
from app.core.errors import forbidden, unauthenticated
from app.core.time import utcnow
from app.db import get_db
from app.models import Role, User, UserSession, UserStatus

UNSAFE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
CSRF_HEADER = "X-CSRF-Token"
TOUCH_EVERY = timedelta(minutes=5)  # how often last_seen_at is written


def new_token(nbytes: int = 32) -> str:
    return secrets.token_urlsafe(nbytes)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def client_ip(request: Request, settings: Settings | None = None) -> str | None:
    s = settings or get_settings()
    if s.trust_proxy_headers:
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip() or None
    return request.client.host if request.client else None


# ── cookies ──────────────────────────────────────────────────────────────────────────────────


def set_session_cookie(response: Response, token: str, expires_at: datetime) -> None:
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


class CSRFMiddleware(BaseHTTPMiddleware):
    """Rejects unsafe /api requests whose X-CSRF-Token header does not match the dsba_csrf cookie."""

    def __init__(self, app: ASGIApp) -> None:
        super().__init__(app)

    async def dispatch(self, request: Request, call_next: Callable[[Request], Awaitable[Response]]) -> Response:
        s = get_settings()
        cookie = request.cookies.get(s.csrf_cookie)
        if request.method in UNSAFE_METHODS and request.url.path.startswith("/api/"):
            header = request.headers.get(CSRF_HEADER, "")
            if not cookie or not header or not hmac.compare_digest(cookie, header):
                resp: Response = JSONResponse(
                    {"error": {"code": "csrf_failed", "message": "Refresh the page and try again."}}, status_code=403
                )
                if not cookie:
                    _set_csrf_cookie(resp, new_token(24))
                return resp
        response = await call_next(request)
        if not cookie:
            _set_csrf_cookie(response, new_token(24))
        return response


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
    return user is not None and user.role in (Role.moderator, Role.admin)


def is_admin(user: User | None) -> bool:
    return user is not None and user.role == Role.admin


def get_moderator(user: Annotated[User, Depends(get_current_user)]) -> User:
    if not is_moderator(user):
        raise forbidden("Only student reps and admins can do this.")
    return user


def get_admin(user: Annotated[User, Depends(get_current_user)]) -> User:
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
