"""AI apps connected to a student's account through the Hub's MCP server (services/ai_apps)."""

from __future__ import annotations

from datetime import datetime
from uuid import UUID

from pydantic import Field

from app.schemas.common import ApiModel

CONSENT_REQUEST_MAX = 4000


class ConsentAsk(ApiModel):
    """What the page asks the student: an app (by the name it gave itself, and where it sends them back) wants to
    read the Hub as them."""

    app_name: str
    redirect_host: str  # 'claude.ai': who the app really is
    already_connected: bool


class ConsentAnswer(ApiModel):
    request: str = Field(min_length=1, max_length=CONSENT_REQUEST_MAX)
    allow: bool


class ConsentRedirect(ApiModel):
    redirect_url: str  # back to the app: with a code, or with access_denied


class ConnectedApp(ApiModel):
    id: UUID
    app_name: str
    redirect_host: str
    connected_at: datetime
    last_used_at: datetime | None
