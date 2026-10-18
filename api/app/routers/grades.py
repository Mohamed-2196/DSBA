"""The grades calculator's rules: public to read (the calculator applies them in the browser, and students' marks
never reach the server), edited by admins."""

from __future__ import annotations

from typing import Annotated

from fastapi import Request

from app.core.access import Feature
from app.core.security import DB, client_ip, needs_feature, requires_admin
from app.models import User
from app.routers._base import router_for
from app.schemas.grades import GradeRules, GradeRulesEditable, GradeRulesSave
from app.services import grades as svc

router = router_for("grades", needs_feature(Feature.grades))
Admin = Annotated[User, requires_admin()]


@router.get("/grades/rules", response_model=GradeRules)
def grade_rules(db: DB) -> GradeRules:
    """The subjects and what each counts, the mark bands, what each class needs, and the modules a student chooses
    between."""
    return svc.rules(db)


@router.get("/grades/rules/edit", response_model=GradeRulesEditable)
def grade_rules_for_editing(db: DB, _: Admin) -> GradeRulesEditable:
    """The rules with the version a save names (0 until the first save)."""
    return svc.editable(db)


@router.put("/grades/rules", response_model=GradeRulesEditable)
def save_grade_rules(body: GradeRulesSave, request: Request, user: Admin, db: DB) -> GradeRulesEditable:
    """Save the rules, if nobody saved them since `version`. Audited with what changed, before and after.

    Errors: grades_changed (409: someone saved them since: load them again), invalid_input (422: a field that doesn't
    fit, bands out of order, more marks needed than the subjects give, a choice without options, a module that
    doesn't exist, an id used twice)."""
    out = svc.save(db, user, body.data, body.version, client_ip(request))
    db.commit()
    return out
