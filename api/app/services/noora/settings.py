"""Mini Noora's words (admins edit them in Manage → Mini Noora): her prompt (instructions and programme facts) and her
script, one document edited whole (services/documents.py). The prompt never leaves the API except to its editors;
the script is public. Services leave the commit to the handler."""

from __future__ import annotations

import math

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.access import Feature
from app.core.time import bahrain_today
from app.models import Module, User
from app.schemas.mini_noora import NooraDoc, NooraEditable, NooraPrompt, NooraPromptAssembled, NooraScript
from app.services import access, documents
from app.services.calendar import events_query
from app.services.documents import Editable, Kind
from app.services.noora import prompt

NOORA: Kind[NooraDoc] = Kind(
    key="noora",
    model=NooraDoc,
    seed="noora",
    title="Mini Noora",
    action="noora.update",
    changed="noora_changed",
    changed_message="Someone saved Mini Noora after you opened her settings. Load them again, then make your changes.",
)
PREVIEW_YEAR = 2  # the example student of the preview
CHARS_PER_TOKEN = 3  # as ask.py estimates a prompt's tokens


def words(db: Session) -> NooraPrompt:
    """Her instructions and the programme facts, as saved (or their starting content)."""
    return documents.current(db, NOORA).prompt


def script(db: Session) -> NooraScript:
    return documents.current(db, NOORA).script


def editable(db: Session) -> NooraEditable:
    return _out(documents.editable(db, NOORA))


def save(db: Session, user: User, doc: NooraDoc, version: int, ip: str | None) -> NooraEditable:
    """Saves the document (409 noora_changed when someone saved it since `version`), audited with what changed."""
    return _out(documents.save(db, user, NOORA, doc, version, ip))


def _out(saved: Editable[NooraDoc]) -> NooraEditable:
    return NooraEditable(
        data=saved.data,
        version=saved.version,
        updated_at=saved.updated_at,
        updated_by=saved.updated_by,
        fixed_rules=prompt.FIXED_RULES,
    )


def assembled(db: Session, admin: User, draft: NooraPrompt) -> NooraPromptAssembled:
    """The prompt her AI would read with `draft`, for a Year 2 student on Home today with every feature on that the
    admin has, from the hub's own modules and calendar."""
    modules = list(db.scalars(select(Module).where(Module.hidden.is_(False))))
    stable = prompt.stable_block(modules, access.features_on(db, admin), draft)
    today = bahrain_today()
    dates = None
    if access.feature_on(db, admin, Feature.calendar):
        dates = list(db.scalars(events_query(start=today, year=PREVIEW_YEAR).limit(prompt.CALENDAR_DATES)))
    screen = prompt.screen_block(
        prompt.Screen(today=today, year=PREVIEW_YEAR, route="/", module=None, lesson_id=None, dates=dates)
    )
    return NooraPromptAssembled(
        stable=stable, screen=screen, tokens=math.ceil((len(stable) + len(screen)) / CHARS_PER_TOKEN)
    )
