"""AI apps reading the Hub as a student (services/ai_apps): the student's yes or no on /connect-ai, and the apps
connected to their account, which they can remove. The MCP server itself and its OAuth routes are under /api/mcp
(services/ai_apps/server.py)."""

from __future__ import annotations

from typing import Annotated
from uuid import UUID

from fastapi import Query, Response, status
from sqlalchemy import and_, or_, select

from app.core.access import Feature
from app.core.security import DB, ActiveUser, CurrentUser, needs_feature
from app.models import AiAppConnection
from app.routers._base import router_for
from app.schemas.ai_apps import CONSENT_REQUEST_MAX, ConnectedApp, ConsentAnswer, ConsentAsk, ConsentRedirect
from app.services.ai_apps import consent, store

router = router_for("ai-apps", needs_feature(Feature.mcp))


@router.get("/ai-apps/consent", response_model=ConsentAsk)
def ask(
    db: DB, user: CurrentUser, request: Annotated[str, Query(min_length=1, max_length=CONSENT_REQUEST_MAX)]
) -> ConsentAsk:
    """The app asking to read the Hub as the student, from the signed request /api/mcp/authorize sent them with.

    Errors: invalid_input (422: the request is out of date, or not the Hub's)."""
    a = consent.asking(db, request)
    name, host = store.app_name(a.client), store.host_of(a.request.redirect_uri)
    # the same app, or one with its name and host: apps like Claude register again when they reconnect
    same = or_(
        AiAppConnection.client_id == a.client.client_id,
        and_(AiAppConnection.app_name == name, AiAppConnection.redirect_host == host),
    )
    connected = db.scalar(select(AiAppConnection.id).where(AiAppConnection.user_id == user.id, same).limit(1))
    return ConsentAsk(app_name=name, redirect_host=host, already_connected=connected is not None)


@router.post("/ai-apps/consent", response_model=ConsentRedirect)
def answer(body: ConsentAnswer, db: DB, user: ActiveUser) -> ConsentRedirect:
    """The student's answer. Yes connects the app (read-only) and gives it a one-time code; either way the web app
    sends the student to `redirectUrl`, back to the app. Errors: invalid_input (422: out of date)."""
    return ConsentRedirect(redirect_url=consent.answer(db, user, body.request, allow=body.allow))


@router.get("/ai-apps", response_model=list[ConnectedApp])
def connected(db: DB, user: CurrentUser) -> list[ConnectedApp]:
    """The AI apps connected to your account, the newest first."""
    return [
        ConnectedApp(
            id=c.id,
            app_name=c.app_name,
            redirect_host=c.redirect_host,
            connected_at=c.created_at,
            last_used_at=c.last_used_at,
        )
        for c in store.connections_of(db, user)
    ]


@router.delete("/ai-apps/{connection_id}", status_code=status.HTTP_204_NO_CONTENT)
def disconnect(connection_id: UUID, db: DB, user: CurrentUser) -> Response:
    """Removes an app from your account: its tokens stop working at once. Errors: not_found (404)."""
    store.remove(db, user, connection_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
