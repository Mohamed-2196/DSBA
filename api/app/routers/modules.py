"""The module catalogue and lessons. Owner: content agent."""

from __future__ import annotations

from app.core.pagination import YearParam
from app.core.security import DB
from app.routers._base import router_for
from app.schemas.modules import ModuleDetail, ModuleSummary
from app.services import modules as svc

router = router_for("modules")


@router.get("/modules", response_model=list[ModuleSummary])
def list_modules(db: DB, year: YearParam | None = None) -> list[ModuleSummary]:
    """Every module, in programme order, with its published library count."""
    return svc.list_modules(db, year)


@router.get("/modules/{module_id}", response_model=ModuleDetail)
def get_module(module_id: str, db: DB) -> ModuleDetail:
    return svc.module_detail(db, module_id)
