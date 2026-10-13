from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from app.schemas.common import ErrorResponse

# Every route documents the error shape (see app/core/errors.py).
ERRORS = {code: {"model": ErrorResponse} for code in (400, 401, 403, 404, 409, 422, 429)}


def router_for(tag: str, *dependencies: Any) -> APIRouter:
    """A router for one area. `dependencies` run before every one of its routes, e.g. needs_feature(Feature.forum)."""
    return APIRouter(tags=[tag], responses=ERRORS, dependencies=list(dependencies))  # type: ignore[arg-type]
