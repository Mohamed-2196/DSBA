"""Signed-in browsers. The dsba_session cookie holds a random token; its row only holds the token's SHA-256.

Sign-in always makes a new session (the browser's previous one is revoked) and a new CSRF cookie; sign-out revokes
the row and also replaces the CSRF cookie. A user keeps at most MAX_LIVE sessions (security review finding 16)."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from fastapi import Request, Response
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.security import _set_csrf_cookie, hash_token, new_token, set_session_cookie
from app.core.time import utcnow
from app.models import User, UserSession
from app.schemas.auth import SessionInfo
from app.services.ratelimit import request_ip

USER_AGENT_MAX = 300
MAX_LIVE = 20  # live sessions per user; the least recently used ones beyond that are revoked
CSRF_TOKEN_BYTES = 24  # as core.security makes them


def create(db: Session, user: User, request: Request, response: Response) -> UserSession:
    """A new session for `user`, with the cookie set on `response`. The caller commits."""
    now = utcnow()
    token = new_token()
    sess = UserSession(
        id=uuid.uuid4(),
        user_id=user.id,
        token_hash=hash_token(token),
        created_at=now,
        last_seen_at=now,
        expires_at=now + timedelta(days=get_settings().session_days),
        ip=request_ip(request),
        user_agent=user_agent(request),
    )
    db.add(sess)
    set_session_cookie(response, token, sess.expires_at)
    return sess


def user_agent(request: Request) -> str | None:
    raw = request.headers.get("user-agent", "")
    cleaned = "".join(ch for ch in raw if ch.isprintable())[:USER_AGENT_MAX].strip()
    return cleaned or None


def rotate_csrf(response: Response) -> None:
    """A fresh dsba_csrf cookie (at sign-in and sign-out). The web app reads the cookie before every request."""
    _set_csrf_cookie(response, new_token(CSRF_TOKEN_BYTES))


def revoke(sess: UserSession) -> None:
    if sess.revoked_at is None:
        sess.revoked_at = utcnow()


def revoke_others(db: Session, user_id: uuid.UUID, keep: UserSession | None) -> int:
    """Signs the user out everywhere except `keep` (after a change to how they sign in). -> sessions revoked."""
    others = [s for s in live(db, user_id) if keep is None or s.id != keep.id]
    for other in others:
        revoke(other)
    return len(others)


def cap(db: Session, user_id: uuid.UUID) -> None:
    """Revokes the least recently used live sessions beyond MAX_LIVE (call after flushing a new one)."""
    for old in live(db, user_id)[MAX_LIVE:]:
        revoke(old)


def purge(db: Session, user_id: uuid.UUID, now: datetime) -> None:
    """Deletes the user's sessions that can never be used again (expired or revoked)."""
    db.execute(
        delete(UserSession).where(
            UserSession.user_id == user_id,
            or_(UserSession.expires_at <= now, UserSession.revoked_at.is_not(None)),
        )
    )


def live(db: Session, user_id: uuid.UUID) -> list[UserSession]:
    """The user's sessions that still work, most recently used first."""
    now = utcnow()
    q = (
        select(UserSession)
        .where(UserSession.user_id == user_id, UserSession.revoked_at.is_(None), UserSession.expires_at > now)
        .order_by(func.coalesce(UserSession.last_seen_at, UserSession.created_at).desc(), UserSession.id)
    )
    return list(db.scalars(q))


def info(sess: UserSession, current: UserSession | None) -> SessionInfo:
    return SessionInfo(
        id=sess.id,
        created_at=sess.created_at,
        last_seen_at=sess.last_seen_at,
        user_agent=sess.user_agent,
        ip=str(sess.ip) if sess.ip is not None else None,
        current=current is not None and sess.id == current.id,
    )
