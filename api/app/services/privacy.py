"""Which outside services handle people's data right now. The privacy notice (/privacy in the web app) names some
services only while they do: Anthropic for Mini Noora's answers and for the forum's automatic check, and the AI apps
a student may connect. A switch counts while it is on for anyone (everyone, or some roles)."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.access import Feature
from app.schemas.access import PrivacyOut
from app.services import access


def _on(db: Session, *features: Feature) -> bool:
    states = access.switches(db)
    return all((s := states.get(f)) is not None and s.mode != "off" for f in features)


def services(db: Session) -> PrivacyOut:
    ai = get_settings().anthropic_api_key is not None  # without a key nothing is sent, whatever the switches say
    return PrivacyOut(
        noora_answers=ai and _on(db, Feature.noora, Feature.noora_ai),
        forum_check=ai and _on(db, Feature.forum, Feature.forum_auto_check),
        ai_apps=_on(db, Feature.mcp),
    )
