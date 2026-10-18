"""The grades calculator's rules (admins edit them in Manage → Grades calculator): one document edited whole
(services/documents.py). Every module they name must exist. The calculator applies them in the browser; students'
marks never reach the server. Services leave the commit to the handler."""

from __future__ import annotations

from sqlalchemy.orm import Session

from app.core.errors import invalid
from app.models import User
from app.schemas.grades import GradeRules, GradeRulesEditable
from app.services import documents
from app.services.documents import Kind
from app.services.modules import unknown_modules

RULES: Kind[GradeRules] = Kind(
    key="grades",
    model=GradeRules,
    seed="grades",
    title="Grades calculator",
    action="grades.rules",
    changed="grades_changed",
    changed_message="Someone saved the grades calculator's rules after you opened them. Load them again, then make "
    "your changes.",
)


def rules(db: Session) -> GradeRules:
    return documents.current(db, RULES)


def editable(db: Session) -> GradeRulesEditable:
    return GradeRulesEditable.model_validate(documents.editable(db, RULES), from_attributes=True)


def save(db: Session, user: User, data: GradeRules, version: int, ip: str | None) -> GradeRulesEditable:
    """Saves the rules (409 grades_changed when someone saved them since `version`), audited with what changed. Every
    module they name must exist (422)."""
    missing = unknown_modules(db, data.module_refs())
    if missing:
        raise invalid("data", f"There is no module “{missing[0]}”. Choose one from the list.")
    return GradeRulesEditable.model_validate(documents.save(db, user, RULES, data, version, ip), from_attributes=True)
