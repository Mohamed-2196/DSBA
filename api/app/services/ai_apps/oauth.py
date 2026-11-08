"""The OAuth 2.1 authorization server for AI apps: the MCP SDK's routes (mcp.server.auth) over the Hub's own store.

The SDK checks every request's shape: the app is registered, the redirect URI is one it registered, PKCE (S256) is
there and the code verifier matches, scopes are among those the app registered. This provider keeps the apps,
codes and tokens (store.py) and sends the student to the Hub's page to say yes (consent.py).

The provider is async and the database sync, so each call runs in a worker thread with a session of its own. Which
session factory it uses and the client's address come from the request (server.py sets them), so the tests' session
and dependency override reach it."""

from __future__ import annotations

import uuid
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from contextvars import ContextVar
from functools import partial
from typing import TypeVar

import anyio.to_thread
from mcp.server.auth.provider import (
    AccessToken,
    AuthorizationCode,
    AuthorizationParams,
    AuthorizeError,
    OAuthAuthorizationServerProvider,
    RefreshToken,
    RegistrationError,
)
from mcp.shared.auth import OAuthClientInformationFull, OAuthToken
from sqlalchemy.orm import Session

from app.core.errors import ApiError
from app.db import get_db
from app.services.ai_apps import consent, store

T = TypeVar("T")
DbFactory = Callable[[], Iterator[Session]]  # get_db, or a test's override of it

db_factory: ContextVar[DbFactory] = ContextVar("ai_apps_db_factory", default=get_db)
client_ip: ContextVar[str | None] = ContextVar("ai_apps_client_ip", default=None)


@contextmanager
def session() -> Iterator[Session]:
    """A session from the request's factory (get_db, or a test's override), closed afterwards."""
    gen = db_factory.get()()
    db = next(gen)
    try:
        yield db
    finally:
        close = getattr(gen, "close", None)  # a generator: runs get_db's finally
        if close is not None:
            close()


def _with_session(fn: Callable[..., T], *args: object) -> T:
    with session() as db:
        return fn(db, *args)


async def run(fn: Callable[..., T], *args: object) -> T:
    """fn(db, *args) in a worker thread, with a session of its own."""
    return await anyio.to_thread.run_sync(partial(_with_session, fn, *args))


def same_resource(asked: str | None, resource: str) -> bool:
    return asked is None or asked.rstrip("/") == resource.rstrip("/")


class HubAuthProvider(OAuthAuthorizationServerProvider[AuthorizationCode, RefreshToken, AccessToken]):
    def __init__(self, resource: str) -> None:
        self.resource = resource  # the MCP server's address: the only resource its tokens are for

    async def get_client(self, client_id: str) -> OAuthClientInformationFull | None:
        return await run(store.get_client, client_id)

    async def register_client(self, client_info: OAuthClientInformationFull) -> None:
        ip = client_ip.get()
        try:
            await run(store.register_client, client_info, ip)
        except ApiError as e:  # too many from this address
            raise RegistrationError("invalid_client_metadata", e.message) from None

    async def authorize(self, client: OAuthClientInformationFull, params: AuthorizationParams) -> str:
        if not same_resource(params.resource, self.resource):
            raise AuthorizeError("invalid_target", "This server's tokens are for its MCP address only.")
        if params.scopes and any(s != store.SCOPE for s in params.scopes):
            raise AuthorizeError("invalid_scope", f"The only scope is {store.SCOPE}.")
        return consent.page_url(consent.sign(client, params))

    async def load_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: str
    ) -> AuthorizationCode | None:
        return await run(store.take_code, client.client_id, authorization_code)

    async def exchange_authorization_code(
        self, client: OAuthClientInformationFull, authorization_code: AuthorizationCode
    ) -> OAuthToken:
        assert authorization_code.subject is not None  # take_code sets the connection
        return await run(store.issue, uuid.UUID(authorization_code.subject), authorization_code.scopes)

    async def load_refresh_token(self, client: OAuthClientInformationFull, refresh_token: str) -> RefreshToken | None:
        return await run(store.load_refresh, client.client_id, refresh_token)

    async def exchange_refresh_token(
        self, client: OAuthClientInformationFull, refresh_token: RefreshToken, scopes: list[str]
    ) -> OAuthToken:
        return await run(store.rotate, refresh_token, scopes)

    async def load_access_token(self, token: str) -> AccessToken | None:
        return await run(store.load_access, token, self.resource)

    async def revoke_token(self, token: AccessToken | RefreshToken) -> None:
        await run(store.revoke, token.token)
