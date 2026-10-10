"""The module catalogue and lessons. Owner: content agent."""

from __future__ import annotations

from app.core.security import DB
from app.routers._base import router_for
from app.schemas.common import Year
from app.schemas.modules import ModuleDetail, ModuleSummary

router = router_for("modules")


@router.get("/modules", response_model=list[ModuleSummary])
def list_modules(db: DB, year: Year | None = None) -> list[ModuleSummary]:
    raise NotImplementedError


@router.get("/modules/{module_id}", response_model=ModuleDetail)
def get_module(module_id: str, db: DB) -> ModuleDetail:
    raise NotImplementedError
