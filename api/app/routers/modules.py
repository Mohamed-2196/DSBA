"""The module catalogue and lessons. Owner: content agent."""

from __future__ import annotations

from app.core.access import Feature
from app.core.pagination import YearParam
from app.core.security import DB, OptionalUser
from app.routers._base import router_for
from app.schemas.modules import ModuleDetail, ModuleSummary
from app.services import access
from app.services import modules as svc

router = router_for("modules")


@router.get("/modules", response_model=list[ModuleSummary])
def list_modules(db: DB, user: OptionalUser, year: YearParam | None = None) -> list[ModuleSummary]:
    """Every module, in programme order, with its published library count (None while the library is off for you)."""
    return svc.list_modules(db, year, library=access.feature_on(db, user, Feature.library))


@router.get("/modules/{module_id}", response_model=ModuleDetail)
def get_module(module_id: str, db: DB, user: OptionalUser) -> ModuleDetail:
    return svc.module_detail(db, module_id, library=access.feature_on(db, user, Feature.library))
