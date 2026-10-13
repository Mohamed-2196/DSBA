"""Signed-in browsers. The session cookie holds a random token; its row only holds the token's SHA-256.

Sign-in always makes a new session (the browser's previous one is revoked); core.security's CSRF middleware gives
the browser the CSRF cookie bound to it, and a fresh one when the session cookie is cleared. A user keeps at most
MAX_LIVE sessions (security review finding 16).

Step-up (decision D2): changing or removing an email address or phone number, and deleting the account,
need a session that started less than STEP_UP_WINDOW ago: a sign-in, or a renewal after a code sent to one of the
account's own identifiers (POST /me/step-up). A session alone, however old, is not enough."""

from __future__ import annotations

import uuid
from datetime import datetime, timedelta

from fastapi import Request, Response
from sqlalchemy import delete, func, or_, select
from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.errors import ApiError
from app.core.security import client_ip, hash_token, new_token, set_session_cookie
from app.core.time import utcnow
from app.models import User, UserSession
from app.schemas.auth import SessionInfo

USER_AGENT_MAX = 300
MAX_LIVE = 20  # live sessions per user; the least recently used ones beyond that are revoked
RETENTION = timedelta(days=30)  # ended sessions are kept this long (who signed in from where), as `cli sweep` does
STEP_UP_WINDOW = timedelta(minutes=10)


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
        ip=client_ip(request),
        user_agent=user_agent(request),
    )
    db.add(sess)
    set_session_cookie(response, token, sess.expires_at)
    return sess


def renew(db: Session, user: User, current: UserSession | None, request: Request, response: Response) -> UserSession:
    """Replaces this browser's session with a new one (sign-in, step-up): revokes the old row, creates the new one,
    tidies up and keeps the user under MAX_LIVE sessions. The caller commits."""
    if current is not None:
        revoke(current)
    db.flush()
    purge(db, user.id, utcnow())
    sess = create(db, user, request, response)
    db.flush()
    cap(db, user.id)
    return sess


def user_agent(request: Request) -> str | None:
    raw = request.headers.get("user-agent", "")
    cleaned = "".join(ch for ch in raw if ch.isprintable())[:USER_AGENT_MAX].strip()
    return cleaned or None


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
    """Deletes the user's sessions that ended (expired or revoked) more than RETENTION ago."""
    ended = now - RETENTION
    db.execute(
        delete(UserSession).where(
            UserSession.user_id == user_id,
            or_(UserSession.expires_at < ended, UserSession.revoked_at < ended),
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


def step_up_left(sess: UserSession | None) -> int:
    """Seconds this session may still change identifiers or delete the account without another code (0: none)."""
    if sess is None:
        return 0
    left = sess.created_at + STEP_UP_WINDOW - utcnow()
    return max(0, int(left.total_seconds()))


def require_step_up(sess: UserSession | None) -> None:
    """403 step_up_required unless this session started less than STEP_UP_WINDOW ago (decision D2)."""
    if step_up_left(sess) <= 0:
        raise ApiError(
            403,
            "step_up_required",
            "For your security, confirm it's you first: we'll send a code to your email address or phone number.",
        )


def info(sess: UserSession, current: UserSession | None) -> SessionInfo:
    return SessionInfo(
        id=sess.id,
        created_at=sess.created_at,
        last_seen_at=sess.last_seen_at,
        user_agent=sess.user_agent,
        ip=str(sess.ip) if sess.ip is not None else None,
        current=current is not None and sess.id == current.id,
    )
