"""The apps that registered, students' connections to them, their codes and tokens, and the per-student call limit.

Codes and tokens are random (security.new_token) and kept only as their SHA-256 hashes, as sessions are. A code is
spent the first time it is read, whatever happens next. A refresh token is replaced by a new one each time it is
used, and removing a connection removes everything it holds, so its app is signed out at its next call."""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any
from urllib.parse import urlsplit

from mcp.server.auth.provider import AccessToken, AuthorizationCode, RefreshToken, TokenError
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken
from pydantic import AnyUrl
from sqlalchemy import delete, exists, select
from sqlalchemy.orm import Session

from app.core.access import Feature
from app.core.errors import not_found, rate_limited
from app.core.security import hash_token, new_token
from app.core.time import utcnow
from app.models import AiAppCall, AiAppClient, AiAppCode, AiAppConnection, AiAppToken, User, UserStatus
from app.services import access, ratelimit

SCOPE = "hub:read"  # the only scope: every tool reads, none writes
ACCESS_TTL = timedelta(hours=1)
REFRESH_TTL = timedelta(days=30)
CODE_TTL = timedelta(minutes=5)
REGISTRATIONS_PER_HOUR = 20  # per address: anyone may register an app
UNUSED_CLIENT_TTL = timedelta(days=1)  # an app nobody connected within a day of registering is removed
CALLS_PER_WINDOW = 60
CALL_WINDOW = timedelta(minutes=10)
CALLS_PER_DAY = 500
TOUCH_EVERY = timedelta(minutes=5)  # how often a connection's last_used_at is written
APP_NAME_MAX = 100
UNNAMED_APP = "An AI app"


# ── apps ─────────────────────────────────────────────────────────────────────────────────────


def register_client(db: Session, info: OAuthClientInformationFull, ip: str | None) -> None:
    """Keeps an app that registered itself: at most REGISTRATIONS_PER_HOUR per address (429 rate_limited), and
    apps registered over a day ago that no student connected are removed first."""
    ratelimit.enforce(
        db,
        f"ai-apps:register:{ratelimit.ip_bucket(ip)}",
        AiAppClient.created_at,
        [ratelimit.in_ip_bucket(AiAppClient.ip, ip)],
        limit=REGISTRATIONS_PER_HOUR,
        window=timedelta(hours=1),
        message="Too many AI apps registered from this address. Try again in {}.",
    )
    unused = ~exists().where(AiAppConnection.client_id == AiAppClient.client_id)
    db.execute(delete(AiAppClient).where(AiAppClient.created_at < utcnow() - UNUSED_CLIENT_TTL, unused))
    db.add(AiAppClient(client_id=info.client_id, info=info.model_dump(mode="json"), ip=ip))
    db.commit()


def get_client(db: Session, client_id: str) -> OAuthClientInformationFull | None:
    row = db.get(AiAppClient, client_id) if len(client_id) <= 64 else None
    return OAuthClientInformationFull.model_validate(row.info) if row is not None else None


def app_name(client: OAuthClientInformationFull) -> str:
    """The name the app gave itself, on one line and short; UNNAMED_APP when it gave none."""
    name = " ".join((client.client_name or "").split())[:APP_NAME_MAX]
    return name or UNNAMED_APP


def host_of(uri: str) -> str:
    """Where a redirect URI sends the student: its host ('claude.ai'), or the scheme of an app's own link
    ('cursor:')."""
    parts = urlsplit(uri)
    return (parts.hostname or f"{parts.scheme}:")[:255]


# ── connections and codes ────────────────────────────────────────────────────────────────────


def connect(
    db: Session,
    user: User,
    client: OAuthClientInformationFull,
    *,
    redirect_uri: str,
    redirect_uri_explicit: bool,
    code_challenge: str,
    scopes: list[str],
) -> str:
    """The student said yes: their connection to the app (one per app; a second yes keeps it, with its tokens) and
    a one-time code for it, returned once."""
    conn = db.scalar(
        select(AiAppConnection).where(AiAppConnection.user_id == user.id, AiAppConnection.client_id == client.client_id)
    )
    if conn is None:
        conn = AiAppConnection(
            user_id=user.id,
            client_id=client.client_id,
            app_name=app_name(client),
            redirect_host=host_of(redirect_uri),
        )
        db.add(conn)
        db.flush()
    code = new_token()
    db.add(
        AiAppCode(
            code_hash=hash_token(code),
            connection_id=conn.id,
            code_challenge=code_challenge,
            redirect_uri=redirect_uri,
            redirect_uri_explicit=redirect_uri_explicit,
            scopes=" ".join(scopes),
            expires_at=utcnow() + CODE_TTL,
        )
    )
    db.commit()
    return code


@dataclass(frozen=True)
class _Owner:
    connection: AiAppConnection
    user: User


def _owner(db: Session, connection_id: uuid.UUID, client_id: str | None = None) -> _Owner | None:
    """The connection and its student, while the student may use AI apps: an active account the mcp switch is on
    for. None otherwise, or when the connection isn't the app's."""
    conn = db.get(AiAppConnection, connection_id)
    if conn is None or (client_id is not None and conn.client_id != client_id):
        return None
    user = db.get(User, conn.user_id)
    if user is None or user.status == UserStatus.suspended or not access.feature_on(db, user, Feature.mcp):
        return None
    return _Owner(conn, user)


def _stamp(at: datetime) -> int:
    return int(at.timestamp())


def take_code(db: Session, client_id: str, code: str) -> AuthorizationCode | None:
    """The code, spent: it can't be read a second time, even when the token request then fails."""
    row = db.get(AiAppCode, hash_token(code)) if len(code) <= 200 else None
    if row is None:
        return None
    db.delete(row)
    db.commit()
    owner = _owner(db, row.connection_id, client_id)
    if owner is None:
        return None
    return AuthorizationCode(
        code=code,
        scopes=row.scopes.split(),
        expires_at=row.expires_at.timestamp(),
        client_id=client_id,
        code_challenge=row.code_challenge,
        redirect_uri=AnyUrl(row.redirect_uri),
        redirect_uri_provided_explicitly=row.redirect_uri_explicit,
        subject=str(row.connection_id),
    )


def issue(db: Session, connection_id: uuid.UUID, scopes: list[str]) -> OAuthToken:
    """A new access token and refresh token for the connection."""
    now = utcnow()
    access_token, refresh_token = new_token(), new_token()
    scope = " ".join(scopes)
    db.add_all(
        [
            AiAppToken(
                token_hash=hash_token(access_token),
                connection_id=connection_id,
                kind="access",
                scopes=scope,
                expires_at=now + ACCESS_TTL,
            ),
            AiAppToken(
                token_hash=hash_token(refresh_token),
                connection_id=connection_id,
                kind="refresh",
                scopes=scope,
                expires_at=now + REFRESH_TTL,
            ),
        ]
    )
    db.execute(delete(AiAppToken).where(AiAppToken.connection_id == connection_id, AiAppToken.expires_at <= now))
    db.commit()
    return OAuthToken(
        access_token=access_token,
        token_type="Bearer",  # noqa: S106 (the token type, not a password)
        expires_in=int(ACCESS_TTL.total_seconds()),
        scope=scope,
        refresh_token=refresh_token,
    )


def _token(db: Session, token: str, kind: str) -> AiAppToken | None:
    row = db.get(AiAppToken, hash_token(token)) if len(token) <= 200 else None
    if row is None or row.kind != kind or row.expires_at <= utcnow():
        return None
    return row


def load_refresh(db: Session, client_id: str, token: str) -> RefreshToken | None:
    row = _token(db, token, "refresh")
    if row is None or _owner(db, row.connection_id, client_id) is None:
        return None
    return RefreshToken(
        token=token,
        client_id=client_id,
        scopes=row.scopes.split(),
        expires_at=_stamp(row.expires_at),
        subject=str(row.connection_id),
    )


def rotate(db: Session, refresh: RefreshToken, scopes: list[str]) -> OAuthToken:
    """A new pair for a refresh token, which is spent."""
    row = _token(db, refresh.token, "refresh")
    if row is None:
        raise TokenError("invalid_grant", "This refresh token was used or removed.")
    connection_id = row.connection_id
    db.delete(row)
    db.flush()
    return issue(db, connection_id, scopes)


def load_access(db: Session, token: str, resource: str) -> AccessToken | None:
    """The access token, while it is live, its connection kept and its student allowed to use AI apps. `subject` is
    the student's id and `claims["connection"]` the connection's."""
    row = _token(db, token, "access")
    owner = _owner(db, row.connection_id) if row is not None else None
    if row is None or owner is None:
        return None
    return AccessToken(
        token=token,
        client_id=owner.connection.client_id,
        scopes=row.scopes.split(),
        expires_at=_stamp(row.expires_at),
        resource=resource,
        subject=str(owner.user.id),
        claims={"connection": str(owner.connection.id)},
    )


def revoke(db: Session, token: str) -> None:
    """An app signing itself out (RFC 7009): every token of the token's connection goes. The connection stays in
    Settings until the student removes it."""
    row = db.get(AiAppToken, hash_token(token)) if len(token) <= 200 else None
    if row is not None:
        db.execute(delete(AiAppToken).where(AiAppToken.connection_id == row.connection_id))
        db.commit()


# ── the student's side ───────────────────────────────────────────────────────────────────────


def connections_of(db: Session, user: User) -> list[AiAppConnection]:
    return list(
        db.scalars(
            select(AiAppConnection)
            .where(AiAppConnection.user_id == user.id)
            .order_by(AiAppConnection.created_at.desc(), AiAppConnection.id)
        )
    )


def remove(db: Session, user: User, connection_id: uuid.UUID) -> None:
    """Removes one of the student's connections, with its codes and tokens (404 when it isn't theirs)."""
    conn = db.get(AiAppConnection, connection_id)
    if conn is None or conn.user_id != user.id:
        raise not_found("This AI app isn't connected to your account.")
    db.delete(conn)
    db.commit()


# ── calls ────────────────────────────────────────────────────────────────────────────────────


def count_call(db: Session, user: User, connection_id: uuid.UUID | None) -> None:
    """One tool call by an app as the student: within CALLS_PER_WINDOW per CALL_WINDOW and CALLS_PER_DAY a day
    (429 rate_limited), counted by time only. The student's calls over a day old go."""
    now = utcnow()
    where: list[Any] = [AiAppCall.user_id == user.id]
    message = "The Hub has answered a lot for this account. Try again in {}."
    ratelimit.enforce(
        db,
        f"ai-apps:calls:{user.id}",
        AiAppCall.created_at,
        where,
        limit=CALLS_PER_WINDOW,
        window=CALL_WINDOW,
        message=message,
    )
    day = timedelta(days=1)
    wait = ratelimit.window_wait(db, AiAppCall.created_at, where, limit=CALLS_PER_DAY, window=day, now=now)
    if wait:
        raise rate_limited(wait, message.format(ratelimit.human_wait(wait)))
    db.execute(delete(AiAppCall).where(AiAppCall.user_id == user.id, AiAppCall.created_at < now - timedelta(days=1)))
    db.add(AiAppCall(user_id=user.id, created_at=now))
    if connection_id is not None:
        conn = db.get(AiAppConnection, connection_id)
        if conn is not None and (conn.last_used_at is None or now - conn.last_used_at > TOUCH_EVERY):
            conn.last_used_at = now
    db.commit()
