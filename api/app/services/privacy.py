"""Which outside services handle people's data right now. The privacy notice (/privacy in the web app) names some
services only while they do: Anthropic for Mini Noora's answers and for the forum's automatic check, and the AI apps
a student may connect. Each flag follows the switch the sending code itself checks, so the notice never says less
than what is sent (COM-280): noora.ai for POST /noora/ask, forum.auto-check for the checker, which keeps working
through its queue after the forum is switched off. A switch counts while it is on for anyone (everyone, or some
roles). AI apps also count while an active admin exists, because admins keep "Connect an AI app" while it is off."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.config import get_settings
from app.core.access import Feature
from app.schemas.access import PrivacyOut
from app.services import access


def _on(db: Session, feature: Feature) -> bool:
    s = access.switches(db).get(feature)
    return s is not None and s.mode != "off"


def services(db: Session) -> PrivacyOut:
    ai = get_settings().anthropic_api_key is not None  # without a key nothing is sent, whatever the switches say
    return PrivacyOut(
        noora_answers=ai and _on(db, Feature.noora_ai),
        forum_check=ai and _on(db, Feature.forum_auto_check),
        ai_apps=_on(db, Feature.mcp) or access.any_active_admin(db),
    )
