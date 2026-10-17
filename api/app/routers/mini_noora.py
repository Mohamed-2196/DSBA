"""Mini Noora's words: her script (public: what she says without her AI, and the questions and cards she offers) and,
for admins, her prompt with the script, edited in Manage → Mini Noora. Her AI answers are app/routers/noora.py."""

from __future__ import annotations

from typing import Annotated

from fastapi import Request

from app.core.access import Feature
from app.core.security import DB, client_ip, needs_feature, requires_admin
from app.models import User
from app.routers._base import router_for
from app.schemas.mini_noora import NooraEditable, NooraPromptAssembled, NooraPromptPreview, NooraSave, NooraScript
from app.services.noora import settings

router = router_for("noora", needs_feature(Feature.noora))

Admin = Annotated[User, requires_admin()]


@router.get("/mini-noora/script", response_model=NooraScript)
def noora_script(db: DB) -> NooraScript:
    """What she says when she answers from her script, the questions she offers on each page, and the cards of her
    full page."""
    return settings.script(db)


@router.get("/mini-noora/settings", response_model=NooraEditable)
def noora_settings(db: DB, _: Admin) -> NooraEditable:
    """Her prompt and script with the version a save names (0 until the first save), and the rules that always follow
    her instructions."""
    return settings.editable(db)


@router.put("/mini-noora/settings", response_model=NooraEditable)
def save_noora_settings(body: NooraSave, request: Request, user: Admin, db: DB) -> NooraEditable:
    """Save her prompt and script, if nobody saved them since `version`. Audited with what changed, before and after.

    Errors: noora_changed (409: someone saved them since: load them again), invalid_input (422: a field that doesn't
    fit, <hub_data> or <student_note> in her instructions or facts, a placeholder other than {module} and {module2},
    a page listed twice or without the questions for every other page, an id used twice)."""
    out = settings.save(db, user, body.data, body.version, client_ip(request))
    db.commit()
    return out


@router.post("/mini-noora/settings/preview", response_model=NooraPromptAssembled)
def preview_noora_prompt(body: NooraPromptPreview, user: Admin, db: DB) -> NooraPromptAssembled:
    """The prompt her AI would read with these instructions and facts: for a Year 2 student on Home today, from the
    hub's own modules and calendar. Nothing is saved."""
    return settings.assembled(db, user, body.prompt)
